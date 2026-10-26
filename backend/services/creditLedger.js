const { getPool, withTransaction } = require('../config/db');
const { rowToDoc, round2 } = require('../db/helpers');
const { localDay, dayStart } = require('../db/dates');
const { ApiError } = require('../middleware/errorHandler');

const chargeSelect = `SELECT c.*, COALESCE(a.paid,0) AS paid,
  CASE WHEN c.voided_at IS NULL THEN c.amount-COALESCE(a.paid,0) ELSE 0 END AS outstanding
  FROM credit_charges c LEFT JOIN (
    SELECT a.charge_id, SUM(a.amount) AS paid FROM credit_allocations a
    JOIN credit_payments p ON p.id=a.payment_id WHERE p.voided_at IS NULL GROUP BY a.charge_id
  ) a ON a.charge_id=c.id`;

const lockCustomer = async (client, id, businessId) => {
  const { rows } = await client.query('SELECT * FROM credit_customers WHERE id=$1 AND business_id=$2 FOR UPDATE', [id, businessId]);
  if (!rows[0]) throw new ApiError(404, 'Customer not found');
  return rows[0];
};
const chargesFor = async (client, id, businessId) => (await client.query(
  `${chargeSelect} WHERE c.customer_id=$1 AND c.business_id=$2 ORDER BY c.due_date, c.occurred_at, c.id`, [id, businessId]
)).rows;

