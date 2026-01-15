const mongoose = require('mongoose');

const cashWithdrawalSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  purpose: {
    type: String,
    required: true,
    trim: true
  },
  takenBy: {
    type: String,
    required: true,
    trim: true
  },
  reference: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
cashWithdrawalSchema.index({ createdAt: -1 });
cashWithdrawalSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('CashWithdrawal', cashWithdrawalSchema);
