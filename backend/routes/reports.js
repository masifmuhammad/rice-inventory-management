const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const CashWithdrawal = require('../models/CashWithdrawal');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// @route   GET /api/reports/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ isActive: true });
    
    const products = await Product.find({ isActive: true });
    const totalStockValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);
    const totalStockQuantity = products.reduce((sum, p) => sum + p.currentStock, 0);
    
    const lowStockProducts = products.filter(p => p.currentStock <= p.minStockLevel);
    
    // Get transactions for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTransactions = await Transaction.find({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    const stockIn = recentTransactions
      .filter(t => t.type === 'stock_in')
      .reduce((sum, t) => sum + t.quantity, 0);
    
    const stockOut = recentTransactions
      .filter(t => t.type === 'stock_out')
      .reduce((sum, t) => sum + t.quantity, 0);

    // Get cash withdrawals for last 30 days
    const recentWithdrawals = await CashWithdrawal.find({
      createdAt: { $gte: thirtyDaysAgo }
    });

    const totalWithdrawals = recentWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    res.json({
      totalProducts,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
      totalStockQuantity: Math.round(totalStockQuantity * 100) / 100,
      lowStockCount: lowStockProducts.length,
      lowStockProducts: lowStockProducts.map(p => ({
        id: p._id,
        name: p.name,
        sku: p.sku,
        currentStock: p.currentStock,
        minStockLevel: p.minStockLevel
      })),
      recentActivity: {
        stockIn: Math.round(stockIn * 100) / 100,
        stockOut: Math.round(stockOut * 100) / 100,
        transactions: recentTransactions.length,
        cashWithdrawals: recentWithdrawals.length,
        totalWithdrawn: Math.round(totalWithdrawals * 100) / 100
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/stock-value
// @desc    Get stock value report
// @access  Private
router.get('/stock-value', auth, async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ name: 1 });
    
    const report = products.map(product => ({
      id: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      currentStock: product.currentStock,
      unit: product.unit,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      stockValue: Math.round(product.currentStock * product.costPrice * 100) / 100,
      potentialValue: Math.round(product.currentStock * product.sellingPrice * 100) / 100
    }));

    const totalValue = report.reduce((sum, item) => sum + item.stockValue, 0);
    const totalPotentialValue = report.reduce((sum, item) => sum + item.potentialValue, 0);

    res.json({
      products: report,
      summary: {
        totalValue: Math.round(totalValue * 100) / 100,
        totalPotentialValue: Math.round(totalPotentialValue * 100) / 100
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/movement
// @desc    Get stock movement report
// @access  Private
router.get('/movement', auth, async (req, res) => {
  try {
    const { startDate, endDate, productId } = req.query;
    const query = {};

    if (productId) query.product = productId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('product', 'name sku category')
      .sort({ createdAt: -1 });

    const grouped = transactions.reduce((acc, t) => {
      const key = t.product._id.toString();
      if (!acc[key]) {
        acc[key] = {
          product: {
            id: t.product._id,
            name: t.product.name,
            sku: t.product.sku,
            category: t.product.category
          },
          stockIn: 0,
          stockOut: 0,
          adjustments: 0,
          transactions: []
        };
      }

      if (t.type === 'stock_in') acc[key].stockIn += t.quantity;
      else if (t.type === 'stock_out') acc[key].stockOut += t.quantity;
      else if (t.type === 'adjustment') acc[key].adjustments += 1;

      acc[key].transactions.push({
        id: t._id,
        type: t.type,
        quantity: t.quantity,
        date: t.createdAt
      });

      return acc;
    }, {});

    res.json(Object.values(grouped));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/bi-analytics
// @desc    Get comprehensive BI analytics
// @access  Private
router.get('/bi-analytics', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    } else {
      // Default to last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      dateFilter.createdAt = { $gte: ninetyDaysAgo };
    }

    // Category-wise stock value
    const products = await Product.find({ isActive: true });
    const categoryAnalysis = products.reduce((acc, p) => {
      if (!acc[p.category]) {
        acc[p.category] = {
          category: p.category,
          totalStock: 0,
          totalValue: 0,
          totalPotentialValue: 0,
          productCount: 0
        };
      }
      acc[p.category].totalStock += p.currentStock;
      acc[p.category].totalValue += p.currentStock * p.costPrice;
      acc[p.category].totalPotentialValue += p.currentStock * p.sellingPrice;
      acc[p.category].productCount += 1;
      return acc;
    }, {});

    // Transaction trends by type
    const transactions = await Transaction.find(dateFilter).populate('product', 'name category');

    const transactionTrends = {};
    const categoryRevenue = {};

    transactions.forEach(t => {
      // Trend by date
      const dateKey = new Date(t.createdAt).toISOString().split('T')[0];
      if (!transactionTrends[dateKey]) {
        transactionTrends[dateKey] = { date: dateKey, stock_in: 0, stock_out: 0, revenue: 0 };
      }
      if (t.type === 'stock_in') transactionTrends[dateKey].stock_in += t.quantity;
      if (t.type === 'stock_out') {
        transactionTrends[dateKey].stock_out += t.quantity;
        transactionTrends[dateKey].revenue += t.totalValue || 0;
      }

      // Revenue by category
      if (t.type === 'stock_out' && t.product) {
        const cat = t.product.category;
        if (!categoryRevenue[cat]) categoryRevenue[cat] = { category: cat, revenue: 0, quantity: 0 };
        categoryRevenue[cat].revenue += t.totalValue || 0;
        categoryRevenue[cat].quantity += t.quantity;
      }
    });

    // Top performing products
    const productPerformance = {};
    transactions.filter(t => t.type === 'stock_out').forEach(t => {
      const key = t.product._id.toString();
      if (!productPerformance[key]) {
        productPerformance[key] = {
          id: t.product._id,
          name: t.product.name,
          category: t.product.category,
          totalQuantitySold: 0,
          totalRevenue: 0,
          transactionCount: 0
        };
      }
      productPerformance[key].totalQuantitySold += t.quantity;
      productPerformance[key].totalRevenue += t.totalValue || 0;
      productPerformance[key].transactionCount += 1;
    });

    const topProducts = Object.values(productPerformance)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    res.json({
      categoryAnalysis: Object.values(categoryAnalysis),
      transactionTrends: Object.values(transactionTrends).sort((a, b) => a.date.localeCompare(b.date)),
      categoryRevenue: Object.values(categoryRevenue),
      topProducts,
      summary: {
        totalProducts: products.length,
        totalInventoryValue: products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0),
        totalRevenue: transactions
          .filter(t => t.type === 'stock_out')
          .reduce((sum, t) => sum + (t.totalValue || 0), 0),
        totalTransactions: transactions.length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/profit-analysis
// @desc    Get profit and margin analysis
// @access  Private
router.get('/profit-analysis', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const salesTransactions = await Transaction.find({
      ...dateFilter,
      type: 'stock_out'
    }).populate('product', 'name category costPrice sellingPrice');

    const profitAnalysis = salesTransactions.map(t => {
      const costPrice = t.product.costPrice || 0;
      const sellingPrice = t.price || t.product.sellingPrice || 0;
      const profit = (sellingPrice - costPrice) * t.quantity;
      const profitMargin = costPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;

      return {
        transactionId: t._id,
        productName: t.product.name,
        category: t.product.category,
        quantity: t.quantity,
        costPrice,
        sellingPrice,
        revenue: t.totalValue || (sellingPrice * t.quantity),
        profit: Math.round(profit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        date: t.createdAt
      };
    });

    const totalRevenue = profitAnalysis.reduce((sum, t) => sum + t.revenue, 0);
    const totalProfit = profitAnalysis.reduce((sum, t) => sum + t.profit, 0);
    const avgMargin = profitAnalysis.length > 0
      ? profitAnalysis.reduce((sum, t) => sum + t.profitMargin, 0) / profitAnalysis.length
      : 0;

    res.json({
      transactions: profitAnalysis,
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        averageMargin: Math.round(avgMargin * 100) / 100,
        transactionCount: profitAnalysis.length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
