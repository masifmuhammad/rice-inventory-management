const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const CashEntry = require('../models/CashEntry');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { requireCapability } = require('../middleware/permissions');

const { round2 } = require('../db/helpers');

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const buildFilter = ({ direction, category, source, startDate, endDate, search }, businessId) => {
  const filter = { businessId };

  if (direction === 'in' || direction === 'out') filter.direction = direction;
  if (category) filter.category = category;
  if (source) filter.source = source;

  if (startDate || endDate) {
    filter.occurredAt = {};
    if (startDate) filter.occurredAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) end.setHours(23, 59, 59, 999);
      filter.occurredAt.$lte = end;
    }
  }

  if (search) {
    const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ purpose: rx }, { party: rx }, { reference: rx }, { notes: rx }, { category: rx }];
  }

  return filter;
};

// @route   GET /api/cash-book/meta
// @access  Private
router.get('/meta', auth, requireCapability('cash.view'), (req, res) => {
  res.json({ inCategories: CashEntry.IN_CATEGORIES, outCategories: CashEntry.OUT_CATEGORIES });
});

// @route   GET /api/cash-book/summary
// @desc    Totals, current-month movement and a category breakdown
// @access  Private
router.get(
  '/summary',
  auth,
  requireCapability('cash.view'),
  asyncHandler(async (req, res) => {
    const filter = buildFilter(req.query, req.businessId);

    const [overall, monthly, byCategory] = await Promise.all([
      CashEntry.aggregate([
        { $match: filter },
        { $group: { _id: '$direction', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CashEntry.aggregate([
        { $match: { businessId: req.businessId, occurredAt: { $gte: startOfMonth() } } },
        { $group: { _id: '$direction', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CashEntry.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { direction: '$direction', category: '$category' },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
    ]);

    const pick = (rows, direction) => rows.find((r) => r._id === direction) || { total: 0, count: 0 };

    const totalIn = pick(overall, 'in');
    const totalOut = pick(overall, 'out');
    const monthIn = pick(monthly, 'in');
    const monthOut = pick(monthly, 'out');

    res.json({
      totalIn: round2(totalIn.total),
      totalOut: round2(totalOut.total),
      // Positive means the shop is holding cash; negative means more has gone out
      // than has come in over the filtered period.
      balance: round2(totalIn.total - totalOut.total),
      countIn: totalIn.count,
      countOut: totalOut.count,
      thisMonth: {
        in: round2(monthIn.total),
        out: round2(monthOut.total),
        net: round2(monthIn.total - monthOut.total),
      },
      byCategory: byCategory.map((row) => ({
        direction: row._id.direction,
        category: row._id.category,
        total: round2(row.total),
        count: row.count,
      })),
    });
  })
);

// @route   GET /api/cash-book
// @desc    The ledger, newest first, with a running balance per row
// @access  Private
router.get(
  '/',
  auth,
  requireCapability('cash.view'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('direction').optional().isIn(['in', 'out', 'all']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 25 } = req.query;
    const filter = buildFilter(req.query, req.businessId);

    const [entries, total] = await Promise.all([
      CashEntry.find(filter, { skip: (page - 1) * limit, limit }),
      CashEntry.countDocuments(filter),
    ]);

    // A running balance only means anything when consecutive rows are
    // consecutive in the ledger. Under a direction, category or search filter
    // the rows in between are hidden, so accumulating across them produces a
    // number that contradicts the real balance — the "Money out" tab would show
    // a large negative figure beside a positive cash-balance card. In that case
    // the column is omitted and the UI hides it.
    const isFiltered = Boolean(
      req.query.search ||
        req.query.category ||
        req.query.source ||
        (req.query.direction && req.query.direction !== 'all')
    );

    let data = entries;

    if (!isFiltered && entries.length) {
      // Every row older than this page still counts, or page 2 would restart
      // from zero. The `_id` tiebreak keeps same-timestamp entries in a stable
      // order across the cutoff.
      const oldest = entries[entries.length - 1];
      const olderThanPage = {
        ...filter,
        $and: [
          ...(filter.$and || []),
          {
            $or: [
              { occurredAt: { $lt: oldest.occurredAt } },
              { occurredAt: oldest.occurredAt, _id: { $lt: oldest._id } },
            ],
          },
        ],
      };

      const carried = await CashEntry.aggregate([
        { $match: olderThanPage },
        { $group: { _id: '$direction', total: { $sum: '$amount' } } },
      ]);

      const carriedIn = Number(carried.find((r) => r._id === 'in')?.total) || 0;
      const carriedOut = Number(carried.find((r) => r._id === 'out')?.total) || 0;
      let balance = carriedIn - carriedOut;

      // Walk oldest → newest so each row shows the balance *after* it was booked.
      // `amount` is coerced explicitly: this accumulator is the one place where a
      // stringly-typed money column would concatenate rather than add, and the
      // resulting balance column is wrong in a way that looks plausible.
      data = [...entries]
        .reverse()
        .map((entry) => {
          const amount = Number(entry.amount) || 0;
          balance += entry.direction === 'in' ? amount : -amount;
          return { ...entry, balanceAfter: round2(balance) };
        })
        .reverse();
    }

    res.json({
      data,
      showBalance: !isFiltered,
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

const entryValidators = [
  body('direction').isIn(['in', 'out']).withMessage('Choose money in or money out'),
  body('amount').isFloat({ gt: 0 }).withMessage('Enter an amount greater than 0').toFloat(),
  body('purpose').trim().notEmpty().withMessage('Describe what this is for').isLength({ max: 200 }),
  body('category').optional().trim().isLength({ max: 60 }),
  body('party').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('occurredAt').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid date'),
  // Bounded to match the columns, so over-long input is a field error rather
  // than an unattributed 500 from Postgres.
  body('reference').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

// @route   POST /api/cash-book
// @access  Private
router.post(
  '/',
  auth,
  requireCapability('cash.manage'),
  entryValidators,
  validate,
  asyncHandler(async (req, res) => {
    const { direction, amount, purpose, category, party, takenBy, reference, notes, occurredAt } = req.body;

    const entry = await CashEntry.create({
      businessId: req.businessId,
      direction,
      amount,
      purpose,
      // `takenBy` is what the old withdrawal form sent; accept both spellings.
      party: party || takenBy,
      category: category || (direction === 'in' ? 'Other income' : 'Other expense'),
      reference,
      notes,
      occurredAt: occurredAt || new Date(),
      source: 'manual',
      createdBy: req.user._id,
    });

    await entry.populate('createdBy', 'name email');

    audit(req, direction === 'in' ? 'CREATE_CASH_IN' : 'CREATE_CASH_OUT', 'CASH_ENTRY', entry._id, {
      amount,
      purpose,
      category: entry.category,
    });

    res.status(201).json(entry);
  })
);

// @route   PUT /api/cash-book/:id
// @access  Private
router.put(
  '/:id',
  auth,
  requireCapability('cash.manage'),
  entryValidators,
  validate,
  asyncHandler(async (req, res) => {
    const entry = await CashEntry.findById(req.params.id, { businessId: req.businessId });
    if (!entry) throw new ApiError(404, 'Cash entry not found');

    if (entry.source === 'sale') {
      throw new ApiError(
        400,
        'This line was posted automatically from a sale. Edit the transaction instead.'
      );
    }

    const before = { amount: entry.amount, purpose: entry.purpose, category: entry.category };
    const { direction, amount, purpose, category, party, takenBy, reference, notes, occurredAt } = req.body;

    Object.assign(entry, {
      direction,
      amount,
      purpose,
      category: category || entry.category,
      party: party ?? takenBy ?? entry.party,
      reference,
      notes,
      ...(occurredAt ? { occurredAt } : {}),
    });

    await entry.save();
    await entry.populate('createdBy', 'name email');

    audit(req, 'UPDATE_CASH_ENTRY', 'CASH_ENTRY', entry._id, {}, before, {
      amount: entry.amount,
      purpose: entry.purpose,
      category: entry.category,
    });

    res.json(entry);
  })
);

// @route   DELETE /api/cash-book/:id
// @access  Private
router.delete(
  '/:id',
  auth,
  requireCapability('cash.delete'),
  asyncHandler(async (req, res) => {
    const entry = await CashEntry.findById(req.params.id, { businessId: req.businessId });
    if (!entry) throw new ApiError(404, 'Cash entry not found');

    if (entry.source === 'sale') {
      throw new ApiError(
        400,
        'This line came from a sale. Reverse the transaction to remove it from the cash book.'
      );
    }

    await entry.deleteOne();

    audit(req, 'DELETE_CASH_ENTRY', 'CASH_ENTRY', entry._id, {
      direction: entry.direction,
      amount: entry.amount,
      purpose: entry.purpose,
    });

    res.json({ message: 'Cash entry deleted', id: entry._id });
  })
);

module.exports = router;
