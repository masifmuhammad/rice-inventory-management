const { randomInt } = require('node:crypto');
const { getPool, withTransaction } = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { round4, likePattern } = require('../db/helpers');
const { createMovementOnClient, lockProduct } = require('./stockLedger');
const { reportTimezone } = require('../config/env');

// pg parses DATE at the server's local midnight. Preserve the calendar date
// rather than serializing midnight in Karachi as the previous UTC day.
const calendarDate = (value) => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : value || null;

const presentLabel = (row) => ({
  id: row.id, code: row.code, batchId: row.batch_id, productId: row.product_id,
  productName: row.product_name, sku: row.sku, quantity: Number(row.quantity), unit: row.unit,
  batchNumber: row.batch_number, expiryDate: calendarDate(row.expiry_date),
  status: row.status, createdAt: row.created_at,
});
const normaliseBatch = (data) => ({
  product: data.product, count: Number(data.count), quantity: round4(data.quantity),
  mode: data.mode, batchNumber: data.batchNumber || '', expiryDate: data.expiryDate || null,
});
const normaliseScan = (data) => ({ code: data.code, mode: data.mode, station: data.station || '', customer: data.customer || '',
  // Omit default payment fields to preserve retry compatibility with old clients.
  ...(data.paymentType === 'credit' ? {paymentType:'credit',customerId:data.customerId,dueDate:data.dueDate} : {}),
});
const assertSame = (stored, current) => {
  if (JSON.stringify(Object.entries(stored).sort()) !== JSON.stringify(Object.entries(current).sort())) {
    throw new ApiError(409, 'This request was already used for different details. Start a new operation.');
  }
};
const lockRequest = (client, businessId, requestId) => client.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`barcode:${businessId}:${requestId}`]);

const getBatch = async (id, businessId, client = getPool()) => {
  const { rows } = await client.query('SELECT * FROM barcode_batches WHERE id=$1 AND business_id=$2', [id, businessId]);
  if (!rows[0]) throw new ApiError(404, 'Label batch not found');
  const labels = await client.query('SELECT * FROM barcode_labels WHERE batch_id=$1 AND business_id=$2 ORDER BY created_at,id', [id, businessId]);
  return { id, createdAt: rows[0].created_at, mode: rows[0].request_data.mode, labels: labels.rows.map(presentLabel) };
};

