const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');

test('customer credit keeps stock, receivables, repayments and cash consistent',{skip:!process.env.TEST_DATABASE_URL},async(t)=>{
  assert.match(new URL(process.env.TEST_DATABASE_URL).pathname,/test|readiness/i);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.NODE_ENV='test';process.env.OPENROUTER_API_KEY='';
  process.env.JWT_SECRET='credit-tests-secret-at-least-32-characters';
  const {connectDB,closeDB,getPool}=require('../config/db');
  const Business=require('../models/Business');const User=require('../models/User');const Product=require('../models/Product');
  const app=require('../server');await connectDB({retries:1});const pool=getPool();
  const suffix=randomUUID();const business=await Business.create({name:`Credit test ${suffix}`});const other=await Business.create({name:`Credit other ${suffix}`});
  const admin=await User.create({businessId:business.id,name:'Credit Admin',email:`${suffix}@credit.test`,password:'Credit-password-42',role:'admin',status:'active'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;let token;
  const request=async(path,method='GET',body,auth=token)=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  };
  const {localDay,shiftDay}=require('../db/dates');const today=localDay();const yesterday=shiftDay(today,-1);
  let customer, sale, payment;
  const detail=async()=> (await request(`/api/credit/customers/${customer.id}`)).data;
  try {
    token=(await request('/api/auth/login','POST',{email:admin.email,password:'Credit-password-42'})).data.token;
    const product=await Product.create({businessId:business.id,createdBy:admin.id,name:'Credit rice',category:'Basmati',unit:'kg',currentStock:100,costPrice:10,sellingPrice:15});
    await t.test('opening credit records existing debt without stock or cash',async()=>{
      const result=await request('/api/credit/customers','POST',{name:'Ahmed Traders',phone:'+923001234567',openingBalance:100,dueDate:yesterday});
      assert.equal(result.status,201,JSON.stringify(result));customer=result.data;
      assert.equal((await detail()).balance,100);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cash_entries WHERE business_id=$1',[business.id])).rows[0].n,0);
      assert.equal((await Product.findById(product.id)).currentStock,100);
      assert.equal((await request('/api/credit/customers','POST',{name:'ahmed traders'})).status,409);
    });
    await t.test('credit sale reduces stock and books only the deposit as cash',async()=>{
      const result=await request('/api/transactions','POST',{product:product.id,type:'stock_out',quantity:10,paymentType:'credit',customerId:customer.id,dueDate:today,amountReceived:25});
      assert.equal(result.status,201,JSON.stringify(result));sale=result.data;assert.equal(sale.dueDate,today);
      assert.equal(sale.customer,'Ahmed Traders');assert.equal((await detail()).balance,225);
      assert.equal((await Product.findById(product.id)).currentStock,90);
      assert.equal((await pool.query('SELECT amount FROM cash_entries WHERE transaction_id=$1',[sale.id])).rows[0].amount,25);
      const overview=(await request('/api/credit')).data.customers[0];assert.equal(overview.overdue,100);assert.equal(overview.nextDueDate,yesterday);
    });
    await t.test('invalid credit and foreign customers cannot move stock',async()=>{
      for (const change of [{amountReceived:150},{amountReceived:-1},{dueDate:'2026-02-30'},{customerId:randomUUID()}]) {
        const response=await request('/api/transactions','POST',{product:product.id,type:'stock_out',quantity:10,paymentType:'credit',customerId:customer.id,dueDate:today,...change});
        assert.ok([400,404].includes(response.status),JSON.stringify(response));
      }
      const {rows}=await pool.query('INSERT INTO credit_customers (business_id,name,created_by) VALUES ($1,$2,$3) RETURNING id',[other.id,'Other customer',admin.id]);
      assert.equal((await request(`/api/credit/customers/${rows[0].id}`)).status,404);
      assert.equal((await request('/api/transactions','POST',{product:product.id,type:'stock_out',quantity:10,paymentType:'credit',customerId:rows[0].id,dueDate:today})).status,404);
      assert.equal((await Product.findById(product.id)).currentStock,90);
    });
    await t.test('repayments allocate oldest due first and retries do not double-post',async()=>{
      const body={requestId:randomUUID(),amount:150,paymentDate:today,method:'bank',reference:'BANK-1'};
      const results=await Promise.all([request(`/api/credit/customers/${customer.id}/payments`,'POST',body),request(`/api/credit/customers/${customer.id}/payments`,'POST',body)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);payment=results[0].data;
      const account=await detail();assert.equal(account.balance,75);assert.equal(account.payments.length,1);assert.deepEqual(account.charges.map(c=>c.outstanding),[0,75]);
      assert.equal((await pool.query('SELECT SUM(amount) AS amount FROM cash_entries WHERE business_id=$1',[business.id])).rows[0].amount,175);
      assert.equal((await request(`/api/credit/customers/${customer.id}/payments`,'POST',{...body,amount:151})).status,409);
      const cash=(await pool.query('SELECT id FROM cash_entries WHERE credit_payment_id=$1',[payment.id])).rows[0];
      assert.equal((await request(`/api/cash-book/${cash.id}`,'DELETE')).status,400);
      assert.equal((await request(`/api/transactions/${sale.id}`,'DELETE')).status,409);
    });
    await t.test('concurrent collections cannot exceed the debt; future and sub-paisa amounts are rejected',async()=>{
      const pay=(amount,paymentDate=today)=>request(`/api/credit/customers/${customer.id}/payments`,'POST',{requestId:randomUUID(),amount,paymentDate,method:'cash'});
      assert.equal((await pay(0.001)).status,400);assert.equal((await pay(10,shiftDay(today,1))).status,400);
      const results=await Promise.all([pay(60),pay(60)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
      assert.equal((await detail()).balance,15);
    });
    await t.test('reversals retain payment history and restore debt and cash together',async()=>{
      const payments=(await detail()).payments;
      for(const p of payments) assert.equal((await request(`/api/credit/customers/${customer.id}/payments/${p.id}/reverse`,'POST',{reason:'Wrong receipt recorded'})).status,200);
      assert.equal((await detail()).balance,225);assert.ok((await detail()).payments.every(p=>p.voidedAt));
      assert.equal((await request(`/api/credit/customers/${customer.id}/payments/${payment.id}/reverse`,'POST',{reason:'Again'})).status,404);
      assert.equal((await pool.query('SELECT SUM(amount) AS amount FROM cash_entries WHERE business_id=$1',[business.id])).rows[0].amount,25);
      assert.equal((await request(`/api/transactions/${sale.id}`,'DELETE')).status,200);assert.equal((await detail()).balance,100);
      assert.ok((await detail()).charges.some(c=>c.chargeType==='sale' && c.voidedAt && c.outstanding===0));
      assert.equal((await Product.findById(product.id)).currentStock,100);
    });
    await t.test('barcode credit preserves retry safety and never books unpaid cash',async()=>{
      const batch=await request('/api/barcodes/batches','POST',{requestId:randomUUID(),product:product.id,quantity:5,count:1,mode:'existing'});
      assert.equal(batch.status,201,JSON.stringify(batch));
      const body={requestId:randomUUID(),code:batch.data.labels[0].code,mode:'stock_out',paymentType:'credit',customerId:customer.id,dueDate:today};
      const first=await request('/api/barcodes/scan','POST',body);assert.equal(first.status,201,JSON.stringify(first));
      assert.equal((await request('/api/barcodes/scan','POST',body)).status,200);
      assert.equal((await detail()).balance,175);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cash_entries WHERE transaction_id=$1',[first.data.transaction.id])).rows[0].n,0);
      assert.equal((await request(`/api/transactions/${first.data.transaction.id}`,'DELETE')).status,200);
    });
    await t.test('archiving preserves debt and payments, blocks new credit, and can be restored',async()=>{
      const before=await detail();const stock=(await Product.findById(product.id)).currentStock;
      assert.equal((await request(`/api/credit/customers/${customer.id}/archive`,'POST',{archived:'false'})).status,400);
      assert.equal((await request(`/api/credit/customers/${randomUUID()}/archive`,'POST',{archived:true})).status,404);
      assert.equal((await request(`/api/credit/customers/${customer.id}/archive`,'POST',{archived:true})).status,200);
      assert.ok((await detail()).customer.archivedAt);assert.equal((await detail()).balance,before.balance);
      assert.ok((await request('/api/credit')).data.customers.find(c=>c.id===customer.id).archivedAt);
      const blocked=await request('/api/transactions','POST',{product:product.id,type:'stock_out',quantity:1,paymentType:'credit',customerId:customer.id,dueDate:today});
      assert.equal(blocked.status,409);assert.equal((await Product.findById(product.id)).currentStock,stock);
      const payment=await request(`/api/credit/customers/${customer.id}/payments`,'POST',{requestId:randomUUID(),amount:10,paymentDate:today,method:'bank'});
      assert.equal(payment.status,201);assert.equal((await detail()).balance,before.balance-10);
      assert.equal((await request(`/api/credit/customers/${customer.id}/payments/${payment.data.id}/reverse`,'POST',{reason:'Archive collection verification'})).status,200);
      assert.equal((await request(`/api/credit/customers/${customer.id}/archive`,'POST',{archived:false})).status,200);
      assert.equal((await detail()).customer.archivedAt,null);assert.equal((await detail()).balance,before.balance);
    });
    await t.test('customer corrections and opening reversals retain the audit history',async()=>{
      assert.equal((await request(`/api/credit/customers/${customer.id}`,'PUT',{name:'Ahmed Rice Traders',phone:'+923009876543',notes:'Call before collecting'})).status,200);
      const opening=(await detail()).charges.find(c=>c.chargeType==='opening');
      assert.equal((await request(`/api/credit/customers/${customer.id}/opening/${opening.id}/reverse`,'POST',{reason:'Opening debt entered twice'})).status,200);
      const account=await detail();assert.equal(account.balance,0);assert.equal(account.customer.name,'Ahmed Rice Traders');
      assert.ok(account.charges.find(c=>c.id===opening.id).voidedAt);
      assert.equal((await request('/api/credit')).data.customers[0].creditGiven,0);
    });
    await t.test('workers cannot access customer balances or create credit sales',async()=>{
      const worker=await User.create({businessId:business.id,name:'Credit Worker',email:`worker-${suffix}@credit.test`,password:'Credit-password-42',role:'worker',status:'active'});
      const auth=(await request('/api/auth/login','POST',{email:worker.email,password:'Credit-password-42'})).data.token;
      assert.equal((await request('/api/credit','GET',null,auth)).status,403);
      assert.equal((await request(`/api/credit/customers/${customer.id}/archive`,'POST',{archived:true},auth)).status,403);
      assert.equal((await request('/api/transactions','POST',{product:product.id,type:'stock_out',quantity:1,paymentType:'credit',customerId:customer.id,dueDate:today},auth)).status,403);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));
    const ids=[business.id,other.id];
    await pool.query('DELETE FROM cash_entries WHERE business_id=ANY($1::uuid[])',[ids]);
    await pool.query('DELETE FROM credit_allocations WHERE payment_id IN (SELECT id FROM credit_payments WHERE business_id=ANY($1::uuid[]))',[ids]);
    for(const table of ['credit_payments','credit_charges','transactions','barcode_batches','products','credit_customers','audit_logs','users']) await pool.query(`DELETE FROM ${table} WHERE business_id=ANY($1::uuid[])`,[ids]);
    await pool.query('DELETE FROM businesses WHERE id=ANY($1::uuid[])',[ids]);await closeDB();
  }
});
