const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { body, query } = require('express-validator');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { requireCapability } = require('../middleware/permissions');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');

const ROLES = ['admin', 'accountant', 'worker'];

/** Every route here is admin-only, enforced on the server. */
router.use(auth);

/**
 * Refuses to remove the last way into the system. Demoting or suspending the
 * only admin would leave nobody able to approve anyone, with no recovery path
 * short of editing the database by hand.
 */
const assertNotLastAdmin = async (targetUser, { changingTo } = {}) => {
  if (targetUser.role !== 'admin' || targetUser.status !== 'active') return;
  if (changingTo === 'admin') return;

  const otherAdmins = await User.countDocuments({
    _id: { $ne: targetUser._id },
    role: 'admin',
    status: 'active',
    businessId: targetUser.businessId,
  });

  if (otherAdmins === 0) {
    throw new ApiError(
      400,
      'This is the only active administrator. Promote someone else to admin first.'
    );
  }
};

/**
 * Loads a user and refuses to hand back one belonging to another business.
 *
 * Every handler below takes its target from `req.params.id`, so without this the
 * only thing standing between an admin and another tenant's accounts is a UUID
 * they are not supposed to know — which is not a control. The failure is a plain
 * 404 rather than a 403, because confirming "that id exists, just not for you"
 * turns the endpoint into a membership oracle for other businesses.
 */
const findUserInBusiness = async (id, businessId, { allowUnassigned = false, ...options } = {}) => {
  const user = await User.findById(id, options);
  if (!user) throw new ApiError(404, 'User not found');

  // `users.business_id` is nullable, and approval is the step that claims an
  // unassigned signup into a business — so only that caller may see one.
  if (user.businessId == null) {
    if (allowUnassigned) return user;
    throw new ApiError(404, 'User not found');
  }

  if (String(user.businessId) !== String(businessId)) {
    throw new ApiError(404, 'User not found');
  }
  return user;
};

/* -------------------------------------------------------------------- users */

// @route   GET /api/admin/users
// @access  Admin
router.get(
  '/users',
  requireCapability('users.manage'),
  [query('status').optional().isIn(['pending', 'active', 'suspended', 'rejected', 'all'])],
  validate,
  asyncHandler(async (req, res) => {
    const { status = 'all', search } = req.query;
    const filter = {};

    if (status !== 'all') filter.status = status;
    filter.businessId = req.businessId;
    if (search) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [users, pendingCount] = await Promise.all([
      User.find(filter, { sort: { status: 1 }, limit: 200, populate: { approvedBy: true } }),
      User.countDocuments({ status: 'pending', businessId: req.businessId }),
    ]);

    res.json({
      users: users.map((user) => ({
        ...user.toPublic(),
        approvedBy: user.approvedBy?.name || null,
        approvedAt: user.approvedAt,
      })),
      pendingCount,
    });
  })
);

// @route   POST /api/admin/users/:id/approve
// @access  Admin
router.post(
  '/users/:id/approve',
  requireCapability('users.manage'),
  [body('role').optional().isIn(ROLES).withMessage('Pick a valid role')],
  validate,
  asyncHandler(async (req, res) => {
    const user = await findUserInBusiness(req.params.id, req.businessId, { allowUnassigned: true });

    if (user.status === 'active') {
      return res.json({ message: 'That account is already active', user: user.toPublic() });
    }

    const previous = { status: user.status, role: user.role };

    user.status = 'active';
    user.role = req.body.role || user.role;
    user.statusReason = undefined;
    user.approvedBy = req.user._id;
    user.approvedAt = new Date();
    await user.save();

    audit(
      req,
      'APPROVE_USER',
      'USER',
      user._id,
      { name: user.name, email: user.email, role: user.role },
      previous,
      { status: 'active', role: user.role }
    );

    res.json({ message: `${user.name} can now sign in`, user: user.toPublic() });
  })
);

// @route   POST /api/admin/users/:id/reject
// @access  Admin
router.post(
  '/users/:id/reject',
  requireCapability('users.manage'),
  [body('reason').optional().trim().isLength({ max: 200 })],
  validate,
  asyncHandler(async (req, res) => {
    const user = await findUserInBusiness(req.params.id, req.businessId);

    if (String(user._id) === String(req.user._id)) {
      throw new ApiError(400, 'You cannot reject your own account');
    }

    await assertNotLastAdmin(user);

    const previous = { status: user.status };
    user.status = 'rejected';
    user.statusReason = req.body.reason;
    user.sessionsValidFrom = new Date(); // kill any session immediately
    await user.save();

    audit(req, 'REJECT_USER', 'USER', user._id, { name: user.name, reason: req.body.reason }, previous, {
      status: 'rejected',
    });

    res.json({ message: `${user.name}'s request was declined`, user: user.toPublic() });
  })
);

// @route   POST /api/admin/users/:id/suspend
// @access  Admin
router.post(
  '/users/:id/suspend',
  requireCapability('users.manage'),
  [body('reason').optional().trim().isLength({ max: 200 })],
  validate,
  asyncHandler(async (req, res) => {
    const user = await findUserInBusiness(req.params.id, req.businessId);

    if (String(user._id) === String(req.user._id)) {
      throw new ApiError(400, 'You cannot suspend your own account');
    }

    await assertNotLastAdmin(user);

    const previous = { status: user.status };
    user.status = 'suspended';
    user.statusReason = req.body.reason;
    // Revoke live sessions: a suspension that waits for the token to expire is
    // not a suspension.
    user.sessionsValidFrom = new Date();
    await user.save();

    audit(req, 'SUSPEND_USER', 'USER', user._id, { name: user.name, reason: req.body.reason }, previous, {
      status: 'suspended',
    });

    res.json({ message: `${user.name} has been suspended`, user: user.toPublic() });
  })
);