const listCustomers = async (businessId) => {
  const { rows } = await getPool().query(`SELECT u.*,
    COALESCE(SUM(c.amount) FILTER (WHERE c.voided_at IS NULL),0) AS credit_given, COALESCE(SUM(c.paid),0) AS repaid,
    COALESCE(SUM(c.outstanding),0) AS balance,
    COALESCE(SUM(c.outstanding) FILTER (WHERE c.due_date < $2::date),0) AS overdue,
    MIN(c.due_date) FILTER (WHERE c.outstanding > 0) AS next_due_date,
    COUNT(c.id) FILTER (WHERE c.outstanding > 0)::int AS open_sales
    FROM credit_customers u LEFT JOIN (${chargeSelect}) c ON c.customer_id=u.id
    WHERE u.business_id=$1 GROUP BY u.id ORDER BY overdue DESC, balance DESC, u.name`, [businessId, localDay()]);
  return rows.map(rowToDoc);
};
const customerDetail = async (id, businessId) => withTransaction(async (client) => {
  // Same lock as every write: statement totals and history describe one state.
  const customer = await lockCustomer(client, id, businessId);
  const charges = await chargesFor(client, id, businessId);
  const payments = (await client.query(`SELECT p.*, u.name AS recorded_by FROM credit_payments p
    JOIN users u ON u.id=p.created_by WHERE p.customer_id=$1 AND p.business_id=$2
    ORDER BY p.payment_date DESC, p.created_at DESC`, [id, businessId])).rows;
  return { customer: rowToDoc(customer), charges: charges.map(c=>({...rowToDoc(c),occurredDate:localDay(new Date(c.occurred_at))})), payments: payments.map(rowToDoc),
    balance: round2(charges.reduce((sum, c) => sum + Number(c.outstanding), 0)), today: localDay() };
});
const createCustomer = (data, businessId, user) => withTransaction(async (client) => {
  const { rows } = await client.query(`INSERT INTO credit_customers (business_id,name,phone,notes,created_by)
    VALUES ($1,$2,$3,$4,$5) RETURNING *`, [businessId, data.name, data.phone || '', data.notes || '', user.id]);
  if (Number(data.openingBalance) > 0) {
    await client.query(`INSERT INTO credit_charges (business_id,customer_id,amount,description,due_date)
      VALUES ($1,$2,$3,'Opening balance',$4)`, [businessId, rows[0].id, data.openingBalance, data.dueDate || localDay()]);
  }
  return rowToDoc(rows[0]);
});
const recordPayment = (id, data, businessId, user) => withTransaction(async (client) => {
  const customer = await lockCustomer(client, id, businessId);
  const previous = (await client.query('SELECT *, payment_date::text AS payment_day FROM credit_payments WHERE business_id=$1 AND request_id=$2', [businessId, data.requestId])).rows[0];
  if (previous) {
    if (previous.customer_id !== id || Number(previous.amount) !== data.amount || previous.method !== data.method ||
        previous.payment_day !== data.paymentDate ||
        previous.reference !== (data.reference || '') || previous.notes !== (data.notes || '')) {
      throw new ApiError(409, 'This payment reference was already used. Refresh before recording another payment.');
    }
    return { ...rowToDoc(previous), replayed: true };
  }
  if (data.paymentDate > localDay()) throw new ApiError(400, 'A received payment cannot be dated in the future.');
  dayStart(data.paymentDate);
  const charges = await chargesFor(client, id, businessId);
  const balance = round2(charges.reduce((sum, c) => sum + Number(c.outstanding), 0));
  if (data.amount > balance) throw new ApiError(400, 'Payment exceeds the outstanding balance. Refresh the account and check the amount.');
  const { rows } = await client.query(`INSERT INTO credit_payments
    (business_id,customer_id,request_id,amount,payment_date,method,reference,notes,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [businessId,id,data.requestId,data.amount,data.paymentDate,data.method,data.reference || '',data.notes || '',user.id]);
  let remaining = data.amount;
  for (const charge of charges) {
    const amount = round2(Math.min(remaining, Number(charge.outstanding)));
    if (amount <= 0) continue;
    await client.query('INSERT INTO credit_allocations (payment_id,charge_id,amount) VALUES ($1,$2,$3)', [rows[0].id, charge.id, amount]);
    remaining = round2(remaining - amount);
  }
  await client.query(`INSERT INTO cash_entries (business_id,direction,amount,category,purpose,party,reference,notes,source,credit_payment_id,occurred_at,created_by,payment_method)
    VALUES ($1,'in',$2,'Credit repayment','Credit repayment',$3,$4,$5,'credit',$6,$7,$8,$9)`,
    [businessId,data.amount,customer.name,data.reference || '',data.notes || '',rows[0].id,dayStart(data.paymentDate),user.id,data.method]);
  return rowToDoc(rows[0]);
});
const reversePayment = (id, paymentId, reason, businessId) => withTransaction(async (client) => {
  await lockCustomer(client, id, businessId);
  const { rows } = await client.query(`UPDATE credit_payments SET voided_at=NOW(),void_reason=$1
    WHERE id=$2 AND customer_id=$3 AND business_id=$4 AND voided_at IS NULL RETURNING *`, [reason,paymentId,id,businessId]);
  if (!rows[0]) throw new ApiError(404, 'Active payment not found');
  await client.query('DELETE FROM cash_entries WHERE credit_payment_id=$1 AND business_id=$2', [paymentId,businessId]);
  return rowToDoc(rows[0]);
});
const updateCustomer = (id,data,businessId) => withTransaction(async(client)=>{
  await lockCustomer(client,id,businessId);
  const {rows}=await client.query('UPDATE credit_customers SET name=$1,phone=$2,notes=$3 WHERE id=$4 AND business_id=$5 RETURNING *',[data.name,data.phone || '',data.notes || '',id,businessId]);
  return rowToDoc(rows[0]);
});
const setCustomerArchived = (id, archived, businessId) => withTransaction(async (client) => {
  await lockCustomer(client, id, businessId);
  const { rows } = await client.query('UPDATE credit_customers SET archived_at=CASE WHEN $1 THEN COALESCE(archived_at,NOW()) ELSE NULL END WHERE id=$2 AND business_id=$3 RETURNING *', [archived, id, businessId]);
  return rowToDoc(rows[0]);
});
const reverseOpening = (id,chargeId,reason,businessId) => withTransaction(async(client)=>{
  await lockCustomer(client,id,businessId);
  const charge=(await chargesFor(client,id,businessId)).find(c=>c.id===chargeId && c.charge_type==='opening' && !c.voided_at);
  if(!charge) throw new ApiError(404,'Opening balance not found');
  if(Number(charge.paid)>0) throw new ApiError(409,'Reverse repayments applied to this opening balance first.');
  await client.query('UPDATE credit_charges SET voided_at=NOW(),void_reason=$1 WHERE id=$2',[reason,chargeId]);
  return rowToDoc(charge);
});
module.exports = { lockCustomer, listCustomers, customerDetail, createCustomer, updateCustomer, setCustomerArchived, recordPayment, reversePayment, reverseOpening };
