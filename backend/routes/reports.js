const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const CashEntry = require('../models/CashEntry');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireCapability, can } = require('../middleware/permissions');

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

/** Builds a createdAt filter from query params, falling back to a rolling window. */
const dateRange = (query, defaultDays = 30) => {
  const { startDate, endDate } = query;
  if (!startDate && !endDate) return { $gte: daysAgo(defaultDays) };

  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) {
    // A plain `YYYY-MM-DD` end date parses to midnight, which would silently drop
    // everything recorded on that final day.
    const end = new Date(endDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
};

/** Percentage change, guarding the divide-by-zero a new business always hits. */
const percentChange = (current, previous) => {
  if (!previous) return current > 0 ? 100 : 0;
  return round2(((current - previous) / previous) * 100);
};

// @route   GET /api/reports/dashboard
// @desc    Headline numbers for the dashboard
// @access  Private
router.get(
  '/dashboard',
  auth,
  requireCapability('products.view'),
  asyncHandler(async (req, res) => {
    const biz = req.businessId;
    const windowStart = daysAgo(30);
    const previousStart = daysAgo(60);

    const [inventory, lowStock, movement, previousMovement, withdrawals, expiringSoon] =
      await Promise.all([
        Product.aggregate(
          [
            { $match: { isActive: true } },
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalStockQuantity: { $sum: '$currentStock' },
                totalStockValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
                totalPotentialValue: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } },
              },
            },
          ],
          { businessId: biz }
        ),

        Product.find(
          { isActive: true, businessId: biz, $expr: { $lte: ['$currentStock', '$minStockLevel'] } },
          { sort: { currentStock: 1 }, limit: 10, select: 'name sku unit currentStock minStockLevel' }
        ),

        Transaction.aggregate([
          { $match: { businessId: biz, createdAt: { $gte: windowStart } } },
          {
            $group: {
              _id: '$type',
              quantity: { $sum: '$quantity' },
              value: { $sum: '$totalValue' },
              count: { $sum: 1 },
            },
          },
        ]),

        Transaction.aggregate([
          { $match: { businessId: biz, createdAt: { $gte: previousStart, $lt: windowStart } } },
          { $group: { _id: '$type', quantity: { $sum: '$quantity' }, value: { $sum: '$totalValue' }, count: { $sum: 1 } } },
        ]),

        CashEntry.aggregate([
          { $match: { businessId: biz, occurredAt: { $gte: windowStart } } },
          { $group: { _id: '$direction', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),

        Product.find(
          {
            isActive: true,
            businessId: biz,
            expiryDate: { $gte: new Date(), $lte: daysFromNow(30) },
          },
          { sort: { expiryDate: 1 }, limit: 10, select: 'name sku expiryDate currentStock unit' }
        ),
      ]);

    const byType = (rows, type) => rows.find((r) => r._id === type) || { quantity: 0, value: 0, count: 0 };

    const totals = inventory[0] || {
      totalProducts: 0,
      totalStockQuantity: 0,
      totalStockValue: 0,
      totalPotentialValue: 0,
    };

    const current = {
      stockIn: byType(movement, 'stock_in'),
      stockOut: byType(movement, 'stock_out'),
    };
    const previous = {
      stockIn: byType(previousMovement, 'stock_in'),
      stockOut: byType(previousMovement, 'stock_out'),
    };

    const transactionCount = movement.reduce((sum, r) => sum + r.count, 0);
    const previousCount = previousMovement.reduce((sum, r) => sum + r.count, 0);

    const cashOut = withdrawals.find((r) => r._id === 'out') || { total: 0, count: 0 };
    const cashIn = withdrawals.find((r) => r._id === 'in') || { total: 0, count: 0 };

    res.json({
      totalProducts: totals.totalProducts,
      totalStockValue: round2(totals.totalStockValue),
      totalStockQuantity: round2(totals.totalStockQuantity),
      totalPotentialValue: round2(totals.totalPotentialValue),
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock.map((p) => ({
        id: p._id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        currentStock: p.currentStock,
        minStockLevel: p.minStockLevel,
      })),
      expiringSoon: expiringSoon.map((p) => ({
        id: p._id,
        name: p.name,
        sku: p.sku,
        expiryDate: p.expiryDate,
        currentStock: p.currentStock,
        unit: p.unit,
      })),
      recentActivity: {
        stockIn: round2(current.stockIn.quantity),
        stockOut: round2(current.stockOut.quantity),
        revenue: round2(current.stockOut.value),
        transactions: transactionCount,
        cashWithdrawals: cashOut.count,
        totalWithdrawn: round2(cashOut.total),
        cashIn: round2(cashIn.total),
        cashInCount: cashIn.count,
        netCash: round2(cashIn.total - cashOut.total),
      },
      // Measured against the preceding 30 days — no placeholder percentages.
      trends: {
        stockIn: percentChange(current.stockIn.quantity, previous.stockIn.quantity),
        stockOut: percentChange(current.stockOut.quantity, previous.stockOut.quantity),
        revenue: percentChange(current.stockOut.value, previous.stockOut.value),
        transactions: percentChange(transactionCount, previousCount),
      },
    });
  })
);

