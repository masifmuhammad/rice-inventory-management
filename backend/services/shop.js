const { getPool, withTransaction } = require('../config/db');
const { round2, round4 } = require('../db/helpers');
const { ApiError } = require('../middleware/errorHandler');
const { lockProduct, createMovementOnClient } = require('./stockLedger');
const { recordPurchaseOnClient } = require('./supplierLedger');
const idempotent = require('./idempotentRequest');
const { localDay } = require('../db/dates');

const catalogue = async (businessId) => {
  const { rows } = await getPool().query(`SELECT p.*,c.pack_quantity,c.payment_days,c.supplier_id AS shop_supplier_id,
    s.name AS supplier_name,c.button_number,c.button_label,c.colour,
    COALESCE((SELECT SUM(quantity) FROM barcode_labels l WHERE l.business_id=p.business_id AND l.product_id=p.id AND l.status='in_stock'),0) AS labelled
    FROM products p LEFT JOIN shop_products c ON c.product_id=p.id AND c.business_id=p.business_id
    LEFT JOIN suppliers s ON s.id=c.supplier_id AND s.business_id=p.business_id
    WHERE p.business_id=$1 AND p.is_active ORDER BY c.button_number NULLS LAST,p.name,p.id`, [businessId]);
  return { products: rows.map((p) => ({ id: p.id, name: p.name, unit: p.unit,
    currentStock: Number(p.current_stock), availableStock: round4(Math.max(0, Number(p.current_stock) - Number(p.labelled))),
    sellingPrice: Number(p.selling_price), costPrice: Number(p.cost_price),
    packQuantity: p.pack_quantity == null ? null : Number(p.pack_quantity),
    supplierId: p.shop_supplier_id, supplierName: p.supplier_name, buttonNumber: p.button_number,
    buttonLabel: p.button_label, paymentDays: Number(p.payment_days || 0), colour: p.colour || 'green' })) };
};

const configure = (id, data, businessId) => withTransaction(async (client) => {
  // Keep configuration writes consistent with sales and receipt product locks.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`shop-setup:${businessId}`]);
  await lockProduct(client, id, businessId, true);
  if (data.supplierId && !(await client.query('SELECT id FROM suppliers WHERE id=$1 AND business_id=$2', [data.supplierId, businessId])).rows.length) throw new ApiError(404, 'Supplier not found');
  await client.query(`INSERT INTO shop_products (business_id,product_id,pack_quantity,supplier_id,button_number,button_label,colour,payment_days)
    VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(button_number),0)+1 FROM shop_products WHERE business_id=$1),$5,$6,$7)
    ON CONFLICT (business_id,product_id) DO UPDATE SET pack_quantity=EXCLUDED.pack_quantity,
      supplier_id=EXCLUDED.supplier_id,button_label=EXCLUDED.button_label,colour=EXCLUDED.colour,payment_days=EXCLUDED.payment_days`,
  [businessId, id, round4(data.packQuantity), data.supplierId || null, data.buttonLabel || '', data.colour || 'green', Number(data.paymentDays || 0)]);
  return { id };
});

const config = async (client, id, businessId) => {
  const row = (await client.query('SELECT * FROM shop_products WHERE business_id=$1 AND product_id=$2', [businessId, id])).rows[0];
  if (!row) throw new ApiError(409, 'Ask an administrator to set up this product in Shop mode first.');
  return row;
};
const checkQuote = (item, product, settings, mode) => {
  if (round4(item.packQuantity) !== Number(settings.pack_quantity)
    || round4(item.unitPrice) !== Number(mode === 'sale' ? product.selling_price : product.cost_price)
    || (mode === 'receive' && item.supplierId !== settings.supplier_id)) {
    throw new ApiError(409, 'The price or packet setup changed. Refresh the products and check the total before saving.');
  }
};

const checkout = (data, businessId, user) => idempotent('shop', data, businessId, async (client) => {
  const unique = new Set(data.items.map((item) => item.product));
  if (unique.size !== data.items.length) throw new ApiError(400, 'Each product must appear once. Change its packet count instead.');
  if (data.mode === 'receive') {
    if (data.items.length !== 1) throw new ApiError(400, 'Receive one rice product at a time.');
    const item = data.items[0];
    const settings = await config(client, item.product, businessId);
    if (!settings.supplier_id) throw new ApiError(409, 'Ask an administrator to choose the supplier for this product first.');
    const quantity = round4(Number(settings.pack_quantity) * item.count);
    const today = localDay(), due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + Number(settings.payment_days));
    // Reuse the real supplier receipt inside THIS transaction. A receipt must
    // never add stock without its bill, or commit before its acknowledgement.
    const purchase = await recordPurchaseOnClient(client, settings.supplier_id, {
      requestId: data.requestId, product: item.product, quantity, price: item.unitPrice,
      purchaseDate: today, dueDate: due.toISOString().slice(0,10), amountPaid: 0, method: 'cash',
      notes: `Shop mode: ${item.count} packets received`,
    }, businessId, user);
    // The receipt now holds the product lock. Re-read settings so a concurrent
    // admin change causes a complete rollback rather than a wrong packet size.
    const current = await config(client, item.product, businessId);
    const product = await lockProduct(client, item.product, businessId, true);
    checkQuote(item, product, current, 'receive');
    if (current.supplier_id !== settings.supplier_id || Number(current.pack_quantity) !== Number(settings.pack_quantity) || current.payment_days !== settings.payment_days) throw new ApiError(409, 'The supplier or packet size changed. Refresh products before receiving this delivery.');
    const movement = purchase.transaction || (await client.query('SELECT id FROM transactions WHERE id=$1 AND business_id=$2', [purchase.transactionId, businessId])).rows[0];
    if (!movement) throw new ApiError(409, 'This delivery was reversed. Ask an administrator to check it before receiving it again.');
    return { mode: data.mode, count: item.count, total: Number(purchase.amount), transactions: [movement], purchaseId: purchase.id };
  }
  // All basket products lock in the same order. Other tills cannot oversell,
  // and one failed line rolls the entire basket and its cash entries back.
  const products = new Map();
  for (const id of [...unique].sort()) products.set(id, await lockProduct(client, id, businessId, true));
  const transactions = [];
  for (const item of data.items) {
    const product = products.get(item.product), settings = await config(client, item.product, businessId);
    checkQuote(item, product, settings, 'sale');
    const quantity = round4(Number(settings.pack_quantity) * item.count);
    if (round2(quantity * Number(product.selling_price)) <= 0) throw new ApiError(409, 'Ask an administrator to set a selling price for this product.');
    transactions.push(await createMovementOnClient(client, { product: item.product, type: 'stock_out', quantity,
      price: Number(product.selling_price), notes: `Shop mode: ${item.count} packets sold`, paymentType: 'cash' }, businessId, user));
  }
  return { mode: data.mode, count: data.items.reduce((sum, item) => sum + item.count, 0),
    total: round2(transactions.reduce((sum, tx) => sum + tx.totalValue, 0)), transactions };
});

module.exports = { catalogue, configure, checkout };
