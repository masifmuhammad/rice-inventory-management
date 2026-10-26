const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {buildStatement,agingFor}=require('../services/supplierLedger');

test('supplier statement carries opening balance and orders a bill before its simultaneous deposit',()=>{
  const stamp='2026-10-02T10:00:00Z';
  const charges=[
    {id:'opening',occurred_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z',amount:100,description:'Opening',reference:''},
    {id:'z-bill',occurred_at:stamp,created_at:stamp,amount:250,description:'Rice',reference:'B-1'},
    {id:'voided',occurred_at:stamp,created_at:stamp,amount:999,description:'Reversed',voided_at:stamp},
  ];
  const payments=[{id:'a-payment',payment_date:'2026-10-02',created_at:stamp,amount:50,method:'bank',reference:'P-1'}];
  const statement=buildStatement(charges,payments,{startDate:'2026-10-02',endDate:'2026-10-02'});
  assert.equal(statement.openingBalance,100);assert.equal(statement.totalCharges,250);assert.equal(statement.totalPayments,50);
  assert.equal(statement.closingBalance,300);
  assert.ok(statement.rows.findIndex(row=>row.id==='z-bill')<statement.rows.findIndex(row=>row.id==='a-payment'));
  assert.equal(statement.rows.at(-1).balance,300);
  assert.throws(()=>buildStatement(charges,payments,{startDate:'2026-10-03',endDate:'2026-10-01'}),/Start date/);
});
test('supplier aging respects due-date boundaries and settled bills',()=>{
  const charges=[['2026-10-26',1],['2026-10-25',2],['2026-09-26',3],['2026-09-25',4],['2026-08-27',5],['2026-08-26',6],['2026-07-28',7],['2026-07-27',8],['2026-01-01',0]]
    .map(([due_date,outstanding])=>({due_date,outstanding}));
  assert.deepEqual(agingFor(charges,'2026-10-26'),{current:1,days1to30:5,days31to60:9,days61to90:13,daysOver90:8});
});

test('supplier credit reconciles receipts, deposits, partial payments, statements and reversals',{skip:!process.env.TEST_DATABASE_URL},async(t)=>{
  assert.match(new URL(process.env.TEST_DATABASE_URL).pathname,/test|readiness/i);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.NODE_ENV='test';process.env.OPENROUTER_API_KEY='';
  process.env.JWT_SECRET='supplier-tests-secret-at-least-32-characters';
  const {connectDB,closeDB,getPool}=require('../config/db');
  const Business=require('../models/Business');const User=require('../models/User');const Product=require('../models/Product');
  const app=require('../server');await connectDB({retries:1});const pool=getPool();
  const suffix=randomUUID();const business=await Business.create({name:`Supplier test ${suffix}`});const other=await Business.create({name:`Supplier other ${suffix}`});
  const admin=await User.create({businessId:business.id,name:'Supplier Admin',email:`${suffix}@supplier.test`,password:'Supplier-password-42',role:'admin',status:'active'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;let token;
  const request=async(path,method='GET',body,auth=token)=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  };
  const {localDay,shiftDay}=require('../db/dates');const today=localDay();const yesterday=shiftDay(today,-1);
  let supplier,purchase,product,deposit;
  const detail=async(range='')=>(await request(`/api/suppliers/${supplier.id}${range}`)).data;
  const cashTotal=async()=>(await pool.query('SELECT COALESCE(SUM(amount),0) AS amount FROM cash_entries WHERE business_id=$1',[business.id])).rows[0].amount;
  try {
    token=(await request('/api/auth/login','POST',{email:admin.email,password:'Supplier-password-42'})).data.token;
    product=await Product.create({businessId:business.id,createdBy:admin.id,name:'Supplier rice',category:'Basmati',unit:'kg',currentStock:10,costPrice:20,sellingPrice:30});
    await t.test('opening payable does not invent inventory or money movement',async()=>{
      const result=await request('/api/suppliers','POST',{name:'Punjab Rice Traders',phone:'+923001234567',openingBalance:100,dueDate:yesterday,openingDate:yesterday});
      assert.equal(result.status,201,JSON.stringify(result));supplier=result.data;
      assert.equal((await detail()).balance,100);assert.equal(await cashTotal(),0);assert.equal((await Product.findById(product.id)).currentStock,10);
      assert.equal((await request('/api/suppliers','POST',{name:'punjab rice traders'})).status,409);
    });
    await t.test('purchase and deposit atomically create stock, full payable and money out; retries are safe',async()=>{
      const body={requestId:randomUUID(),product:product.id,quantity:10,price:20,purchaseDate:today,dueDate:today,amountPaid:50,method:'bank',reference:'SUP-1'};
      const results=await Promise.all([request(`/api/suppliers/${supplier.id}/purchases`,'POST',body),request(`/api/suppliers/${supplier.id}/purchases`,'POST',body)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,201],JSON.stringify(results));purchase=results.find(r=>r.status===201).data;deposit=purchase.payment;
      assert.equal(purchase.amount,200);assert.equal(purchase.transaction.type,'stock_in');assert.equal((await Product.findById(product.id)).currentStock,20);
      const account=await detail();assert.equal(account.balance,250);assert.equal(account.statement.totalCharges,300);assert.equal(account.statement.totalPayments,50);
      assert.equal(account.statement.closingBalance,250);assert.equal(account.aging.days1to30,100);
      const entry=(await pool.query('SELECT * FROM cash_entries WHERE supplier_payment_id=$1',[deposit.id])).rows[0];
      assert.equal(entry.amount,50);assert.equal(entry.direction,'out');assert.equal(entry.payment_method,'bank');
      assert.equal((await request(`/api/cash-book/${entry.id}`,'DELETE')).status,400);
      assert.equal((await request(`/api/transactions/${purchase.transaction.id}`,'DELETE')).status,409);
      assert.equal((await request(`/api/suppliers/${supplier.id}/purchases`,'POST',{...body,quantity:11})).status,409);
      assert.equal((await request(`/api/suppliers/${supplier.id}/purchases`,'POST',{...body,requestId:randomUUID()})).status,409);
      assert.equal((await Product.findById(product.id)).currentStock,20);
    });
    await t.test('invalid or cross-business purchases cannot touch stock or balances',async()=>{
      const foreign=(await pool.query('INSERT INTO suppliers(business_id,name,created_by) VALUES($1,$2,$3) RETURNING id',[other.id,'Other supplier',admin.id])).rows[0];
      assert.equal((await request(`/api/suppliers/${foreign.id}`)).status,404);
      const body={requestId:randomUUID(),product:product.id,quantity:1,price:20,purchaseDate:today,dueDate:today,amountPaid:0,method:'cash'};
      for(const change of [{amountPaid:21},{amountPaid:-1},{quantity:0.00001},{price:0},{dueDate:'2026-02-30'},{purchaseDate:shiftDay(today,1)},{product:randomUUID()}]) {
        const result=await request(`/api/suppliers/${supplier.id}/purchases`,'POST',{...body,requestId:randomUUID(),...change});
        assert.ok([400,404].includes(result.status),JSON.stringify(result));
      }
      assert.equal((await request(`/api/suppliers/${foreign.id}/purchases`,'POST',body)).status,404);
      assert.equal((await Product.findById(product.id)).currentStock,20);assert.equal((await detail()).balance,250);assert.equal(await cashTotal(),50);
    });
    await t.test('partial payments settle oldest due bills and cannot overpay under concurrency',async()=>{
      const body={requestId:randomUUID(),amount:150,paymentDate:today,method:'cash',reference:'PAY-1'};
      const results=await Promise.all([request(`/api/suppliers/${supplier.id}/payments`,'POST',body),request(`/api/suppliers/${supplier.id}/payments`,'POST',body)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
      let account=await detail();assert.equal(account.balance,100);assert.deepEqual(account.charges.map(c=>c.outstanding),[0,100]);
      assert.equal((await request(`/api/suppliers/${supplier.id}/payments`,'POST',{...body,amount:151})).status,409);
      const pay=()=>request(`/api/suppliers/${supplier.id}/payments`,'POST',{requestId:randomUUID(),amount:75,paymentDate:today,method:'cash'});
      const race=await Promise.all([pay(),pay()]);assert.deepEqual(race.map(r=>r.status).sort(),[201,400]);
      account=await detail();assert.equal(account.balance,25);assert.equal(await cashTotal(),275);
      assert.equal((await request(`/api/suppliers/${supplier.id}/payments`,'POST',{requestId:randomUUID(),amount:1,paymentDate:shiftDay(yesterday,-1),method:'cash'})).status,400);
      assert.equal((await request(`/api/suppliers/${supplier.id}/payments`,'POST',{requestId:randomUUID(),amount:0.001,paymentDate:today,method:'cash'})).status,400);
      assert.equal((await request(`/api/suppliers/${supplier.id}/payments`,'POST',{requestId:randomUUID(),amount:1,paymentDate:shiftDay(today,1),method:'cash'})).status,400);
      const filtered=await detail(`?startDate=${today}&endDate=${today}`);assert.equal(filtered.statement.openingBalance,100);assert.equal(filtered.statement.totalCharges,200);
      assert.equal(filtered.statement.totalPayments,275);assert.equal(filtered.statement.closingBalance,25);
      const overview=(await request('/api/suppliers')).data.suppliers.find(s=>s.id===supplier.id);
      assert.equal(overview.totalPurchased,200);assert.equal(overview.totalPaid,275);assert.equal(overview.balance,25);assert.equal(overview.overdue,0);
    });
    await t.test('reversals preserve history and require restoring paid and consumed stock first',async()=>{
      const chargePath=`/api/suppliers/${supplier.id}/charges/${purchase.id}/reverse`;
      assert.equal((await request(chargePath,'POST',{reason:'Incorrect bill'})).status,409);
      for(const payment of (await detail()).payments) {
        assert.equal((await request(`/api/suppliers/${supplier.id}/payments/${payment.id}/reverse`,'POST',{reason:'Incorrect payment'})).status,200);
      }
      assert.equal(await cashTotal(),0);assert.equal((await detail()).balance,300);
      const adjustment=await request('/api/transactions','POST',{product:product.id,type:'adjustment',quantity:20});
      assert.equal(adjustment.status,201,JSON.stringify(adjustment));
      assert.equal((await request(chargePath,'POST',{reason:'Incorrect bill'})).status,409);
      assert.equal((await request(`/api/transactions/${adjustment.data.id}`,'DELETE')).status,200);
      await pool.query('UPDATE products SET current_stock=5 WHERE id=$1',[product.id]);
      assert.equal((await request(chargePath,'POST',{reason:'Incorrect bill'})).status,409);
      await pool.query('UPDATE products SET current_stock=20 WHERE id=$1',[product.id]);
      assert.equal((await request(chargePath,'POST',{reason:'Incorrect bill'})).status,200);
      assert.equal((await Product.findById(product.id)).currentStock,10);
      let account=await detail();assert.equal(account.balance,100);assert.ok(account.charges.find(c=>c.id===purchase.id).voidedAt);assert.ok(account.payments.every(p=>p.voidedAt));
      const opening=account.charges.find(c=>c.chargeType==='opening');
      assert.equal((await request(`/api/suppliers/${supplier.id}/charges/${opening.id}/reverse`,'POST',{reason:'Duplicate opening debt'})).status,200);
      account=await detail();assert.equal(account.balance,0);assert.equal(account.statement.closingBalance,0);
      assert.equal((await request(`/api/suppliers/${supplier.id}`,'PUT',{name:'Punjab Rice Mills',phone:'03001234567'})).status,200);
    });
    await t.test('workers cannot access supplier finances',async()=>{
      const worker=await User.create({businessId:business.id,name:'Supplier Worker',email:`worker-${suffix}@supplier.test`,password:'Supplier-password-42',role:'worker',status:'active'});
      const auth=(await request('/api/auth/login','POST',{email:worker.email,password:'Supplier-password-42'})).data.token;
      assert.equal((await request('/api/suppliers','GET',null,auth)).status,403);
      assert.equal((await request('/api/suppliers','POST',{name:'Forbidden'},auth)).status,403);
    });
    await t.test('repeat migrations preserve existing supplier bills, history, and known payment methods',async()=>{
      const before=await detail();
      const {runMigrations}=require('../db/migrate');await runMigrations();await runMigrations();
      const after=await detail();
      assert.deepEqual(after.charges,before.charges);assert.deepEqual(after.payments,before.payments);assert.deepEqual(after.statement,before.statement);
      assert.equal((await Product.findById(product.id)).currentStock,10);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));const ids=[business.id,other.id];
    await pool.query('DELETE FROM cash_entries WHERE business_id=ANY($1::uuid[])',[ids]);
    await pool.query('DELETE FROM supplier_allocations WHERE payment_id IN(SELECT id FROM supplier_payments WHERE business_id=ANY($1::uuid[]))',[ids]);
    for(const table of ['supplier_payments','supplier_charges','transactions','barcode_batches','products','suppliers','audit_logs','users']) await pool.query(`DELETE FROM ${table} WHERE business_id=ANY($1::uuid[])`,[ids]);
    await pool.query('DELETE FROM businesses WHERE id=ANY($1::uuid[])',[ids]);await closeDB();
  }
});
