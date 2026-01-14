const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

// @route   GET /api/transactions
// @desc    Get all transactions
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { productId, type, startDate, endDate, limit = 100 } = req.query;
    const query = {};

    if (productId) query.product = productId;
    if (type) query.type = type;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('product', 'name sku category unit')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/transactions
// @desc    Create new transaction
// @access  Private
router.post('/', [
  auth,
  body('type').isIn(['stock_in', 'stock_out', 'adjustment', 'transfer']).withMessage('Invalid transaction type'),
  body('product').notEmpty().withMessage('Product is required'),
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, product: productId, quantity, price, ...otherFields } = req.body;

    // Get product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const stockBefore = product.currentStock;
    let stockAfter = stockBefore;

    // Calculate stock change
    if (type === 'stock_in') {
      stockAfter = stockBefore + quantity;
    } else if (type === 'stock_out') {
      if (stockBefore < quantity) {
        return res.status(400).json({ message: 'Insufficient stock' });
      }
      stockAfter = stockBefore - quantity;
    } else if (type === 'adjustment') {
      stockAfter = quantity; // For adjustment, quantity is the new stock level
    }

    // Calculate total value
    const totalValue = price ? price * quantity : null;

    // Create transaction
    const transaction = new Transaction({
      type,
      product: productId,
      quantity,
      unit: product.unit,
      price: price || product.costPrice,
      totalValue: totalValue || (product.costPrice * quantity),
      stockBefore,
      stockAfter,
      createdBy: req.user._id,
      ...otherFields
    });

    await transaction.save();

    // Update product stock
    product.currentStock = stockAfter;
    await product.save();

    // Populate and return
    await transaction.populate('product', 'name sku category unit');
    await transaction.populate('createdBy', 'name email');

    res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/transactions/:id
// @desc    Get single transaction
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('product', 'name sku category unit')
      .populate('createdBy', 'name email');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
