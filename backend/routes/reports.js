const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

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
        transactions: recentTransactions.length
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

module.exports = router;
