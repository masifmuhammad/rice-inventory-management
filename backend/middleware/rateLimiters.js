const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

const message = (text) => (req, res) => res.status(429).json({ message: text });

/** Broad guard on the whole API surface. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: message('Too many requests. Please slow down and try again shortly.'),
});

/** Tight guard on credential endpoints to blunt brute-force attempts. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: message('Too many login attempts. Please try again in 15 minutes.'),
});

/**
 * Registration counts every request, successful ones included.
 *
 * `authLimiter` skips successes, which is right for login — only failures are a
 * brute-force signal. Applied to registration it means the *successful* path is
 * unbounded, so a script working from the public business list can fill the
 * users table with pending accounts, each one a foreign-key anchor that cannot
 * be cleaned up through the API.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 100000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: message('Too many account requests from this network. Please try again later.'),
});

/** AI endpoints — generous enough for daily use, tight enough to protect credits. */
const aiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: isTest ? 100000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: message('Daily AI limit reached. Try again tomorrow or contact your admin.'),
});

module.exports = { apiLimiter, authLimiter, registerLimiter, aiLimiter };