const createBatch = (data, businessId, user) => withTransaction(async (client) => {
  const input = normaliseBatch(data);
  await lockRequest(client, businessId, data.requestId);
  const previous = await client.query('SELECT * FROM barcode_batches WHERE business_id=$1 AND request_id=$2', [businessId, data.requestId]);
  if (previous.rows[0]) {
    assertSame(previous.rows[0].request_data, input);
    return { ...await getBatch(previous.rows[0].id, businessId, client), replayed: true };
  }
  const product = await lockProduct(client, data.product, businessId, true);
  const total = round4(input.quantity * input.count);
  if (input.quantity <= 0 || total > 9999999999.9999) throw new ApiError(400, 'Check the quantity per label and number of labels.');
  if (input.mode === 'existing') {
    const assigned = await client.query("SELECT COALESCE(SUM(quantity),0) AS quantity FROM barcode_labels WHERE business_id=$1 AND product_id=$2 AND status='in_stock'", [businessId, product.id]);
    const available = round4(Number(product.current_stock) - Number(assigned.rows[0].quantity));
    if (total > available) throw new ApiError(409, `Only ${available} ${product.unit} of existing stock is available to label. Reduce the label count or receive new stock.`);
  }
  if (input.expiryDate) {
    const expired = await client.query('SELECT $1::date < (NOW() AT TIME ZONE $2)::date AS expired', [input.expiryDate, reportTimezone]);
    if (expired.rows[0].expired) throw new ApiError(400, 'The expiry date is in the past. Check this stock before labelling it.');
  }
  const batch = await client.query('INSERT INTO barcode_batches (business_id,product_id,request_id,request_data,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [businessId, product.id, data.requestId, input, user.id]);
  const batchId = batch.rows[0].id;
  for (let i = 0; i < input.count; i++) {
    // Numeric Code 128 C stays readable on 50mm thermal labels. The unique
    // constraint is authoritative; collisions are retried without aborting SQL.
    let label;
    while (!label) {
      const code = '99' + String(randomInt(100000000)).padStart(8, '0') + String(randomInt(100000000)).padStart(8, '0');
      const inserted = await client.query(
        `INSERT INTO barcode_labels (business_id,batch_id,product_id,code,product_name,sku,quantity,unit,batch_number,expiry_date,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code) DO NOTHING RETURNING *`,
        [businessId, batchId, product.id, code, product.name, product.sku, input.quantity, product.unit, input.batchNumber || null, input.expiryDate, input.mode === 'existing' ? 'in_stock' : 'prepared']);
      label = inserted.rows[0];
    }
    if (input.mode === 'receive') {
      await createMovementOnClient(client, { product: product.id, type: 'stock_in', quantity: input.quantity, barcodeLabelId: label.id,
        reference: label.code, batchNumber: input.batchNumber, expiryDate: input.expiryDate, notes: 'Received when generating barcode labels' }, businessId, user);
      await client.query("UPDATE barcode_labels SET status='in_stock' WHERE id=$1", [label.id]);
    }
  }
  return getBatch(batchId, businessId, client);
});

const readLabel = async (code, businessId) => {
  const { rows } = await getPool().query(
    `SELECT l.*,p.current_stock,p.is_active,p.selling_price FROM barcode_labels l
     JOIN products p ON p.id=l.product_id WHERE l.code=$1 AND l.business_id=$2`, [code, businessId]);
  const row = rows[0];
  if (!row) throw new ApiError(404, 'Barcode not found in this business. Check the label or switch to the correct business.');
  const history = await getPool().query(
    `SELECT t.id,t.type,t.quantity,t.unit,t.total_value,t.created_at,t.notes,u.name AS user_name
     FROM transactions t JOIN users u ON u.id=t.created_by
     WHERE t.barcode_label_id=$1 AND t.business_id=$2 ORDER BY t.created_at DESC,t.id DESC LIMIT 30`, [row.id, businessId]);
  return { label: presentLabel(row), currentStock: Number(row.current_stock), active: row.is_active,
    sellingPrice: Number(row.selling_price), history: history.rows };
};

const scanLabel = (data, businessId, user) => withTransaction(async (client) => {
  const input = normaliseScan(data);
  await lockRequest(client, businessId, data.requestId);
  const previous = await client.query('SELECT * FROM barcode_operations WHERE business_id=$1 AND request_id=$2', [businessId, data.requestId]);
  if (previous.rows[0]) {
    assertSame(previous.rows[0].request_data, input);
    return { ...previous.rows[0].result, replayed: true };
  }
  const initial = await client.query('SELECT product_id FROM barcode_labels WHERE code=$1 AND business_id=$2', [input.code, businessId]);
  if (!initial.rows[0]) throw new ApiError(404, 'Barcode not found in this business. Check the label or switch to the correct business.');
  await lockProduct(client, initial.rows[0].product_id, businessId, true);
  const { rows } = await client.query(
    'SELECT *, expiry_date < (NOW() AT TIME ZONE $3)::date AS expired FROM barcode_labels WHERE code=$1 AND business_id=$2 FOR UPDATE',
    [input.code, businessId, reportTimezone]);
  const label = rows[0];
  if (label.expired) throw new ApiError(409, 'This pack has expired. Set it aside and ask an administrator to review it.');
  if (input.mode === 'stock_in' && label.status !== 'prepared') throw new ApiError(409,
    label.status === 'in_stock' ? 'This pack is already in stock. No stock was added.' : 'This pack was stocked out. Ask an administrator to reverse the sale before receiving it again.');
  if (input.mode === 'stock_out' && label.status !== 'in_stock') throw new ApiError(409,
    label.status === 'stock_out' ? 'This pack was already stocked out. No stock was deducted.' : 'This label has not been received. Scan it in Stock in first.');
  const transaction = await createMovementOnClient(client, {
    product: label.product_id, type: input.mode, quantity: Number(label.quantity), barcodeLabelId: label.id,
    reference: label.code, batchNumber: label.batch_number, expiryDate: label.expiry_date,
    customer: input.customer, notes: input.station ? `Barcode scan · ${input.station}` : 'Barcode scan',
    paymentType:input.paymentType, customerId:input.customerId, dueDate:input.dueDate, amountReceived:0,
  }, businessId, user);
  const updated = await client.query('UPDATE barcode_labels SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [input.mode === 'stock_in' ? 'in_stock' : 'stock_out', label.id]);
  const result = { label: presentLabel(updated.rows[0]), transaction, mode: input.mode };
  await client.query('INSERT INTO barcode_operations (business_id,request_id,request_data,result) VALUES ($1,$2,$3,$4)', [businessId, data.requestId, input, result]);
  return result;
});

const listBatches = async (businessId, page = 1, search = '') => {
  const where = `b.business_id=$1 AND ($2='' OR l.product_name ILIKE $3 OR l.sku ILIKE $3 OR l.code ILIKE $3 OR l.batch_number ILIKE $3)`;
  const params = [businessId, search, likePattern(search)];
  const count = await getPool().query(`SELECT COUNT(DISTINCT b.id)::int AS total FROM barcode_batches b JOIN barcode_labels l ON l.batch_id=b.id WHERE ${where}`, params);
  const { rows } = await getPool().query(
    `SELECT b.id,b.created_at,MIN(l.product_name) AS product_name,MIN(l.unit) AS unit,
      COUNT(*)::int AS count,COUNT(*) FILTER (WHERE l.status='in_stock')::int AS in_stock,
      COUNT(*) FILTER (WHERE l.status='stock_out')::int AS stock_out
     FROM barcode_batches b JOIN barcode_labels l ON l.batch_id=b.id
     WHERE b.business_id=$1 AND b.id IN (SELECT b.id FROM barcode_batches b JOIN barcode_labels l ON l.batch_id=b.id WHERE ${where})
     GROUP BY b.id ORDER BY b.created_at DESC,b.id DESC LIMIT 15 OFFSET $4`, [...params, (page - 1) * 15]);
  return { data: rows, total: count.rows[0].total, page };
};

module.exports = { createBatch, getBatch, listBatches, readLabel, scanLabel };
