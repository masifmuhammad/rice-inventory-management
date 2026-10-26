const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { requireCapability } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const shop = require('../services/shop');
router.use(auth);
router.get('/products', requireCapability('products.view'), asyncHandler(async (req, res) => res.json(await shop.catalogue(req.businessId))));
router.put('/products/:id', requireCapability('products.manage'), [
  param('id').isUUID(), body('packQuantity').isFloat({ min: 0.0001, max: 9999999999 }).toFloat(),
  body('supplierId').optional({ values: 'falsy' }).isUUID(), body('buttonLabel').optional().trim().isLength({ max: 40 }),
  body('colour').optional().isIn(['green','blue','orange','purple','rose']),
  body('paymentDays').optional().isInt({ min: 0, max: 365 }).toInt(),
], validate, asyncHandler(async (req, res) => {
  const result = await shop.configure(req.params.id, req.body, req.businessId);
  audit(req, 'CONFIGURE_SHOP_PRODUCT', 'PRODUCT', result.id, req.body);
  res.json(result);
}));
router.post('/checkout', requireCapability('transactions.create'), [
  body('requestId').isUUID(), body('mode').isIn(['sale','receive']), body('items').isArray({ min: 1, max: 50 }),
  body('items.*.product').isUUID(), body('items.*.count').isInt({ min: 1, max: 9999 }).toInt(),
  body('items.*.packQuantity').isFloat({ min: 0.0001, max: 9999999999 }).toFloat(),
  body('items.*.unitPrice').isFloat({ min: 0, max: 9999999999 }).toFloat(),
  body('items.*.supplierId').optional({ values: 'falsy' }).isUUID(),
], validate, asyncHandler(async (req, res) => {
  const result = await shop.checkout(req.body, req.businessId, req.user);
  if (!result.replayed) audit(req, 'SHOP_CHECKOUT', 'TRANSACTION', result.transactions[0].id,
    { mode: result.mode, count: result.count, total: result.total, transactions: result.transactions.map((t) => t.id) });
  res.status(result.replayed ? 200 : 201).json(result);
}));
module.exports = router;