// @route   GET /api/reports/stock-value
// @access  Private
router.get(
  '/stock-value',
  auth,
  requireCapability('reports.view'),
  asyncHandler(async (req, res) => {
    const products = await Product.find({ isActive: true, businessId: req.businessId }, { sort: { name: 1 } });

    const report = products.map((product) => ({
      id: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      currentStock: product.currentStock,
      unit: product.unit,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      minStockLevel: product.minStockLevel,
      stockValue: round2(product.currentStock * product.costPrice),
      potentialValue: round2(product.currentStock * product.sellingPrice),
      potentialProfit: round2(product.currentStock * (product.sellingPrice - product.costPrice)),
    }));

    res.json({
      products: report,
      summary: {
        totalValue: round2(report.reduce((sum, i) => sum + i.stockValue, 0)),
        totalPotentialValue: round2(report.reduce((sum, i) => sum + i.potentialValue, 0)),
        totalPotentialProfit: round2(report.reduce((sum, i) => sum + i.potentialProfit, 0)),
        productCount: report.length,
      },
    });
  })
);

// @route   GET /api/reports/movement
// @desc    Per-product stock in/out over a period
// @access  Private
router.get(
  '/movement',
  auth,
  requireCapability('reports.view'),
  asyncHandler(async (req, res) => {
    const match = { businessId: req.businessId, createdAt: dateRange(req.query) };
    if (req.query.productId) {
      const { isValidUuid } = require('../db/helpers');
      if (isValidUuid(req.query.productId)) {
        match.product = req.query.productId;
      }
    }

    const rows = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$product',
          stockIn: { $sum: { $cond: [{ $eq: ['$type', 'stock_in'] }, '$quantity', 0] } },
          stockOut: { $sum: { $cond: [{ $eq: ['$type', 'stock_out'] }, '$quantity', 0] } },
          adjustments: { $sum: { $cond: [{ $eq: ['$type', 'adjustment'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$type', 'stock_out'] }, '$totalValue', 0] } },
          transactionCount: { $sum: 1 },
        },
      },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $sort: { stockOut: -1 } },
    ]);

    res.json(
      rows.map((row) => ({
        product: {
          id: row._id,
          name: row.product?.name || 'Deleted product',
          sku: row.product?.sku || '—',
          category: row.product?.category || 'Other',
          unit: row.product?.unit || 'kg',
        },
        stockIn: round2(row.stockIn),
        stockOut: round2(row.stockOut),
        adjustments: row.adjustments,
        revenue: round2(row.revenue),
        transactionCount: row.transactionCount,
      }))
    );
  })
);

