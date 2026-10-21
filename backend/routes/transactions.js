const { dateRange } = require('../db/dates');
const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { requireCapability } = require('../middleware/permissions');
const { createMovement, changeMovement } = require('../services/stockLedger');

// @route   GET /api/transactions
// @desc    List transactions, newest first
// @access  Private
router.get(
  '/',
  auth,
  requireCapability('transactions.view'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('type').optional().isIn(['stock_in', 'stock_out', 'adjustment', 'transfer']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { productId, type, startDate, endDate, search, page = 1, limit = 25 } = req.query;
    const filter = { businessId: req.businessId };

    if (productId) filter.product = productId;
    if (type) filter.type = type;

    if (startDate || endDate) filter.createdAt = dateRange({ startDate, endDate });

    if (search) {
      const rx = { source: String(search).trim() };
      filter.$or = [{ reference: rx }, { supplier: rx }, { customer: rx }, { notes: rx }];
    }

    const [data, total] = await Promise.all([
      Transaction.find(filter, { skip: (page - 1) * limit, limit }),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
        hasMore: page * limit < total,
      },
    });
  })
);

// @route   POST /api/transactions
/**
 * Shared by create and correct. `product` is not here on purpose: pointing an
 * existing movement at a different product is not a correction, it is a
 * different transaction, and it would leave the original product's stock
 * silently wrong.
 */
const transactionValidators = [
  body('type')
    .isIn(['stock_in', 'stock_out', 'adjustment', 'transfer'])
    .withMessage('Pick a valid transaction type'),
  // An adjustment can legitimately set stock to zero; a movement cannot be zero.
  body('quantity')
    .isFloat({ min: 0, max: 9999999999 })
    .withMessage('Quantity must be 0 or greater')
    .toFloat()
    .custom((value, { req }) => {
      if (['stock_in', 'stock_out', 'transfer'].includes(req.body.type) && value <= 0) {
        throw new Error('Quantity must be greater than 0');
      }
      return true;
    }),
  body('price').optional({ values: 'falsy' }).isFloat({ min: 0, max: 9999999999 }).toFloat(),
  body('expiryDate').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid expiry date'),
  // Bounded to match the columns. An over-long value would otherwise be
  // rejected by Postgres *after* applyStockChange had already moved the
  // stock, relying on the best-effort revert to put it back.
  body('reference').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('batchNumber').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('supplier').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('customer').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }),
];

// @access  Private
router.post(
  '/',
  auth,
  requireCapability('transactions.create'),
  [body('product').isUUID().withMessage('Pick a product'), ...transactionValidators],
  validate,
  asyncHandler(async (req, res) => {
    const transaction = await createMovement(req.body, req.businessId, req.user);
    audit(req, 'CREATE_TRANSACTION', 'TRANSACTION', transaction.id, {
      type: transaction.type, product: transaction.product.name,
      quantity: transaction.quantity, stockAfter: transaction.stockAfter,
    });
    res.status(201).json(transaction);
  })
);

// @route   GET /api/transactions/:id
// @access  Private
router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.id, { businessId: req.businessId });

    if (!transaction) throw new ApiError(404, 'Transaction not found');
    res.json(transaction);
  })
);

// Correct and reverse use the same database locks as creation.
router.put(
  '/:id', auth, requireCapability('transactions.reverse'),
  [param('id').isUUID().withMessage('Invalid transaction id'), ...transactionValidators], validate,
  asyncHandler(async (req, res) => {
    const { before, transaction } = await changeMovement(req.params.id, req.businessId, req.user, req.body);
    audit(req, 'UPDATE_TRANSACTION', 'TRANSACTION', before.id, {},
      { type: before.type, quantity: before.quantity, totalValue: before.totalValue },
      { type: transaction.type, quantity: transaction.quantity, totalValue: transaction.totalValue });
    res.json(transaction);
  })
);

router.delete(
  '/:id', auth, requireCapability('transactions.reverse'),
  [param('id').isUUID().withMessage('Invalid transaction id')], validate,
  asyncHandler(async (req, res) => {
    const { before } = await changeMovement(req.params.id, req.businessId, req.user);
    audit(req, 'DELETE_TRANSACTION', 'TRANSACTION', before.id, { type: before.type, quantity: before.quantity });
    res.json({ message: 'Transaction reversed', id: before.id });
  })
);

module.exports = router;
