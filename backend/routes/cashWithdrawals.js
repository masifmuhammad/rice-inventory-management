const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const CashEntry = require('../models/CashEntry');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { requireCapability } = require('../middleware/permissions');

/**
 * Compatibility layer for the original withdrawals-only API.
 *
 * Cash now lives in one ledger (`/api/cash-book`) that records money in as well
 * as money out. These routes stay so nothing that already points at them breaks;
 * they read and write the same collection, filtered to outgoing entries, and
 * present the old field names.
 */

const round2 = (n) => Math.round((n || 0) * 100) / 100;

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

/** Presents a ledger entry using the field names the old API returned. */
const toLegacyShape = (entry) => ({
  _id: entry._id,
  amount: entry.amount,
  purpose: entry.purpose,
  takenBy: entry.party,
  reference: entry.reference,
  notes: entry.notes,
  createdBy: entry.createdBy,
  createdAt: entry.occurredAt || entry.createdAt,
  updatedAt: entry.updatedAt,
});

// @route   GET /api/cash-withdrawals
router.get(
  '/',
  auth,
  requireCapability('cash.view'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

    const biz = req.businessId;
    const entries = await CashEntry.find({ direction: 'out', businessId: biz }, { limit });

    res.json(entries.map(toLegacyShape));
  })
);

// @route   GET /api/cash-withdrawals/summary
router.get(
  '/summary',
  auth,
  requireCapability('cash.view'),
  asyncHandler(async (req, res) => {
    const biz = req.businessId;
    const [totals, monthly, recent] = await Promise.all([
      CashEntry.aggregate([
        { $match: { direction: 'out', businessId: biz } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CashEntry.aggregate([
        { $match: { direction: 'out', businessId: biz, occurredAt: { $gte: startOfMonth() } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CashEntry.find({ direction: 'out', businessId: biz }, { limit: 10 }),
    ]);

    const total = totals[0] || { total: 0, count: 0 };
    const month = monthly[0] || { total: 0, count: 0 };

    res.json({
      totalAmount: round2(total.total),
      count: total.count,
      thisMonth: { totalAmount: round2(month.total), count: month.count },
      withdrawals: recent.map((entry) => ({
        id: entry._id,
        amount: entry.amount,
        purpose: entry.purpose,
        takenBy: entry.party,
        date: entry.occurredAt,
      })),
    });
  })
);

// @route   POST /api/cash-withdrawals
router.post(
  '/',
  auth,
  requireCapability('cash.manage'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Enter an amount greater than 0').toFloat(),
    body('purpose').trim().notEmpty().withMessage('Purpose is required').isLength({ max: 200 }),
    body('takenBy').trim().notEmpty().withMessage('Taken by is required').isLength({ max: 80 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { amount, purpose, takenBy, reference, notes } = req.body;

    const entry = await CashEntry.create({
      businessId: req.businessId,
      direction: 'out',
      amount,
      purpose,
      party: takenBy,
      category: 'Other expense',
      reference,
      notes,
      source: 'manual',
      occurredAt: new Date(),
      createdBy: req.user._id,
    });

    await entry.populate('createdBy', 'name email');
    audit(req, 'CREATE_CASH_OUT', 'CASH_ENTRY', entry._id, { amount, purpose });

    res.status(201).json(toLegacyShape(entry.toObject()));
  })
);

// @route   DELETE /api/cash-withdrawals/:id
router.delete(
  '/:id',
  auth,
  requireCapability('cash.delete'),
  asyncHandler(async (req, res) => {
    const entry = await CashEntry.findOne({ _id: req.params.id, direction: 'out', businessId: req.businessId });
    if (!entry) throw new ApiError(404, 'Cash withdrawal not found');

    if (entry.source === 'sale') {
      throw new ApiError(400, 'This line came from a sale and cannot be deleted here.');
    }

    await entry.deleteOne();
    audit(req, 'DELETE_CASH_ENTRY', 'CASH_ENTRY', entry._id, { amount: entry.amount });

    res.json({ message: 'Cash withdrawal deleted', id: entry._id });
  })
);

module.exports = router;
