const { randomUUID } = require('node:crypto');
const { getPool, withTransaction } = require('../config/db');
const { rowToDoc, round2, round4 } = require('../db/helpers');
const { localDay, dayStart } = require('../db/dates');
const { ApiError } = require('../middleware/errorHandler');
const { createMovementOnClient, lockProduct } = require('./stockLedger');

const chargeSelect = `SELECT c.*, COALESCE(a.paid,0) AS paid,
  CASE WHEN c.voided_at IS NULL THEN c.amount-COALESCE(a.paid,0) ELSE 0 END AS outstanding
  FROM supplier_charges c LEFT JOIN (
    SELECT a.charge_id,SUM(a.amount) AS paid FROM supplier_allocations a
    JOIN supplier_payments p ON p.id=a.payment_id WHERE p.voided_at IS NULL GROUP BY a.charge_id
  ) a ON a.charge_id=c.id`;

const lockSupplier = async (client, id, businessId) => {
  const { rows } = await client.query('SELECT * FROM suppliers WHERE id=$1 AND business_id=$2 FOR UPDATE', [id,businessId]);
  if (!rows[0]) throw new ApiError(404,'Supplier not found');
  return rows[0];
};
const chargesFor = async (client,id,businessId) => (await client.query(
  `${chargeSelect} WHERE c.supplier_id=$1 AND c.business_id=$2 ORDER BY c.due_date,c.occurred_at,c.id`, [id,businessId]
)).rows;
const checkPastDate = (date) => {
  dayStart(date);
  if (date > localDay()) throw new ApiError(400,'A recorded purchase or payment cannot be dated in the future.');
};

// Request identities serialize across suppliers too, so a reused request cannot
// race a unique constraint after its stock or cash writes have begun.
const lockRequest = (client,businessId,requestId) => client.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`supplier:${businessId}:${requestId}`]
);

const listSuppliers = async (businessId) => {
  const { rows } = await getPool().query(`SELECT s.*,
    COALESCE(SUM(c.amount) FILTER (WHERE c.voided_at IS NULL AND c.charge_type='purchase'),0) AS total_purchased,
    COALESCE(SUM(c.paid),0) AS total_paid, COALESCE(SUM(c.outstanding),0) AS balance,
    COALESCE(SUM(c.outstanding) FILTER (WHERE c.due_date < $2::date),0) AS overdue,
    MIN(c.due_date) FILTER (WHERE c.outstanding>0) AS next_due_date,
    COUNT(c.id) FILTER (WHERE c.outstanding>0)::int AS open_bills
    FROM suppliers s LEFT JOIN (${chargeSelect}) c ON c.supplier_id=s.id
    WHERE s.business_id=$1 GROUP BY s.id ORDER BY overdue DESC,balance DESC,s.name`,[businessId,localDay()]);
  return rows.map(rowToDoc);
};

const buildStatement = (charges,payments,{startDate,endDate}={}) => {
  if (startDate) dayStart(startDate);
  if (endDate) dayStart(endDate);
  if (startDate && endDate && startDate>endDate) throw new ApiError(400,'Start date must be before the end date.');
  const events = [
    ...charges.map(c=>({id:c.id,date:localDay(new Date(c.occurred_at)),sortAt:new Date(c.created_at || c.occurred_at).getTime(),sortKind:0,
      description:c.description,reference:c.reference,dueDate:c.due_date,debit:c.voided_at ? 0 : Number(c.amount),credit:0,voidedAt:c.voided_at,voidReason:c.void_reason})),
    ...payments.map(p=>({id:p.id,date:p.payment_date,sortAt:new Date(p.created_at).getTime(),sortKind:1,
      description:`Payment - ${p.method}`,reference:p.reference,debit:0,credit:p.voided_at ? 0 : Number(p.amount),voidedAt:p.voided_at,voidReason:p.void_reason})),
  ].sort((a,b)=>a.date.localeCompare(b.date) || a.sortAt-b.sortAt || a.sortKind-b.sortKind || a.id.localeCompare(b.id));
  let balance=0,openingBalance=0,totalCharges=0,totalPayments=0;
  const rows=[];
  for (const event of events) {
    if (endDate && event.date>endDate) continue;
    balance=round2(balance+event.debit-event.credit);
    if (startDate && event.date<startDate) { openingBalance=balance; continue; }
    totalCharges=round2(totalCharges+event.debit);totalPayments=round2(totalPayments+event.credit);
    const {sortAt,sortKind,...row}=event;
    rows.push({...row,balance});
  }
  return {startDate:startDate || null,endDate:endDate || null,openingBalance,totalCharges,totalPayments,closingBalance:balance,rows};
};

