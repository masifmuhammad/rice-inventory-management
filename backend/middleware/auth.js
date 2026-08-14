const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Business = require('../models/Business');
const env = require('../config/env');

/**
 * Endpoints a signed-in user may reach before they have set their own password.
 *
 * Keyed by method as well as path: matching on path alone also allowed
 * `PUT /api/auth/me`, so someone still on an admin-issued temporary password
 * could change the account's email address — taking over the identity without
 * ever proving they own it.
 */
const PASSWORD_CHANGE_ALLOWLIST = ['GET /api/auth/me', 'PUT /api/auth/me/password'];

const auth = async (req, res, next) => {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: 'Sign in to continue', code: 'NO_TOKEN' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      message: expired ? 'Your session expired. Please sign in again.' : 'Invalid session',
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }

  try {
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'Account no longer exists', code: 'USER_GONE' });
    }

    const issuedAt = decoded.iat * 1000;
    if (user.sessionsValidFrom && issuedAt < user.sessionsValidFrom.getTime()) {
      return res.status(401).json({
        message: 'Your session is no longer valid. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
    }

    if (user.status !== 'active') {
      const messages = {
        pending: 'Your account is waiting for an administrator to approve it.',
        suspended: 'Your account has been suspended.',
        rejected: 'Your account request was declined.',
      };
      return res.status(403).json({
        message: messages[user.status] || 'Your account is not active.',
        code: `ACCOUNT_${user.status.toUpperCase()}`,
        reason: user.statusReason,
      });
    }

    if (
      user.mustChangePassword &&
      !PASSWORD_CHANGE_ALLOWLIST.includes(`${req.method} ${req.baseUrl}${req.path}`)
    ) {
      return res.status(403).json({
        message: 'Please set a new password before continuing.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    const activeBusinessId = decoded.businessId || user.businessId;
    if (!activeBusinessId) {
      return res.status(403).json({
        message: 'Your account is not assigned to a business.',
        code: 'NO_BUSINESS',
      });
    }

    const canAccess = await Business.userCanAccess(user.id, activeBusinessId, {
      userBusinessId: user.businessId,
      role: user.role,
    });

    if (!canAccess) {
      return res.status(403).json({
        message: 'You do not have access to this business.',
        code: 'BUSINESS_FORBIDDEN',
      });
    }

    req.user = user;
    req.token = token;
    req.businessId = activeBusinessId;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = auth;
module.exports.auth = auth;