// @route   GET /api/reports/bi-analytics
// @desc    Category mix, daily trends and top performers
// @access  Private
router.get(
  '/bi-analytics',
  auth,
  requireCapability('reports.view'),
  asyncHandler(async (req, res) => {
    const biz = req.businessId;
    const range = dateRange(req.query, 90);

    const [categoryAnalysis, transactionTrends, categoryRevenue, topProducts, totals] =
      await Promise.all([
        Product.aggregate(
          [
            { $match: { isActive: true } },
            {
              $group: {
                _id: '$category',
                totalStock: { $sum: '$currentStock' },
                totalValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
                totalPotentialValue: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } },
                productCount: { $sum: 1 },
              },
            },
            { $sort: { totalValue: -1 } },
          ],
          { businessId: biz }
        ),

        Transaction.aggregate([
          { $match: { businessId: biz, createdAt: range } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              stock_in: { $sum: { $cond: [{ $eq: ['$type', 'stock_in'] }, '$quantity', 0] } },
              stock_out: { $sum: { $cond: [{ $eq: ['$type', 'stock_out'] }, '$quantity', 0] } },
              revenue: { $sum: { $cond: [{ $eq: ['$type', 'stock_out'] }, '$totalValue', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        Transaction.aggregate([
          { $match: { businessId: biz, createdAt: range, type: 'stock_out' } },
          { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
          { $unwind: '$product' },
          {
            $group: {
              _id: '$product.category',
              revenue: { $sum: '$totalValue' },
              quantity: { $sum: '$quantity' },
            },
          },
          { $sort: { revenue: -1 } },
        ]),

        Transaction.aggregate([
          { $match: { businessId: biz, createdAt: range, type: 'stock_out' } },
          {
            $group: {
              _id: '$product',
              totalQuantitySold: { $sum: '$quantity' },
              totalRevenue: { $sum: '$totalValue' },
              transactionCount: { $sum: 1 },
            },
          },
          { $sort: { totalRevenue: -1 } },
          { $limit: 10 },
          { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
          { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        ]),

        Transaction.aggregate([
          { $match: { businessId: biz, createdAt: range } },
          {
            $group: {
              _id: null,
              totalTransactions: { $sum: 1 },
              totalRevenue: { $sum: { $cond: [{ $eq: ['$type', 'stock_out'] }, '$totalValue', 0] } },
            },
          },
        ]),

      ]);

    const inventoryValue = await Product.aggregate(
      [
        { $match: { isActive: true } },
        { $group: { _id: null, value: { $sum: { $multiply: ['$currentStock', '$costPrice'] } }, count: { $sum: 1 } } },
      ],
      { businessId: biz }
    );

    const inv = inventoryValue[0] || { value: 0, count: 0 };
    const tot = totals[0] || { totalTransactions: 0, totalRevenue: 0 };

    res.json({
      categoryAnalysis: categoryAnalysis.map((c) => ({
        category: c._id,
        totalStock: round2(c.totalStock),
        totalValue: round2(c.totalValue),
        totalPotentialValue: round2(c.totalPotentialValue),
        productCount: c.productCount,
      })),
      transactionTrends: transactionTrends.map((t) => ({
        date: t._id,
        stock_in: round2(t.stock_in),
        stock_out: round2(t.stock_out),
        revenue: round2(t.revenue),
      })),
      categoryRevenue: categoryRevenue.map((c) => ({
        category: c._id,
        revenue: round2(c.revenue),
        quantity: round2(c.quantity),
      })),
      topProducts: topProducts.map((p) => ({
        id: p._id,
        name: p.product?.name || 'Deleted product',
        category: p.product?.category || 'Other',
        unit: p.product?.unit || 'kg',
        totalQuantitySold: round2(p.totalQuantitySold),
        totalRevenue: round2(p.totalRevenue),
        transactionCount: p.transactionCount,
      })),
      summary: {
        totalProducts: inv.count,
        totalInventoryValue: round2(inv.value),
        totalRevenue: round2(tot.totalRevenue),
        totalTransactions: tot.totalTransactions,
      },
    });
  })
);

// @route   GET /api/reports/profit-analysis
// @desc    Margin per sale over a period
// @access  Private
router.get(
  '/profit-analysis',
  auth,
  requireCapability('reports.view'),
  asyncHandler(async (req, res) => {
    const sales = await Transaction.find(
      { businessId: req.businessId, type: 'stock_out', createdAt: dateRange(req.query) },
      { limit: 1000 }
    );

    const transactions = sales.map((t) => {
      const costPrice = t.product?.costPrice || 0;
      const sellingPrice = t.price || t.product?.sellingPrice || 0;
      const revenue = t.totalValue ?? sellingPrice * t.quantity;
      const profit = (sellingPrice - costPrice) * t.quantity;

      return {
        transactionId: t._id,
        productName: t.product?.name || 'Deleted product',
        category: t.product?.category || 'Other',
        quantity: t.quantity,
        unit: t.unit,
        costPrice,
        sellingPrice,
        revenue: round2(revenue),
        profit: round2(profit),
        // Margin is profit over revenue; guard the zero-revenue case.
        profitMargin: sellingPrice > 0 ? round2(((sellingPrice - costPrice) / sellingPrice) * 100) : 0,
        date: t.createdAt,
      };
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + t.revenue, 0);
    const totalProfit = transactions.reduce((sum, t) => sum + t.profit, 0);

    res.json({
      transactions,
      summary: {
        totalRevenue: round2(totalRevenue),
        totalProfit: round2(totalProfit),
        // Weighted by revenue rather than a flat mean, so one tiny sale can't
        // swing the headline margin.
        averageMargin: totalRevenue > 0 ? round2((totalProfit / totalRevenue) * 100) : 0,
        transactionCount: transactions.length,
      },
    });
  })
);

module.exports = router;
