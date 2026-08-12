const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const CashEntry = require('../models/CashEntry');

const round2 = (n) => Math.round((n || 0) * 100) / 100;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Snapshot of business data for AI — numbers always come from here, never from the model. */
const gatherBusinessContext = async (businessId, { canViewCash = false } = {}) => {
  const windowStart = daysAgo(30);
  const todayStart = startOfToday();

  const [products, lowStock, todayMovement, monthMovement, expiringSoon] = await Promise.all([
    Product.find({ isActive: true, businessId }, { sort: { name: 1 }, limit: 200 }),
    Product.find(
      { isActive: true, businessId, $expr: { $lte: ['$currentStock', '$minStockLevel'] } },
      { sort: { currentStock: 1 }, limit: 15 }
    ),
    Transaction.aggregate([
      { $match: { businessId, createdAt: { $gte: todayStart } } },
      { $group: { _id: '$type', quantity: { $sum: '$quantity' }, value: { $sum: '$totalValue' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { businessId, createdAt: { $gte: windowStart } } },
      { $group: { _id: '$type', quantity: { $sum: '$quantity' }, value: { $sum: '$totalValue' }, count: { $sum: 1 } } },
    ]),
    Product.find(
      {
        isActive: true,
        businessId,
        expiryDate: { $gte: new Date(), $lte: daysFromNow(30) },
      },
      { sort: { expiryDate: 1 }, limit: 10, select: 'name currentStock unit expiryDate minStockLevel' }
    ),
  ]);

  const byType = (rows, type) => rows.find((r) => r._id === type) || { quantity: 0, value: 0, count: 0 };

  const todayOut = byType(todayMovement, 'stock_out');
  const todayIn = byType(todayMovement, 'stock_in');
  const monthOut = byType(monthMovement, 'stock_out');
  const monthIn = byType(monthMovement, 'stock_in');

  let cashSummary = null;
  if (canViewCash) {
    const cashRows = await CashEntry.aggregate([
      { $match: { businessId, occurredAt: { $gte: windowStart } } },
      { $group: { _id: '$direction', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const cashIn = cashRows.find((r) => r._id === 'in') || { total: 0, count: 0 };
    const cashOut = cashRows.find((r) => r._id === 'out') || { total: 0, count: 0 };
    cashSummary = {
      cashIn: round2(cashIn.total),
      cashOut: round2(cashOut.total),
      netCash: round2(cashIn.total - cashOut.total),
      withdrawalCount: cashOut.count,
    };
  }

  const productCatalog = products.map((p) => ({
    id: p._id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    unit: p.unit,
    currentStock: p.currentStock,
    minStockLevel: p.minStockLevel,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
  }));

  const restockHints = lowStock.map((p) => {
    const dailyVelocity =
      monthOut.quantity > 0 && monthOut.count > 0
        ? round2(monthOut.quantity / 30)
        : 0;
    const daysLeft =
      dailyVelocity > 0 ? Math.max(0, Math.floor(p.currentStock / dailyVelocity)) : null;
    const suggestedQty = Math.max(p.minStockLevel * 2 - p.currentStock, p.minStockLevel, 0);

    return {
      id: p._id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      minStockLevel: p.minStockLevel,
      daysLeft,
      suggestedReorder: round2(suggestedQty),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    productCount: products.length,
    products: productCatalog,
    lowStock: lowStock.map((p) => ({
      id: p._id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      minStockLevel: p.minStockLevel,
    })),
    restockHints,
    expiringSoon: expiringSoon.map((p) => ({
      id: p._id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      expiryDate: p.expiryDate,
    })),
    today: {
      salesQuantity: round2(todayOut.quantity),
      salesValue: round2(todayOut.value),
      salesCount: todayOut.count,
      stockInQuantity: round2(todayIn.quantity),
      stockInCount: todayIn.count,
    },
    last30Days: {
      salesQuantity: round2(monthOut.quantity),
      salesValue: round2(monthOut.value),
      salesCount: monthOut.count,
      stockInQuantity: round2(monthIn.quantity),
    },
    cash: cashSummary,
  };
};

/** Rule-based anomalies — AI only explains them. */
const detectAnomalies = async (businessId) => {
  const pool = require('../config/db').getPool();
  const since = daysAgo(7);

  const { rows } = await pool.query(
    `SELECT t.id, t.type, t.quantity, t.unit, t.total_value, t.customer, t.price,
            p.name AS product_name, p.cost_price
     FROM transactions t
     LEFT JOIN products p ON p.id = t.product_id
     WHERE t.business_id = $1 AND t.created_at >= $2 AND t.type = 'stock_out'
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [businessId, since]
  );

  const anomalies = [];

  for (const row of rows) {
    const totalValue = Number(row.total_value) || 0;
    const productName = row.product_name || 'Unknown product';

    if (totalValue >= 50000 && anomalies.filter((a) => a.type === 'large_sale').length < 3) {
      anomalies.push({
        type: 'large_sale',
        message: `Large sale: ${row.quantity} ${row.unit} of ${productName} for Rs ${round2(totalValue)}`,
        transactionId: row.id,
      });
    }

    if ((!row.customer || row.customer.trim() === '') && anomalies.filter((a) => a.type === 'missing_customer').length < 3) {
      anomalies.push({
        type: 'missing_customer',
        message: `Stock out with no customer: ${row.quantity} ${row.unit} of ${productName}`,
        transactionId: row.id,
      });
    }

    if (
      row.cost_price != null &&
      row.price != null &&
      Number(row.price) < Number(row.cost_price) &&
      anomalies.filter((a) => a.type === 'below_cost').length < 3
    ) {
      anomalies.push({
        type: 'below_cost',
        message: `Sale below cost: ${productName} sold at Rs ${row.price} (cost Rs ${row.cost_price})`,
        transactionId: row.id,
      });
    }
  }

  return anomalies.slice(0, 8);
};

module.exports = { gatherBusinessContext, detectAnomalies, round2 };
