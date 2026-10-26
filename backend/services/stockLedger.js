const { withTransaction } = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { round2, round4 } = require('../db/helpers');
const Transaction = require('../models/Transaction');
const { lockCustomer } = require('./creditLedger');
const { can } = require('../middleware/permissions');
const { dayStart } = require('../db/dates');

const effect = (type, quantity) =>
  type === 'stock_in' ? quantity : type === 'stock_out' ? -quantity : 0;

// Lock the product first on every path. This serializes movements, corrections
// and reversals for one product without blocking unrelated products.
const lockProduct = async (client, id, businessId, active = false) => {
  const { rows } = await client.query(
    `SELECT * FROM products WHERE id = $1 AND business_id = $2 FOR UPDATE`,
    [id, businessId]
  );
  if (!rows[0] || (active && !rows[0].is_active)) throw new ApiError(404, 'Product not found');
  return rows[0];
};

const writeStock = async (client, product, stock) => {
  if (stock < 0) throw new ApiError(400, 'Not enough stock. This change would take the stock below zero.');
  await client.query(
    'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
    [stock, product.id, product.business_id]
  );
};

const postCash = async (client, row, product, userId) => {
  const received = row.payment_type === 'credit' ? Number(row.amount_received) : Number(row.total_value);
  if (row.type !== 'stock_out' || received <= 0) return;
  await client.query(
    `INSERT INTO cash_entries
      (business_id, direction, amount, category, purpose, party, reference,
       source, transaction_id, occurred_at, created_by, payment_method)
     VALUES ($1, 'in', $2, 'Sale', $3, $4, $5, 'sale', $6, $7, $8, 'cash')`,
    [row.business_id, received, `Sale — ${product.name}`, row.customer || '',
      row.reference || '', row.id, row.created_at, userId]
  );
};

const present = (row, product, user) => {
  const transaction = new Transaction(row);
  transaction.product = {
    id: product.id, _id: product.id, name: product.name, sku: product.sku,
    category: product.category, unit: product.unit,
    costPrice: Number(product.cost_price), sellingPrice: Number(product.selling_price),
  };
  transaction.createdBy = { id: user.id, _id: user.id, name: user.name, email: user.email };
  return transaction;
};

