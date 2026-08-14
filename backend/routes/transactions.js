const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const CashEntry = require('../models/CashEntry');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { requireCapability } = require('../middleware/permissions');
const { resolveUuid } = require('../db/helpers');
const { withTransaction } = require('../config/db');

const { round2 } = require('../db/helpers');

/**
 * Stock levels, not money. `current_stock` and `quantity` are NUMERIC(14,4), so
 * a weight can legitimately carry four decimals; rounding the recorded
 * before/after snapshot to two would make the ledger disagree with the balance
 * it was taken from. Money stays on round2 — currency really is two places.
 */
const { round4: roundQty } = require('../db/helpers');

const resolveProductId = (transaction) =>
  resolveUuid(transaction.productId) || resolveUuid(transaction.product);

/**
 * Applies a stock change atomically and returns { stockBefore, stockAfter }.
 *
 * Reading the product and saving it back separately loses concurrent updates:
 * two simultaneous sales both read stock 100 and both write 90, so 20kg leaves
 * the warehouse but only 10kg leaves the books. `$inc` moves the decision into
 * the database, and the `currentStock: { $gte: quantity }` guard makes
 * "don't oversell" part of the same atomic operation.
 */
const applyStockChange = async (productId, type, quantity) => {
  if (type === 'stock_in') {
    const updated = await Product.findOneAndUpdate(
      { _id: productId, isActive: true },
      { $inc: { currentStock: quantity } },
      { new: true }
    );
    if (!updated) throw new ApiError(404, 'Product not found');
    return { stockBefore: roundQty(updated.currentStock - quantity), stockAfter: roundQty(updated.currentStock), product: updated };
  }

  if (type === 'stock_out') {
    const updated = await Product.findOneAndUpdate(
      { _id: productId, isActive: true, currentStock: { $gte: quantity } },
      { $inc: { currentStock: -quantity } },
      { new: true }
    );

    if (!updated) {
      const product = await Product.findById(productId);
      if (!product || !product.isActive) throw new ApiError(404, 'Product not found');
      throw new ApiError(
        400,
        `Not enough stock. ${product.name} has ${product.currentStock} ${product.unit} available.`
      );
    }

    // `Number()` is not decoration: current_stock is NUMERIC, and a stringly
    // typed one would make this `+` concatenate — recording stockBefore as
    // equal to stockAfter, so every sale claims to have moved nothing.
    return {
      stockBefore: roundQty(Number(updated.currentStock) + quantity),
      stockAfter: roundQty(Number(updated.currentStock)),
      product: updated,
    };
  }

  if (type === 'transfer') {
    // A transfer moves stock between locations — the quantity on hand does not
    // change. Treating it like an adjustment (as this once did) overwrote the
    // level with the transferred amount and destroyed the rest of the stock.
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) throw new ApiError(404, 'Product not found');

    const level = roundQty(product.currentStock);
    return { stockBefore: level, stockAfter: level, product };
  }

  // adjustment: quantity is the corrected stock level, not a delta.
  const previous = await Product.findOneAndUpdate(
    { _id: productId, isActive: true },
    { $set: { currentStock: quantity } },
    { new: false }
  );
  if (!previous) throw new ApiError(404, 'Product not found');

  const product = await Product.findById(productId);
  return { stockBefore: roundQty(previous.currentStock), stockAfter: roundQty(quantity), product };
};

/**
 * Posts a sale to the cash book so the ledger reflects money actually taken in,
 * without the owner re-typing every sale.
 *
 * Best-effort on purpose: the stock movement is the primary record, and refusing
 * to record that a sale happened because a bookkeeping row failed would be worse
 * than a line the owner can add by hand. The unique index on `transaction` means
 * a retry can never double-post.
 */
const postSaleToCashBook = async (transaction, product, userId, businessId) => {
  try {
    await CashEntry.create({
      businessId,
      direction: 'in',
      amount: transaction.totalValue,
      category: 'Sale',
      purpose: `Sale — ${product.name}`,
      party: transaction.customer || '',
      reference: transaction.reference || '',
      source: 'sale',
      transaction: transaction._id,
      occurredAt: transaction.createdAt || new Date(),
      createdBy: userId,
    });
  } catch (error) {
    if (error.code !== 11000) {
      console.error('⚠️  Sale recorded but not posted to the cash book:', error.message);
    }
  }
};

/**
 * Undoes a stock change after the ledger write failed.
 *
 * Movements are reversed with `$inc` rather than by writing the old level back:
 * a `$set` would silently discard any concurrent sale that landed in between,
 * which is the very race the `$inc` in `applyStockChange` exists to prevent.
 * Adjustments have no delta to invert, so restoring the recorded level is the
 * only option there.
 */
