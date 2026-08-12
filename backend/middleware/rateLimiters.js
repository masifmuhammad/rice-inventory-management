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

module.exports = { apiLimiter, authLimiter };