const createMovementOnClient = async (client, data, businessId, user) => {
  const product = await lockProduct(client, data.product, businessId, true);
  const quantity = round4(data.quantity);
  if (['stock_in', 'stock_out', 'transfer'].includes(data.type) && quantity <= 0) {
    throw new ApiError(400, 'Quantity must be at least 0.0001');
  }
  const stockBefore = Number(product.current_stock);
  const stockAfter = data.type === 'adjustment' ? quantity : round4(stockBefore + effect(data.type, quantity));
  if (stockAfter < 0) throw new ApiError(400, 'Not enough stock. This change would take the stock below zero.');
  // Manual sales/adjustments can consume loose stock only. A labelled pack must
  // leave through its own barcode so its physical identity stays truthful.
  const { rows: labelled } = await client.query(
    `SELECT COALESCE(SUM(quantity),0) AS quantity FROM barcode_labels
     WHERE business_id=$1 AND product_id=$2 AND status='in_stock'
       AND ($3::uuid IS NULL OR id <> $3)`, [businessId, product.id, data.barcodeLabelId || null]
  );
  if (stockAfter < Number(labelled[0].quantity)) {
    throw new ApiError(409, 'This stock includes labelled packs. Scan their barcodes to stock them out, or keep the counted stock at least as high as the labelled quantity.');
  }
  await writeStock(client, product, stockAfter);
  const price = round4(data.price ?? Number(data.type === 'stock_out' ? product.selling_price : product.cost_price));
  const total = round2(price * quantity);
  const credit = data.paymentType === 'credit';
  let customer;
  const received = credit ? Number(data.amountReceived ?? 0) : total;
  if (credit) {
    if (!can(user.role, 'credit.manage')) throw new ApiError(403, 'Your account cannot record customer credit.');
    if (data.type !== 'stock_out') throw new ApiError(400, 'Credit is available for sales only.');
    if (!Number.isFinite(received) || received < 0 || round2(received) !== received || received >= total) {
      throw new ApiError(400, 'The amount received must be less than the sale total. Use a cash sale for full payment.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate || '')) throw new ApiError(400, 'Choose a payment due date.');
    dayStart(data.dueDate);
    customer = await lockCustomer(client, data.customerId, businessId);
    if (customer.archived_at) throw new ApiError(409, 'This customer is archived. Restore the customer before recording a new credit sale.');
  }
  const { rows } = await client.query(
    `INSERT INTO transactions
      (business_id, type, product_id, quantity, unit, price, total_value, reference,
      batch_number, expiry_date, supplier, customer, notes, created_by, stock_before, stock_after, cost_price_snapshot, barcode_label_id, created_at,
      payment_type, amount_received, customer_id, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,clock_timestamp(),$19,$20,$21,$22) RETURNING *`,
    [businessId, data.type, product.id, quantity, product.unit, price, total,
      data.reference ?? null, data.batchNumber ?? null, data.expiryDate || null,
      data.supplier ?? null, customer?.name ?? data.customer ?? null, data.notes ?? null, user.id, stockBefore, stockAfter, product.cost_price, data.barcodeLabelId || null,
      credit ? 'credit' : 'cash', received, customer?.id || null, credit ? data.dueDate : null]
  );
  if (credit) await client.query(`INSERT INTO credit_charges
    (business_id,customer_id,transaction_id,amount,description,due_date,occurred_at,charge_type) VALUES ($1,$2,$3,$4,$5,$6,$7,'sale')`,
    [businessId,customer.id,rows[0].id,round2(total-received),`${quantity} ${product.unit} · ${product.name}`.slice(0,200),data.dueDate,rows[0].created_at]);
  await postCash(client, rows[0], product, user.id);
  return present(rows[0], product, user);
};
const createMovement = (data, businessId, user) => withTransaction((client) => createMovementOnClient(client, { ...data, barcodeLabelId: null }, businessId, user));

const changeMovement = (id, businessId, user, data) => withTransaction(async (client) => {
  const initial = await client.query('SELECT product_id FROM transactions WHERE id = $1 AND business_id = $2', [id, businessId]);
  if (!initial.rows[0]) throw new ApiError(404, 'Transaction not found');
  const product = await lockProduct(client, initial.rows[0].product_id, businessId);
  const { rows: locked } = await client.query('SELECT * FROM transactions WHERE id = $1 AND business_id = $2 FOR UPDATE', [id, businessId]);
  const before = locked[0];
  if (!before) throw new ApiError(404, 'Transaction not found');
  const supplierBill = await client.query('SELECT 1 FROM supplier_charges WHERE transaction_id=$1 AND business_id=$2 AND voided_at IS NULL', [id, businessId]);
  if (supplierBill.rows.length) throw new ApiError(409, 'Correct this purchase in Supplier credit so stock, payments and supplier dues stay together.');
  if (data && (before.payment_type === 'credit' || data.paymentType === 'credit')) {
    throw new ApiError(409, 'To correct a credit sale, reverse it and record it again. Reverse its repayments first.');
  }
  if (before.payment_type === 'credit') {
    await lockCustomer(client, before.customer_id, businessId);
    const paid = await client.query(`SELECT 1 FROM credit_allocations a JOIN credit_charges c ON c.id=a.charge_id
      JOIN credit_payments p ON p.id=a.payment_id WHERE c.transaction_id=$1 AND p.voided_at IS NULL LIMIT 1`, [id]);
    if (paid.rows.length) throw new ApiError(409, 'This credit sale has repayments. Reverse those repayments in Customer credit first.');
  }
  let label;
  if (before.barcode_label_id) {
    if (data) throw new ApiError(409, 'Barcode movements cannot be edited. Reverse the latest scan and scan again.');
    label = (await client.query('SELECT * FROM barcode_labels WHERE id=$1 AND business_id=$2 FOR UPDATE', [before.barcode_label_id, businessId])).rows[0];
    const latest = await client.query('SELECT id FROM transactions WHERE barcode_label_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1', [label.id]);
    if (latest.rows[0]?.id !== id) throw new ApiError(409, 'Reverse this pack’s latest barcode movement first.');
  }

  const changesStock = !data || data.type !== before.type || round4(data.quantity) !== Number(before.quantity);
  if (changesStock) {
    const laterAdjustment = await client.query(
      "SELECT id FROM transactions WHERE product_id=$1 AND business_id=$2 AND type='adjustment' AND created_at >= $3 AND id <> $4 LIMIT 1",
      [product.id, businessId, before.created_at, id]
    );
    if (laterAdjustment.rows.length) throw new ApiError(409, 'A later stock adjustment exists. Reverse newer adjustments before changing this movement.');
  }
  let stockAfter;
  let row;
  if (data) {
    const quantity = round4(data.quantity);
    if (['stock_in', 'stock_out', 'transfer'].includes(data.type) && quantity <= 0) {
      throw new ApiError(400, 'Quantity must be at least 0.0001');
    }
    const movementChanged = data.type !== before.type || quantity !== Number(before.quantity);
    if (movementChanged && (data.type === 'adjustment' || before.type === 'adjustment')) {
      throw new ApiError(400, 'Reverse the adjustment and record a new one to change its quantity or type.');
    }
    stockAfter = round4(Number(product.current_stock) + effect(data.type, quantity) - effect(before.type, Number(before.quantity)));
    await writeStock(client, product, stockAfter);
    const price = round4(data.price ?? Number(before.price ?? 0));
    const { rows } = await client.query(
      `UPDATE transactions SET type=$1, quantity=$2, price=$3, total_value=$4,
        reference=$5, batch_number=$6, supplier=$7, customer=$8, notes=$9,
        stock_before=$10, stock_after=$11, updated_at=NOW()
       WHERE id=$12 AND business_id=$13 RETURNING *`,
      [data.type, quantity, price, round2(price * quantity), data.reference ?? null,
        data.batchNumber ?? null, data.supplier ?? null, data.customer ?? null, data.notes ?? null,
        // Editing an adjustment's wording must preserve the original snapshot.
        data.type === 'adjustment' ? before.stock_before : round4(stockAfter - effect(data.type, quantity)),
        data.type === 'adjustment' ? before.stock_after : stockAfter, id, businessId]
    );
    row = rows[0];
  } else {
    // Undo the adjustment's actual delta, preserving sales made since it.
    const delta = before.type === 'adjustment'
      ? Number(before.stock_after) - Number(before.stock_before)
      : effect(before.type, Number(before.quantity));
    stockAfter = round4(Number(product.current_stock) - delta);
    await writeStock(client, product, stockAfter);
  }
  const labelled = await client.query(
    `SELECT COALESCE(SUM(quantity),0) AS quantity FROM barcode_labels
     WHERE business_id=$1 AND product_id=$2 AND status='in_stock'
     AND ($3::uuid IS NULL OR id<>$3)`, [businessId, product.id, label?.id || null]);
  const minimumStock = Number(labelled.rows[0].quantity) + (label && before.type === 'stock_out' ? Number(label.quantity) : 0);
  if (stockAfter < minimumStock) throw new ApiError(409, 'This reversal would remove stock assigned to labelled packs. Reverse their scans first.');
  if (label) await client.query('UPDATE barcode_labels SET status=$1, updated_at=NOW() WHERE id=$2', [before.type === 'stock_out' ? 'in_stock' : 'prepared', label.id]);
  await client.query("DELETE FROM cash_entries WHERE transaction_id=$1 AND business_id=$2 AND source='sale'", [id, businessId]);
  if (data) await postCash(client, row, product, before.created_by);
  else {
    // Keep the customer-side sale and any voided allocations as history even
    // though the stock ledger removes its reversed movement.
    await client.query("UPDATE credit_charges SET transaction_id=NULL,voided_at=NOW(),void_reason='Credit sale reversed' WHERE transaction_id=$1 AND business_id=$2", [id,businessId]);
    await client.query('DELETE FROM transactions WHERE id=$1 AND business_id=$2', [id, businessId]);
  }
  const creator = row ? (await client.query('SELECT id, name, email FROM users WHERE id=$1', [before.created_by])).rows[0] : null;
  return { before: new Transaction(before), transaction: row ? present(row, product, creator) : null };
});

module.exports = { createMovement, createMovementOnClient, changeMovement, lockProduct };
