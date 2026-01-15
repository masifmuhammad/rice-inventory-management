const mongoose = require('mongoose');

const businessSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Business Identity
  businessName: {
    type: String,
    required: true,
    default: 'My Business'
  },
  businessType: {
    type: String,
    enum: ['rice', 'grain', 'wholesale', 'retail', 'manufacturing', 'other'],
    default: 'rice'
  },
  tagline: {
    type: String,
    maxlength: 100
  },
  
  // Contact Information
  email: {
    type: String
  },
  phone: {
    type: String
  },
  website: {
    type: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'Pakistan' },
    postalCode: String
  },
  
  // Branding
  logo: {
    type: String // Base64 or URL
  },
  primaryColor: {
    type: String,
    default: '#0284c7' // Tailwind sky-600
  },
  accentColor: {
    type: String,
    default: '#0ea5e9' // Tailwind sky-500
  },
  
  // Currency & Units
  currency: {
    code: { type: String, default: 'PKR' },
    symbol: { type: String, default: 'Rs.' }
  },
  defaultUnit: {
    type: String,
    enum: ['kg', 'lbs', 'tons', 'bags', 'units'],
    default: 'kg'
  },
  
  // Business Preferences
  fiscalYearStart: {
    type: Number, // Month (1-12)
    default: 1
  },
  timezone: {
    type: String,
    default: 'Asia/Karachi'
  },
  dateFormat: {
    type: String,
    enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
    default: 'DD/MM/YYYY'
  },
  
  // Features
  features: {
    inventoryTracking: { type: Boolean, default: true },
    cashWithdrawals: { type: Boolean, default: true },
    multipleLocations: { type: Boolean, default: false },
    advancedReporting: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false }
  },
  
  // Receipt/Invoice Settings
  receiptSettings: {
    includeTerms: { type: Boolean, default: false },
    termsText: String,
    footerText: { type: String, default: 'Thank you for your business!' },
    showLogo: { type: Boolean, default: true },
    receiptPrefix: { type: String, default: 'INV' }
  },
  
  // Onboarding
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  setupSteps: {
    businessInfo: { type: Boolean, default: false },
    branding: { type: Boolean, default: false },
    firstProduct: { type: Boolean, default: false },
    firstTransaction: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Create settings for new user automatically
businessSettingsSchema.statics.createDefaultSettings = async function(userId, userName) {
  return await this.create({
    userId,
    businessName: `${userName}'s Business`
  });
};

module.exports = mongoose.model('BusinessSettings', businessSettingsSchema);
