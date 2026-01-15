const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Basmati', 'Jasmine', 'Long Grain', 'Short Grain', 'Brown Rice', 'Wild Rice', 'Other'],
    default: 'Other'
  },
  description: {
    type: String,
    trim: true
  },
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'ton', 'bag', 'sack'],
    default: 'kg'
  },
  currentStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  minStockLevel: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  maxStockLevel: {
    type: Number,
    default: null
  },
  costPrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  location: {
    type: String,
    trim: true
  },
  batchNumber: {
    type: String,
    trim: true
  },
  expiryDate: {
    type: Date
  },
  supplier: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster searches
productSchema.index({ name: 'text', sku: 'text', category: 'text' });
productSchema.index({ currentStock: 1 });
productSchema.index({ isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
