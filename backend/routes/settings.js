const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const BusinessSettings = require('../models/BusinessSettings');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { requireCapability } = require('../middleware/permissions');
const { audit } = require('../middleware/audit');

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const getOrCreate = async (businessId, businessName) => {
  const existing = await BusinessSettings.findOne({ businessId });
  if (existing) return existing;
  return BusinessSettings.createDefaultSettings(businessId, businessName);
};

router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    res.json(await getOrCreate(req.businessId));
  })
);

router.put(
  '/',
  auth,
  requireCapability('settings.manage'),
  [
    body('businessName').optional().trim().notEmpty().withMessage('Business name cannot be empty').isLength({ max: 120 }),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email'),
    body('primaryColor').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Use a hex colour like #059669'),
    body('accentColor').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Use a hex colour like #10b981'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const settings = await getOrCreate(req.businessId);
    const previous = {
      businessName: settings.businessName,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
    };

    const allowedFields = [
      'businessName', 'businessType', 'tagline', 'email', 'phone', 'website',
      'address', 'logo', 'primaryColor', 'accentColor', 'currency', 'defaultUnit',
      'fiscalYearStart', 'timezone', 'dateFormat', 'features', 'receiptSettings',
      'onboardingCompleted', 'setupSteps',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    });

    await settings.save();
    audit(req, 'UPDATE_SETTINGS', 'SETTINGS', settings.id, {}, previous, {
      businessName: settings.businessName,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
    });

    res.json(settings);
  })
);

router.post(
  '/logo',
  auth,
  requireCapability('settings.manage'),
  asyncHandler(async (req, res) => {
    const { logo } = req.body;

    if (!logo || typeof logo !== 'string') {
      throw new ApiError(400, 'Logo data is required');
    }

    if (!/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(logo)) {
      throw new ApiError(400, 'Upload a PNG, JPG, WEBP or SVG image');
    }

    const approxBytes = (logo.length - logo.indexOf(',') - 1) * 0.75;
    if (approxBytes > MAX_LOGO_BYTES) {
      throw new ApiError(413, 'Logo must be smaller than 2MB');
    }

    const settings = await getOrCreate(req.businessId);
    settings.logo = logo;
    settings.setupSteps.branding = true;
    await settings.save();

    audit(req, 'UPDATE_LOGO', 'SETTINGS', settings.id, {});

    res.json({ message: 'Logo uploaded', logo: settings.logo });
  })
);

router.delete(
  '/logo',
  auth,
  requireCapability('settings.manage'),
  asyncHandler(async (req, res) => {
    const settings = await getOrCreate(req.businessId);
    settings.logo = undefined;
    await settings.save();
    audit(req, 'REMOVE_LOGO', 'SETTINGS', settings.id, {});
    res.json({ message: 'Logo removed' });
  })
);

router.put(
  '/onboarding/:step',
  auth,
  requireCapability('settings.manage'),
  asyncHandler(async (req, res) => {
    const { step } = req.params;
    const settings = await getOrCreate(req.businessId);

    // `hasOwnProperty`, not `=== undefined`: inherited keys such as `toString`
    // are not undefined, so they passed the old guard and were written into the
    // settings JSONB as extra steps that could never be ticked off.
    if (!Object.prototype.hasOwnProperty.call(settings.setupSteps || {}, step)) {
      throw new ApiError(400, `Unknown onboarding step: ${step}`);
    }

    settings.setupSteps[step] = true;

    if (Object.values(settings.setupSteps).every(Boolean)) {
      settings.onboardingCompleted = true;
    }

    await settings.save();
    res.json(settings);
  })
);

module.exports = router;
