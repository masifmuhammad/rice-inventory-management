const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const Business = require('../models/Business');
const BusinessSettings = require('../models/BusinessSettings');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { requireCapability } = require('../middleware/permissions');
const { audit } = require('../middleware/audit');

// @route   GET /api/businesses/public
// @desc    Active businesses for signup picker
// @access  Public
router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const businesses = await Business.find({ isActive: true }, { sort: { name: 1 } });
    res.json(businesses.map((b) => b.toPublic()));
  })
);

router.use(auth);

// @route   GET /api/businesses
// @desc    Businesses the current user can access
// @access  Private
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const businesses = await Business.getAccessibleBusinesses(req.user);
    res.json({
      activeBusinessId: req.businessId,
      businesses: businesses.map((b) => b.toPublic()),
    });
  })
);

// @route   GET /api/businesses/:id
// @access  Private
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const canAccess = await Business.userCanAccess(req.user.id, req.params.id, {
      userBusinessId: req.user.businessId,
      role: req.user.role,
    });
    if (!canAccess) throw new ApiError(403, 'You do not have access to this business');

    const business = await Business.findById(req.params.id);
    if (!business) throw new ApiError(404, 'Business not found');
    res.json(business.toPublic());
  })
);

// @route   POST /api/businesses
// @access  Admin
router.post(
  '/',
  requireCapability('settings.manage'),
  [
    body('name').trim().notEmpty().withMessage('Business name is required').isLength({ max: 120 }),
    body('primaryColor').optional().matches(/^#[0-9a-fA-F]{6}$/),
    body('accentColor').optional().matches(/^#[0-9a-fA-F]{6}$/),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const business = await Business.create({
      name: req.body.name.trim(),
      createdBy: req.user.id,
    });

    await Business.addAdminMembership(req.user.id, business.id);

    const settings = await BusinessSettings.createDefaultSettings(business.id, business.name);
    if (req.body.primaryColor) settings.primaryColor = req.body.primaryColor;
    if (req.body.accentColor) settings.accentColor = req.body.accentColor;
    if (req.body.tagline) settings.tagline = req.body.tagline;
    await settings.save();

    audit(req, 'CREATE_BUSINESS', 'BUSINESS', business.id, { name: business.name });

    res.status(201).json({ business: business.toPublic(), settings });
  })
);

// @route   PATCH /api/businesses/:id
// @access  Admin
router.patch(
  '/:id',
  requireCapability('settings.manage'),
  [
    body('name').optional().trim().notEmpty().isLength({ max: 120 }),
    body('isActive').optional().isBoolean(),
    body('primaryColor').optional().matches(/^#[0-9a-fA-F]{6}$/),
    body('accentColor').optional().matches(/^#[0-9a-fA-F]{6}$/),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const canAccess = await Business.userCanAccess(req.user.id, req.params.id, {
      userBusinessId: req.user.businessId,
      role: req.user.role,
    });
    if (!canAccess) throw new ApiError(403, 'You do not have access to this business');

    const business = await Business.findById(req.params.id);
    if (!business) throw new ApiError(404, 'Business not found');

    const previous = { name: business.name, isActive: business.isActive };
    if (req.body.name) business.name = req.body.name.trim();
    if (req.body.isActive !== undefined) business.isActive = req.body.isActive;
    await business.save();

    let settings = await BusinessSettings.findOne({ businessId: business.id });
    if (!settings) settings = await BusinessSettings.createDefaultSettings(business.id, business.name);

    if (req.body.name) settings.businessName = req.body.name.trim();
    if (req.body.primaryColor) settings.primaryColor = req.body.primaryColor;
    if (req.body.accentColor) settings.accentColor = req.body.accentColor;
    if (req.body.tagline !== undefined) settings.tagline = req.body.tagline;
    await settings.save();

    audit(req, 'UPDATE_BUSINESS', 'BUSINESS', business.id, {}, previous, {
      name: business.name,
      isActive: business.isActive,
    });

    res.json({ business: business.toPublic(), settings });
  })
);

module.exports = router;
