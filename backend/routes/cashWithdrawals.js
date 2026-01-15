const express = require('express');
const router = express.Router();
const CashWithdrawal = require('../models/CashWithdrawal');
const auth = require('../middleware/auth');

// @route   GET /api/cash-withdrawals
// @desc    Get all cash withdrawals
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const withdrawals = await CashWithdrawal.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(withdrawals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/cash-withdrawals/summary
// @desc    Get cash withdrawals summary
// @access  Private
router.get('/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const withdrawals = await CashWithdrawal.find(dateFilter);

    const totalAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const count = withdrawals.length;

    res.json({
      totalAmount: Math.round(totalAmount * 100) / 100,
      count,
      withdrawals: withdrawals.slice(0, 10).map(w => ({
        id: w._id,
        amount: w.amount,
        purpose: w.purpose,
        takenBy: w.takenBy,
        date: w.createdAt
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/cash-withdrawals
// @desc    Create a cash withdrawal
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { amount, purpose, takenBy, reference, notes } = req.body;

    if (!amount || !purpose || !takenBy) {
      return res.status(400).json({
        message: 'Amount, purpose, and taken by are required'
      });
    }

    const withdrawal = new CashWithdrawal({
      amount,
      purpose,
      takenBy,
      reference,
      notes,
      createdBy: req.user.id
    });

    await withdrawal.save();

    const populatedWithdrawal = await CashWithdrawal.findById(withdrawal._id)
      .populate('createdBy', 'name email');

    res.status(201).json(populatedWithdrawal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/cash-withdrawals/:id
// @desc    Delete a cash withdrawal
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const withdrawal = await CashWithdrawal.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Cash withdrawal not found' });
    }

    await withdrawal.deleteOne();
    res.json({ message: 'Cash withdrawal deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
