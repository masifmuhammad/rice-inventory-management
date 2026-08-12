const { validationResult } = require('express-validator');

/**
 * Turns express-validator failures into the same `{ message, errors }` shape the
 * rest of the API uses, so the frontend only ever reads `error.response.data.message`.
 */
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
  }));

  res.status(400).json({ message: errors[0].message, errors });
};

module.exports = validate;