const agingFor = (charges,today=localDay()) => {
  const result={current:0,days1to30:0,days31to60:0,days61to90:0,daysOver90:0};
  for(const charge of charges) {
    const days=Math.floor((Date.parse(`${today}T12:00:00Z`)-Date.parse(`${charge.due_date}T12:00:00Z`))/86400000);
    const key=days<=0 ? 'current' : days<=30 ? 'days1to30' : days<=60 ? 'days31to60' : days<=90 ? 'days61to90' : 'daysOver90';
    result[key]=round2(result[key]+Number(charge.outstanding));
  }
  return result;
};

const supplierDetail = (id,businessId,range={}) => withTransaction(async(client)=>{
  const supplier=await lockSupplier(client,id,businessId);
  const charges=await chargesFor(client,id,businessId);
  const payments=(await client.query(`SELECT p.*,u.name AS recorded_by FROM supplier_payments p
    JOIN users u ON u.id=p.created_by WHERE p.supplier_id=$1 AND p.business_id=$2
    ORDER BY p.payment_date DESC,p.created_at DESC`,[id,businessId])).rows;
  return {supplier:rowToDoc(supplier),charges:charges.map(rowToDoc),payments:payments.map(rowToDoc),
    balance:round2(charges.reduce((sum,c)=>sum+Number(c.outstanding),0)),today:localDay(),
    aging:agingFor(charges),statement:buildStatement(charges,payments,range)};
});

const createSupplier = (data,businessId,user) => withTransaction(async(client)=>{
  const date=data.openingDate || localDay();checkPastDate(date);
  const {rows}=await client.query(`INSERT INTO suppliers (business_id,name,phone,notes,created_by)
    VALUES ($1,$2,$3,$4,$5) RETURNING *`,[businessId,data.name,data.phone || '',data.notes || '',user.id]);
  if(Number(data.openingBalance)>0) await client.query(`INSERT INTO supplier_charges
    (business_id,supplier_id,charge_type,amount,description,due_date,occurred_at)
    VALUES ($1,$2,'opening',$3,'Opening balance',$4,$5)`,[businessId,rows[0].id,data.openingBalance,data.dueDate || date,dayStart(date)]);
  return rowToDoc(rows[0]);
});
const updateSupplier = (id,data,businessId) => withTransaction(async(client)=>{
  await lockSupplier(client,id,businessId);
  return rowToDoc((await client.query('UPDATE suppliers SET name=$1,phone=$2,notes=$3 WHERE id=$4 AND business_id=$5 RETURNING *',
    [data.name,data.phone || '',data.notes || '',id,businessId])).rows[0]);
});

