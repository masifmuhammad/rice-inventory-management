/**
 * Every permission decision in one place.
 *
 * The frontend hides buttons a role cannot use, but hiding a button is not
 * security — these checks run on the server, on the route, and are the only
 * thing that actually stops anyone.
 */

// Higher number means strictly more authority.
const RANK = { worker: 1, accountant: 2, admin: 3 };

const rankOf = (role) => RANK[role] || 0;

/** True when `role` is at least as senior as `minimum`. */
const atLeast = (role, minimum) => rankOf(role) >= rankOf(minimum);

/**
 * Named capabilities, so routes read as intent rather than as role arithmetic
 * and the frontend can ask the same questions the server does.
 */
const CAPABILITIES = {
  'products.view': 'worker',
  'products.manage': 'accountant',
  'products.delete': 'admin',

  'transactions.view': 'worker',
  'transactions.create': 'worker',
  'transactions.reverse': 'admin',

  'cash.view': 'accountant',
  'cash.manage': 'accountant',
  'cash.delete': 'admin',

  'reports.view': 'accountant',

  'settings.view': 'worker', // needed for branding on every screen
  'settings.manage': 'admin',

  'users.manage': 'admin',
  'audit.view': 'admin',
};

const can = (role, capability) => {
  const required = CAPABILITIES[capability];
  if (!required) return false; // unknown capability: deny rather than assume
  return atLeast(role, required);
};

/** Express guard. Use after `auth`. */
const requireCapability = (capability) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Sign in to continue', code: 'NO_TOKEN' });
  }

  if (!can(req.user.role, capability)) {
    return res.status(403).json({
      message: 'Your account does not have permission to do that.',
      code: 'FORBIDDEN',
      required: CAPABILITIES[capability],
    });
  }

  next();
};

/** The full capability map for one role, sent to the client to drive the UI. */
const capabilitiesFor = (role) =>
  Object.keys(CAPABILITIES).reduce((acc, capability) => {
    acc[capability] = can(role, capability);
    return acc;
  }, {});

module.exports = { RANK, atLeast, can, requireCapability, capabilitiesFor, CAPABILITIES };