// @route   POST /api/admin/users/:id/reactivate
// @access  Admin
router.post(
  '/users/:id/reactivate',
  requireCapability('users.manage'),
  asyncHandler(async (req, res) => {
    const user = await findUserInBusiness(req.params.id, req.businessId);

    const previous = { status: user.status };
    user.status = 'active';
    user.statusReason = undefined;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();

    audit(req, 'REACTIVATE_USER', 'USER', user._id, { name: user.name }, previous, { status: 'active' });

    res.json({ message: `${user.name} can sign in again`, user: user.toPublic() });
  })
);

// @route   PUT /api/admin/users/:id/role
// @access  Admin
router.put(
  '/users/:id/role',
  requireCapability('users.manage'),
  [body('role').isIn(ROLES).withMessage('Pick a valid role')],
  validate,
  asyncHandler(async (req, res) => {
    const user = await findUserInBusiness(req.params.id, req.businessId);

    if (String(user._id) === String(req.user._id)) {
      throw new ApiError(400, 'You cannot change your own role');
    }

    await assertNotLastAdmin(user, { changingTo: req.body.role });

    const previous = { role: user.role };
    user.role = req.body.role;
    // The role is baked into issued tokens, so old ones must stop working.
    user.sessionsValidFrom = new Date();
    await user.save();

    audit(req, 'CHANGE_ROLE', 'USER', user._id, { name: user.name }, previous, { role: user.role });

    res.json({ message: `${user.name} is now ${user.role}`, user: user.toPublic() });
  })
);

// @route   POST /api/admin/users/:id/reset-password
// @desc    Issue a temporary password the user must change at next sign-in
// @access  Admin
router.post(
  '/users/:id/reset-password',
  requireCapability('users.manage'),
  asyncHandler(async (req, res) => {
    const user = await findUserInBusiness(req.params.id, req.businessId, { select: '+password' });

    // Readable but high-entropy, because it gets read aloud or written down.
    const temporary = `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;

    user.password = temporary;
    user.mustChangePassword = true;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();

    audit(req, 'RESET_PASSWORD', 'USER', user._id, { name: user.name });

    // Returned exactly once, to the admin who asked, and never stored in clear.
    res.json({
      message: `Temporary password for ${user.name}. They must change it when they sign in.`,
      temporaryPassword: temporary,
    });
  })
);

/* ---------------------------------------------------------------- audit log */

// @route   GET /api/admin/audit
// @access  Admin
router.get(
  '/audit',
  requireCapability('audit.view'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, userId, action, resourceType, startDate, endDate, search } = req.query;
    const filter = { businessId: req.businessId };

    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ userName: rx }, { action: rx }, { summary: rx }];
    }

    const [entries, total] = await Promise.all([
      AuditLog.find(filter, { skip: (page - 1) * limit, limit }),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      data: entries,
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

// @route   GET /api/admin/audit/filters
// @desc    The distinct values actually present, for the filter dropdowns
// @access  Admin
router.get(
  '/audit/filters',
  requireCapability('audit.view'),
  asyncHandler(async (req, res) => {
    const [actions, resourceTypes, users] = await Promise.all([
      AuditLog.distinct('action', { businessId: req.businessId }),
      AuditLog.distinct('resourceType', { businessId: req.businessId }),
      User.find({ businessId: req.businessId }, { sort: { name: 1 }, select: 'name' }),
    ]);

    res.json({
      actions: actions.sort(),
      resourceTypes: resourceTypes.sort(),
      users: users.map((u) => ({ id: u._id, name: u.name })),
    });
  })
);

// @route   GET /api/admin/overview
// @desc    Counts for the admin landing screen
// @access  Admin
router.get(
  '/overview',
  requireCapability('users.manage'),
  asyncHandler(async (req, res) => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const biz = req.businessId;

    const [pending, active, suspended, rejected, recentActivity, todayCount] = await Promise.all([
      User.countDocuments({ status: 'pending', businessId: biz }),
      User.countDocuments({ status: 'active', businessId: biz }),
      User.countDocuments({ status: 'suspended', businessId: biz }),
      User.countDocuments({ status: 'rejected', businessId: biz }),
      AuditLog.find({ businessId: biz }, { limit: 8 }),
      AuditLog.countDocuments({ businessId: biz, createdAt: { $gte: dayAgo } }),
    ]);

    res.json({
      users: { pending, active, suspended, rejected },
      activityToday: todayCount,
      recentActivity,
    });
  })
);

// @route   GET /api/admin/notifications
// @desc    Pending signups + recent activity for the notification bell
// @access  Admin
router.get(
  '/notifications',
  requireCapability('users.manage'),
  asyncHandler(async (req, res) => {
    const biz = req.businessId;
    const since = req.query.since ? new Date(req.query.since) : null;

    const activityFilter = { businessId: biz };
    if (since && !Number.isNaN(since.getTime())) {
      activityFilter.createdAt = { $gte: since };
    }

    const [pendingUsers, recentActivity, pendingCount] = await Promise.all([
      User.find({ status: 'pending', businessId: biz }, { sort: { createdAt: -1 }, limit: 10 }),
      AuditLog.find(activityFilter, { limit: 20 }),
      User.countDocuments({ status: 'pending', businessId: biz }),
    ]);

    res.json({
      pendingCount,
      pendingUsers: pendingUsers.map((u) => u.toPublic()),
      recentActivity,
      unreadCount: since
        ? recentActivity.length + (pendingCount > 0 ? 1 : 0)
        : pendingCount + recentActivity.length,
    });
  })
);

module.exports = router;