const insertPayment = async(client,supplier,data,businessId,user,charges)=>{
  const {rows}=await client.query(`INSERT INTO supplier_payments
    (business_id,supplier_id,request_id,amount,payment_date,method,reference,notes,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [businessId,supplier.id,data.requestId,data.amount,data.paymentDate,data.method,data.reference || '',data.notes || '',user.id]);
  let remaining=data.amount;
  for(const charge of charges) {
    const amount=round2(Math.min(remaining,Number(charge.outstanding)));
    if(amount<=0) continue;
    await client.query('INSERT INTO supplier_allocations(payment_id,charge_id,amount) VALUES ($1,$2,$3)',[rows[0].id,charge.id,amount]);
    remaining=round2(remaining-amount);
  }
  if(remaining!==0) throw new ApiError(409,'Supplier balance changed. Refresh and try again.');
  await client.query(`INSERT INTO cash_entries
    (business_id,direction,amount,category,purpose,party,reference,notes,source,supplier_payment_id,occurred_at,created_by,payment_method)
    VALUES ($1,'out',$2,'Supplier payment','Supplier payment',$3,$4,$5,'supplier',$6,$7,$8,$9)`,
    [businessId,data.amount,supplier.name,data.reference || '',data.notes || '',rows[0].id,dayStart(data.paymentDate),user.id,data.method]);
  return rowToDoc(rows[0]);
};

const recordPayment = (id,data,businessId,user) => withTransaction(async(client)=>{
  await lockRequest(client,businessId,data.requestId);
  const supplier=await lockSupplier(client,id,businessId);
  const previous=(await client.query('SELECT * FROM supplier_payments WHERE business_id=$1 AND request_id=$2',[businessId,data.requestId])).rows[0];
  if(previous) {
    if(previous.supplier_id!==id || Number(previous.amount)!==data.amount || previous.payment_date!==data.paymentDate ||
      previous.method!==data.method || previous.reference!==(data.reference || '') || previous.notes!==(data.notes || '')) {
      throw new ApiError(409,'This payment reference was already used for different details.');
    }
    return {...rowToDoc(previous),replayed:true};
  }
  checkPastDate(data.paymentDate);
  const charges=await chargesFor(client,id,businessId);
  const eligible=charges.filter(c=>localDay(new Date(c.occurred_at))<=data.paymentDate);
  const balance=round2(eligible.reduce((sum,c)=>sum+Number(c.outstanding),0));
  if(data.amount>balance) throw new ApiError(400,'Payment exceeds the unpaid bills available on this payment date.');
  return insertPayment(client,supplier,data,businessId,user,eligible);
});

const purchasePayload = (data) => ({product:data.product,quantity:round4(data.quantity),price:round4(data.price),
  purchaseDate:data.purchaseDate,dueDate:data.dueDate,amountPaid:Number(data.amountPaid || 0),method:data.method || 'cash',reference:data.reference || '',notes:data.notes || ''});
const recordPurchaseOnClient = async(client,id,data,businessId,user)=>{
  await lockRequest(client,businessId,data.requestId);
  const normalized=purchasePayload(data);
  const previous=(await client.query('SELECT * FROM supplier_charges WHERE business_id=$1 AND request_id=$2',[businessId,data.requestId])).rows[0];
  if(previous) {
    if(previous.supplier_id!==id || Object.keys(normalized).some(key=>previous.request_payload?.[key]!==normalized[key])) {
      throw new ApiError(409,'This purchase reference was already used for different details.');
    }
    return {...rowToDoc(previous),replayed:true};
  }
  // Product before party is the same lock order used by sales and corrections.
  const product=await lockProduct(client,data.product,businessId,true);
  const supplier=await lockSupplier(client,id,businessId);
  checkPastDate(data.purchaseDate);dayStart(data.dueDate);
  if(normalized.reference) {
    const duplicate=await client.query(`SELECT 1 FROM supplier_charges WHERE business_id=$1 AND supplier_id=$2
      AND charge_type='purchase' AND voided_at IS NULL AND lower(reference)=lower($3) LIMIT 1`,[businessId,id,normalized.reference]);
    if(duplicate.rows.length) throw new ApiError(409,'This supplier bill reference is already recorded. Open the existing bill or use a different reference.');
  }
  const total=round2(normalized.quantity*normalized.price);
  if(total<=0 || total>9999999999.99) throw new ApiError(400,'Purchase total must be positive and within the supported amount.');
  if(round4(Number(product.current_stock)+normalized.quantity)>9999999999.9999) throw new ApiError(400,'Purchase quantity exceeds the supported stock balance.');
  if(normalized.amountPaid>total) throw new ApiError(400,'Amount paid cannot exceed the purchase total.');
  const movement=await createMovementOnClient(client,{type:'stock_in',product:data.product,quantity:normalized.quantity,price:normalized.price,
    supplier:supplier.name,reference:normalized.reference,notes:normalized.notes,paymentType:'cash'},businessId,user);
  // Keep stock ordering at the actual posting time. The bill's purchase date is
  // independently backdated; rewriting stock chronology would invalidate counts.
  const {rows}=await client.query(`INSERT INTO supplier_charges
    (business_id,supplier_id,transaction_id,request_id,request_payload,charge_type,amount,description,reference,due_date,occurred_at)
    VALUES ($1,$2,$3,$4,$5,'purchase',$6,$7,$8,$9,$10) RETURNING *`,
    [businessId,id,movement.id,data.requestId,normalized,total,`${normalized.quantity} ${movement.unit} - ${movement.product.name}`.slice(0,200),
      normalized.reference,data.dueDate,dayStart(data.purchaseDate)]);
  let payment=null;
  if(normalized.amountPaid>0) payment=await insertPayment(client,supplier,{requestId:randomUUID(),amount:normalized.amountPaid,
    paymentDate:data.purchaseDate,method:normalized.method,reference:normalized.reference,notes:normalized.notes},businessId,user,[{...rows[0],outstanding:total}]);
  return {...rowToDoc(rows[0]),payment,transaction:movement};
};
const recordPurchase = (id,data,businessId,user) => withTransaction(client=>recordPurchaseOnClient(client,id,data,businessId,user));

const reversePayment = (id,paymentId,reason,businessId) => withTransaction(async(client)=>{
  await lockSupplier(client,id,businessId);
  const {rows}=await client.query(`UPDATE supplier_payments SET voided_at=NOW(),void_reason=$1
    WHERE id=$2 AND supplier_id=$3 AND business_id=$4 AND voided_at IS NULL RETURNING *`,[reason,paymentId,id,businessId]);
  if(!rows[0]) throw new ApiError(404,'Active supplier payment not found');
  await client.query('DELETE FROM cash_entries WHERE supplier_payment_id=$1 AND business_id=$2',[paymentId,businessId]);
  return rowToDoc(rows[0]);
});

const reverseCharge = (id,chargeId,reason,businessId) => withTransaction(async(client)=>{
  const initial=(await client.query(`SELECT c.*,t.product_id FROM supplier_charges c LEFT JOIN transactions t ON t.id=c.transaction_id
    WHERE c.id=$1 AND c.supplier_id=$2 AND c.business_id=$3`,[chargeId,id,businessId])).rows[0];
  if(!initial) throw new ApiError(404,'Supplier bill not found');
  const product=initial.product_id ? await lockProduct(client,initial.product_id,businessId) : null;
  await lockSupplier(client,id,businessId);
  const charge=(await chargesFor(client,id,businessId)).find(c=>c.id===chargeId && !c.voided_at);
  if(!charge) throw new ApiError(404,'Active supplier bill not found');
  if(Number(charge.paid)>0) throw new ApiError(409,'Reverse payments allocated to this bill before reversing it.');
  if(charge.transaction_id) {
    const movement=(await client.query('SELECT * FROM transactions WHERE id=$1 AND business_id=$2 FOR UPDATE',[charge.transaction_id,businessId])).rows[0];
    if(!movement || !product) throw new ApiError(409,'The linked stock receipt is unavailable.');
    const later=(await client.query(`SELECT 1 FROM transactions WHERE business_id=$1 AND product_id=$2
      AND type='adjustment' AND created_at >= $3 AND id<>$4 LIMIT 1`,[businessId,product.id,movement.created_at,movement.id])).rows;
    if(later.length) throw new ApiError(409,'Reverse later stock adjustments before reversing this purchase.');
    const stock=round4(Number(product.current_stock)-Number(movement.quantity));
    const labelled=(await client.query(`SELECT COALESCE(SUM(quantity),0) AS quantity FROM barcode_labels
      WHERE business_id=$1 AND product_id=$2 AND status='in_stock'`,[businessId,product.id])).rows[0].quantity;
    if(stock<0 || stock<Number(labelled)) throw new ApiError(409,'This rice has been sold or assigned to labelled packs. Restore that stock before reversing the purchase.');
    await client.query('UPDATE products SET current_stock=$1,updated_at=NOW() WHERE id=$2 AND business_id=$3',[stock,product.id,businessId]);
    await client.query('UPDATE supplier_charges SET transaction_id=NULL WHERE id=$1',[chargeId]);
    await client.query('DELETE FROM transactions WHERE id=$1 AND business_id=$2',[movement.id,businessId]);
  }
  return rowToDoc((await client.query('UPDATE supplier_charges SET voided_at=NOW(),void_reason=$1 WHERE id=$2 RETURNING *',[reason,chargeId])).rows[0]);
});

module.exports={listSuppliers,supplierDetail,createSupplier,updateSupplier,recordPurchase,recordPurchaseOnClient,recordPayment,reversePayment,reverseCharge,buildStatement,agingFor};
