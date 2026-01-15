const express = require('express');
const router = express.Router();
const BusinessSettings = require('../models/BusinessSettings');
const auth = require('../middleware/auth');

// @route   GET /api/settings
// @desc    Get business settings for current user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let settings = await BusinessSettings.findOne({ userId: req.user._id });
    
    // Create default settings if not exists
    if (!settings) {
      settings = await BusinessSettings.createDefaultSettings(req.user._id, req.user.name);
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/settings
// @desc    Update business settings
// @access  Private
router.put('/', auth, async (req, res) => {
  try {
    let settings = await BusinessSettings.findOne({ userId: req.user._id });
    
    if (!settings) {
      settings = await BusinessSettings.createDefaultSettings(req.user._id, req.user.name);
    }
    
    // Update fields
    const allowedFields = [
      'businessName', 'businessType', 'tagline', 'email', 'phone', 'website',
      'address', 'logo', 'primaryColor', 'accentColor', 'currency', 'defaultUnit',
      'fiscalYearStart', 'timezone', 'dateFormat', 'features', 'receiptSettings',
      'onboardingCompleted', 'setupSteps'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });
    
    await settings.save();
    
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/settings/logo
// @desc    Upload business logo
// @access  Private
router.post('/logo', auth, async (req, res) => {
  try {
    const { logo } = req.body;
    
    if (!logo) {
      return res.status(400).json({ message: 'Logo data required' });
    }
    
    let settings = await BusinessSettings.findOne({ userId: req.user._id });
    
    if (!settings) {
      settings = await BusinessSettings.createDefaultSettings(req.user._id, req.user.name);
    }
    
    settings.logo = logo;
    await settings.save();
    
    res.json({ message: 'Logo uploaded successfully', logo: settings.logo });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/settings/onboarding/:step
// @desc    Mark onboarding step as complete
// @access  Private
router.put('/onboarding/:step', auth, async (req, res) => {
  try {
    const { step } = req.params;
    
    let settings = await BusinessSettings.findOne({ userId: req.user._id });
    
    if (!settings) {
      settings = await BusinessSettings.createDefaultSettings(req.user._id, req.user.name);
    }
    
    if (settings.setupSteps[step] !== undefined) {
      settings.setupSteps[step] = true;
    }
    
    // Check if all steps complete
    const allComplete = Object.values(settings.setupSteps).every(v => v === true);
    if (allComplete) {
      settings.onboardingCompleted = true;
    }
    
    await settings.save();
    
    res.json(settings);
  } catch (error) {
    console.error('Error updating onboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