const revertStockChange = async (productId, type, quantity, stockBefore) => {
  try {
    if (type === 'stock_in') {
      await Product.updateOne({ _id: productId }, { $inc: { currentStock: -quantity } });
    } else if (type === 'stock_out') {
      await Product.updateOne({ _id: productId }, { $inc: { currentStock: quantity } });
    } else if (type === 'adjustment') {
      await Product.updateOne({ _id: productId }, { $set: { currentStock: stockBefore } });
    }
    // transfer never moved anything, so there is nothing to undo.
  } catch (error) {
    console.error('❌ Failed to revert stock after a failed transaction:', error.message);
  }
};

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

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        // A bare YYYY-MM-DD parses to midnight, so `<=` would exclude the whole
        // of the last day the user asked for. The reports, cash book and audit
        // routes all extend it; this one was missed.
        const end = new Date(endDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
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
    .isFloat({ min: 0 })
    .withMessage('Quantity must be 0 or greater')
    .toFloat()
    .custom((value, { req }) => {
      if (['stock_in', 'stock_out'].includes(req.body.type) && value <= 0) {
        throw new Error('Quantity must be greater than 0');
      }
      return true;
    }),
  body('price').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
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
    const { type, product: productId, quantity, price, reference, batchNumber, expiryDate, supplier, customer, notes } = req.body;

    const ownedProduct = await Product.findById(productId, { businessId: req.businessId });
    if (!ownedProduct) throw new ApiError(404, 'Product not found');

    const { stockBefore, stockAfter, product } = await applyStockChange(productId, type, quantity);

    const unitPrice = price ?? (type === 'stock_out' ? product.sellingPrice : product.costPrice);

    // The rollback covers this write and nothing else. Wrapping the steps below
    // as well meant a failure in `populate` — a read — would undo a stock
    // movement whose transaction had already been committed, leaving the two
    // permanently disagreeing.
    let transaction;
    try {
      transaction = await Transaction.create({
        businessId: req.businessId,
        type,
        product: productId,
        quantity,
        unit: product.unit,
        price: unitPrice,
        totalValue: round2(unitPrice * quantity),
        stockBefore,
        stockAfter,
        createdBy: req.user._id,
        reference,
        batchNumber,
        expiryDate: expiryDate || undefined,
        supplier,
        customer,
        notes,
      });
    } catch (error) {
      await revertStockChange(productId, type, quantity, stockBefore);
      throw error;
    }

    // Past this point the movement is recorded. Anything that fails now is
    // cosmetic and must not roll back a committed transaction.
    if (type === 'stock_out' && transaction.totalValue > 0) {
      await postSaleToCashBook(transaction, product, req.user._id, req.businessId);
    }

    await transaction.populate('product', 'name sku category unit');
    await transaction.populate('createdBy', 'name email');

    audit(req, 'CREATE_TRANSACTION', 'TRANSACTION', transaction._id, {
      type,
      product: product.name,
      quantity,
      stockAfter,
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

/** What a movement does to the stock level. A transfer relocates, it does not change the count. */
const stockEffect = (type, quantity) =>
  type === 'stock_in' ? Number(quantity) : type === 'stock_out' ? -Number(quantity) : 0;

// @route   PUT /api/transactions/:id
// @desc    Correct a transaction that was recorded wrongly
// @access  Private
router.put(
  '/:id',
  auth,
  requireCapability('transactions.reverse'),
  [param('id').isUUID().withMessage('Invalid transaction id'), ...transactionValidators],
  validate,
  asyncHandler(async (req, res) => {
    const { type, quantity, price, reference, batchNumber, supplier, customer, notes } = req.body;

    const before = await Transaction.findById(req.params.id, { businessId: req.businessId });
    if (!before) throw new ApiError(404, 'Transaction not found');

    const productId = resolveProductId(before);
    if (!productId) throw new ApiError(400, 'This transaction has no product attached');

    /**
     * An adjustment means "the true level is X", so it has no delta to move —
     * re-basing one retroactively would silently rewrite every level recorded
     * after it. Its wording can be corrected; its arithmetic cannot.
     */
    const movementChanged =
      type !== before.type || Number(quantity) !== Number(before.quantity);
    if (movementChanged && (type === 'adjustment' || before.type === 'adjustment')) {
      throw new ApiError(
        400,
        'An adjustment sets the stock level outright, so it cannot be re-typed or re-quantified. Reverse it and record a new one.'
      );
    }

    // Everything below has to land together or not at all: the stock move, the
    // ledger row and the cash line are one correction, not three edits.
    const updated = await withTransaction(async (client) => {
      const delta = stockEffect(type, quantity) - stockEffect(before.type, before.quantity);

      const { rows: stockRows } = await client.query(
        `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW()
         WHERE id = $2 AND business_id = $3 AND current_stock + $1 >= 0
         RETURNING current_stock, name`,
        [delta, productId, req.businessId]
      );

      if (!stockRows[0]) {
        // Either the product moved business, or the correction would drive the
        // level below zero — which is the same "don't oversell" rule the create
        // path enforces, just arriving from the other direction.
        throw new ApiError(
          400,
          'That correction would take the stock below zero. Reduce the quantity, or record the missing stock first.'
        );
      }

      const stockAfter = roundQty(Number(stockRows[0].current_stock));
      const unitPrice = price ?? before.price ?? 0;
      const totalValue = round2(unitPrice * Number(quantity));

      const { rows } = await client.query(
        `UPDATE transactions SET
           type = $1, quantity = $2, price = $3, total_value = $4,
           reference = $5, batch_number = $6, supplier = $7, customer = $8, notes = $9,
           stock_before = $10, stock_after = $11, updated_at = NOW()
         WHERE id = $12 AND business_id = $13
         RETURNING *`,
        [
          type,
          quantity,
          unitPrice,
          totalValue,
          reference ?? null,
          batchNumber ?? null,
          supplier ?? null,
          customer ?? null,
          notes ?? null,
          roundQty(stockAfter - stockEffect(type, quantity)),
          stockAfter,
          before._id,
          req.businessId,
        ]
      );

      /**
       * Re-post the cash line rather than patching it: the correction may have
       * turned a sale into a delivery, in which case the money never came in and
       * the line must go entirely. Deleting then re-inserting covers becoming a
       * sale, ceasing to be one, and changing amount, in one path.
       */
      await client.query(
        `DELETE FROM cash_entries WHERE transaction_id = $1 AND source = 'sale' AND business_id = $2`,
        [before._id, req.businessId]
      );

      if (type === 'stock_out' && totalValue > 0) {
        await client.query(
          `INSERT INTO cash_entries
             (business_id, direction, amount, category, purpose, party, reference,
              source, transaction_id, occurred_at, created_by)
           VALUES ($1, 'in', $2, 'Sale', $3, $4, $5, 'sale', $6, $7, $8)`,
          [
            req.businessId,
            totalValue,
            `Sale — ${stockRows[0].name}`,
            customer || '',
            reference || '',
            before._id,
            before.createdAt || new Date(),
            req.user._id,
          ]
        );
      }

      return rows[0];
    });

    audit(
      req,
      'UPDATE_TRANSACTION',
      'TRANSACTION',
      before._id,
      { product: before.product?.name },
      { type: before.type, quantity: before.quantity, totalValue: before.totalValue },
      { type, quantity: Number(quantity), totalValue: Number(updated.total_value) }
    );

    const fresh = await Transaction.findById(before._id, { businessId: req.businessId });
    res.json(fresh);
  })
);

// @route   DELETE /api/transactions/:id
// @desc    Reverse a transaction and restore the stock it moved
// @access  Private
router.delete(
  '/:id',
  auth,
  requireCapability('transactions.reverse'),
  [param('id').isUUID().withMessage('Invalid transaction id')],
  validate,
  asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.id, { businessId: req.businessId });
    if (!transaction) throw new ApiError(404, 'Transaction not found');

    const productId = resolveProductId(transaction);
    if (!productId) throw new ApiError(400, 'This transaction has no product attached');

    const delta =
      transaction.type === 'stock_in'
        ? -transaction.quantity
        : transaction.type === 'stock_out'
        ? transaction.quantity
        : 0;

    if (delta !== 0) {
      const updated = await Product.findOneAndUpdate(
        { _id: productId, currentStock: { $gte: delta < 0 ? transaction.quantity : 0 } },
        { $inc: { currentStock: delta } },
        { new: true }
      );

      if (!updated) {
        throw new ApiError(
          400,
          'This stock-in has already been sold on. Record a correcting adjustment instead of deleting it.'
        );
      }
    } else if (transaction.type === 'adjustment') {
      // Adjustments overwrote the level outright, so the only honest undo is
      // putting the recorded pre-adjustment level back.
      await Product.updateOne(
        { _id: productId },
        { $set: { currentStock: transaction.stockBefore } }
      );
    }
    // A transfer moved stock between locations without changing the quantity on
    // hand, so its stockBefore is simply the level at the time it was recorded.
    // Writing that back would discard every sale made since — deleting a
    // month-old transfer would resurrect stock that has long been sold.

    // The cash line goes first, on purpose. Deleting it afterwards risks leaving
    // an orphan: a row still marked `source: 'sale'`, which the cash book refuses
    // to edit or delete because it points at a transaction that no longer exists.
    // Failing here leaves both records intact, which is recoverable.
    const transactionId = resolveUuid(transaction.id) || resolveUuid(transaction._id);
    await CashEntry.deleteOne({ transaction: transactionId, source: 'sale' });

    await transaction.deleteOne();

    audit(req, 'DELETE_TRANSACTION', 'TRANSACTION', transactionId, {
      type: transaction.type,
      quantity: transaction.quantity,
    });

    res.json({ message: 'Transaction reversed', id: transactionId });
  })
);

module.exports = router;
