const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const Business = require('../models/Business');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const env = require('../config/env');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiters');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { capabilitiesFor } = require('../middleware/permissions');

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const emailSanitizer = (value) => String(value || '').trim().toLowerCase();

const generateToken = (user, businessId) =>
  jwt.sign(
    { userId: user._id, role: user.role, businessId: businessId || user.businessId },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

const sessionPayload = async (user, businessId) => {
  const activeId = businessId || user.businessId;
  const businesses = await Business.getAccessibleBusinesses(user);
  return {
    user: { ...user.toPublic(), businessId: activeId },
    businessId: activeId,
    businesses: businesses.map((b) => b.toPublic()),
    capabilities: capabilitiesFor(user.role),
  };
};

// @route   POST /api/auth/register
router.post(
  '/register',
  registerLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').customSanitizer(emailSanitizer).isEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('businessId').isUUID().withMessage('Please select a business'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, email, password, businessId } = req.body;

    const business = await Business.findOne({ id: businessId, isActive: true });
    if (!business) {
      throw new ApiError(400, 'Please select a valid business');
    }

    const existing = await User.findOne({ email });
    if (existing) {
      throw new ApiError(409, 'An account with that email already exists');
    }

    const user = await User.create({
      name,
      email,
      password,
      businessId,
      role: 'worker',
      status: 'pending',
    });

    audit(req, 'REGISTER_REQUEST', 'AUTH', user._id, { name, email, businessId }, null, null, {
      user,
      businessId,
    });

    res.status(201).json({
      status: 'pending',
      message:
        'Your account request has been sent. An administrator needs to approve it before you can sign in.',
    });
  })
);

// @route   POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  [
    body('email').customSanitizer(emailSanitizer).isEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }, { select: '+password' });

    const reject = () => {
      throw new ApiError(401, 'Incorrect email or password');
    };

    if (!user) return reject();

    if (user.isLocked()) {
      const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      throw new ApiError(
        429,
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      );
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
        user.failedLoginAttempts = 0;
      }
      await user.save({ validateBeforeSave: false });

      audit(req, 'LOGIN_FAILED', 'AUTH', user._id, { email }, null, null, { user });
      return reject();
    }

    if (user.status !== 'active') {
      const messages = {
        pending: 'Your account is waiting for an administrator to approve it.',
        suspended: 'Your account has been suspended. Please contact your administrator.',
        rejected: 'Your account request was declined. Please contact your administrator.',
      };

      audit(req, 'LOGIN_BLOCKED', 'AUTH', user._id, { status: user.status }, null, null, { user });

      throw new ApiError(403, messages[user.status] || 'Your account is not active.', undefined, {
        code: `ACCOUNT_${user.status.toUpperCase()}`,
        reason: user.statusReason,
      });
    }

    if (!user.businessId) {
      throw new ApiError(403, 'Your account is not assigned to a business.');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    user.lastLoginIp = req.ip;
    await user.save({ validateBeforeSave: false });

    audit(req, 'LOGIN', 'AUTH', user._id, { email }, null, null, {
      user,
      businessId: user.businessId,
    });

    const token = generateToken(user, user.businessId);
    res.json({ token, ...(await sessionPayload(user, user.businessId)) });
  })
);

// @route   POST /api/auth/switch-business
router.post(
  '/switch-business',
  auth,
  [body('businessId').isUUID().withMessage('Business id is required')],
  validate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      throw new ApiError(403, 'Only administrators can switch businesses');
    }

    const { businessId } = req.body;
    const canAccess = await Business.userCanAccess(req.user.id, businessId, {
      userBusinessId: req.user.businessId,
      role: req.user.role,
    });

    if (!canAccess) {
      throw new ApiError(403, 'You do not have access to this business');
    }

    const token = generateToken(req.user, businessId);
    res.json({ token, ...(await sessionPayload(req.user, businessId)) });
  })
);

// @route   GET /api/auth/me
router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) throw new ApiError(401, 'Account no longer exists');
    res.json(await sessionPayload(user, req.businessId));
  })
);

// @route   PUT /api/auth/me
router.put(
  '/me',
  auth,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty').isLength({ max: 80 }),
    body('email').optional().customSanitizer(emailSanitizer).isEmail().withMessage('Please enter a valid email'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, email } = req.body;

    if (email) {
      const clash = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (clash) throw new ApiError(409, 'That email is already in use');
    }

    const user = await User.findById(req.user._id);
    if (!user) throw new ApiError(404, 'Account not found');

    const before = { name: user.name, email: user.email };
    if (name) user.name = name;
    if (email) user.email = email;
    await user.save();

    audit(req, 'UPDATE_PROFILE', 'AUTH', user._id, {}, before, { name: user.name, email: user.email });

    res.json(await sessionPayload(user, req.businessId));
  })
);

// @route   POST /api/auth/me/avatar
router.post(
  '/me/avatar',
  auth,
  asyncHandler(async (req, res) => {
    const { avatar } = req.body;

    if (!avatar || typeof avatar !== 'string') {
      throw new ApiError(400, 'Photo data is required');
    }

    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(avatar)) {
      throw new ApiError(400, 'Upload a PNG, JPG, or WEBP image');
    }

    const approxBytes = (avatar.length - avatar.indexOf(',') - 1) * 0.75;
    if (approxBytes > MAX_AVATAR_BYTES) {
      throw new ApiError(413, 'Photo must be smaller than 2MB');
    }

    const user = await User.findById(req.user._id);
    if (!user) throw new ApiError(404, 'Account not found');

    user.avatar = avatar;
    await user.save();

    audit(req, 'UPDATE_AVATAR', 'AUTH', user._id, {});

    res.json({ message: 'Profile picture updated', user: { ...user.toPublic(), businessId: req.businessId } });
  })
);

// @route   DELETE /api/auth/me/avatar
router.delete(
  '/me/avatar',
  auth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) throw new ApiError(404, 'Account not found');

    user.avatar = null;
    await user.save();

    audit(req, 'REMOVE_AVATAR', 'AUTH', user._id, {});

    res.json({ message: 'Profile picture removed', user: { ...user.toPublic(), businessId: req.businessId } });
  })
);

// @route   PUT /api/auth/me/password
router.put(
  '/me/password',
  auth,
  // This endpoint verifies `currentPassword` with bcrypt, so without a tight
  // limiter a stolen session can grind the account's real password — and each
  // attempt costs a bcrypt round of server CPU.
  authLimiter,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id, { select: '+password' });
    if (!user) throw new ApiError(404, 'Account not found');

    const isMatch = await user.comparePassword(req.body.currentPassword);
    if (!isMatch) throw new ApiError(400, 'Your current password is incorrect');

    if (req.body.currentPassword === req.body.newPassword) {
      throw new ApiError(400, 'The new password must be different from the current one');
    }

    user.password = req.body.newPassword;
    user.mustChangePassword = false;
    await user.save();

    audit(req, 'CHANGE_PASSWORD', 'AUTH', user._id, {});

    const token = generateToken(user, req.businessId);
    res.json({ message: 'Password updated', token, ...(await sessionPayload(user, req.businessId)) });
  })
);

module.exports = router;
