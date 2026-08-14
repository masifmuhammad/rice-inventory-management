/**
 * Wraps an async route handler so rejected promises reach the error handler
 * instead of hanging the request.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

class ApiError extends Error {
  /** `meta` is merged into the response body — used for machine-readable codes. */
  constructor(status, message, details, meta) {
    super(message);
    this.status = status;
    this.details = details;
    this.meta = meta;
  }
}

const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

/* eslint-disable no-unused-vars */
const errorHandler = (err, req, res, next) => {
  if (err.code === '22P02' || err.name === 'CastError') {
    return res.status(400).json({ message: err.path ? `Invalid ${err.path}` : 'Invalid identifier' });
  }

  // Postgres: unique index violation
  if (err.code === 11000 || err.code === '23505') {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ message: `That ${field} is already in use` });
  }

  // Postgres: value longer than the column, or a number outside NUMERIC's range.
  // Both are bad input, and reporting them as 500s left users retrying an entry
  // that could never save with no idea which field was at fault.
  if (err.code === '22001') {
    return res.status(400).json({ message: 'One of those fields is too long. Please shorten it.' });
  }
  if (err.code === '22003') {
    return res.status(400).json({ message: 'That number is too large. Please check the amount.' });
  }

  const status = err.status || 500;

  if (status >= 500) {
    console.error('❌ Unhandled error:', err);
  }

  res.status(status).json({
    message: status >= 500 ? 'Something went wrong on our end' : err.message,
    ...(err.details ? { errors: err.details } : {}),
    ...(err.meta || {}),
  });
};

module.exports = { asyncHandler, ApiError, notFound, errorHandler };
