const AuditLog = require('../models/AuditLog');

/**
 * Plain-English descriptions of each action, so the admin's activity screen can
 * render any entry without knowing what it means.
 */
const SUMMARIES = {
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in attempt',
  LOGIN_BLOCKED: 'Sign-in blocked (account not active)',
  REGISTER_REQUEST: 'Requested an account',
  CHANGE_PASSWORD: 'Changed their password',
  UPDATE_PROFILE: 'Updated their profile',
  UPDATE_AVATAR: 'Updated their profile picture',
  REMOVE_AVATAR: 'Removed their profile picture',

  APPROVE_USER: 'Approved an account',
  REJECT_USER: 'Declined an account request',
  SUSPEND_USER: 'Suspended an account',
  REACTIVATE_USER: 'Reactivated an account',
  CHANGE_ROLE: 'Changed a role',
  RESET_PASSWORD: 'Reset a password',

  CREATE_PRODUCT: 'Added a product',
  UPDATE_PRODUCT: 'Edited a product',
  DELETE_PRODUCT: 'Archived a product',

  CREATE_TRANSACTION: 'Recorded a transaction',
  DELETE_TRANSACTION: 'Reversed a transaction',

  CREATE_CASH_IN: 'Recorded money in',
  CREATE_CASH_OUT: 'Recorded money out',
  UPDATE_CASH_ENTRY: 'Edited a cash entry',
  DELETE_CASH_ENTRY: 'Deleted a cash entry',

  UPDATE_SETTINGS: 'Changed business settings',
  UPDATE_LOGO: 'Updated the business logo',
  REMOVE_LOGO: 'Removed the business logo',
  CREATE_BUSINESS: 'Created a business',
  UPDATE_BUSINESS: 'Updated a business',
};

/**
 * Writes one line to the audit trail. Best-effort by design: a logging failure
 * must never turn a completed business action into an error for the user.
 */
const createAuditLog = async (
  req,
  action,
  resourceType,
  resourceId,
  details = {},
  previousState = null,
  newState = null,
  options = {}
) => {
  try {
    const user = options.user || req.user;
    if (!user) return;

    await AuditLog.create({
      businessId: options.businessId || req?.businessId || user.businessId,
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action,
      resourceType,
      resourceId,
      summary: options.summary || SUMMARIES[action] || action,
      details,
      previousState,
      newState,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get?.('user-agent'),
    });
  } catch (error) {
    console.error('❌ Failed to write audit log:', error.message);
  }
};

/** Fire-and-forget: keeps the response off the audit write's latency. */
const audit = (...args) => {
  createAuditLog(...args).catch(() => {});
};

module.exports = { createAuditLog, audit, SUMMARIES };
