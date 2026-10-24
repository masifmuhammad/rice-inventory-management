const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { requireCapability } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { dayStart, localDay } = require('../db/dates');
const ledger = require('../services/creditLedger');
const dateCheck = (value) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid date'); dayStart(value); return true; };
const money = (value) => Number.isFinite(Number(value)) && /^\d+(\.\d{1,2})?$/.test(String(value));
router.use(auth, requireCapability('credit.view'));
router.get('/', asyncHandler(async (req,res) => res.json({ customers: await ledger.listCustomers(req.businessId), today: localDay() })));
router.post('/customers', requireCapability('credit.manage'), [
  body('name').trim().notEmpty().isLength({max:120}).withMessage('Enter a customer name (up to 120 characters)'),
  body('phone').optional().trim().isLength({max:40}), body('notes').optional().trim().isLength({max:1000}),
  body('openingBalance').optional().custom(money).isFloat({min:0,max:9999999999}).toFloat(),
  body('dueDate').optional({values:'falsy'}).custom(dateCheck),
], validate, asyncHandler(async(req,res) => {
  const customer = await ledger.createCustomer(req.body,req.businessId,req.user);
  audit(req,'CREATE_CREDIT_CUSTOMER','CUSTOMER',customer.id,{name:customer.name,openingBalance:req.body.openingBalance || 0});
  res.status(201).json(customer);
}));
router.get('/customers/:id', [param('id').isUUID()], validate, asyncHandler(async(req,res) => res.json(await ledger.customerDetail(req.params.id,req.businessId))));
router.put('/customers/:id',requireCapability('credit.manage'),[
  param('id').isUUID(),body('name').trim().notEmpty().isLength({max:120}),body('phone').optional().trim().isLength({max:40}),body('notes').optional().trim().isLength({max:1000}),
],validate,asyncHandler(async(req,res)=>{
  const customer=await ledger.updateCustomer(req.params.id,req.body,req.businessId);
  audit(req,'UPDATE_CREDIT_CUSTOMER','CUSTOMER',customer.id,{name:customer.name});res.json(customer);
}));
router.post('/customers/:id/opening/:chargeId/reverse',requireCapability('credit.reverse'),[
  param('id').isUUID(),param('chargeId').isUUID(),body('reason').trim().isLength({min:3,max:300}),
],validate,asyncHandler(async(req,res)=>{
  const charge=await ledger.reverseOpening(req.params.id,req.params.chargeId,req.body.reason,req.businessId);
  audit(req,'REVERSE_OPENING_CREDIT','CREDIT_CHARGE',charge.id,{reason:req.body.reason,amount:charge.amount});res.json(charge);
}));
router.post('/customers/:id/payments', requireCapability('credit.manage'), [
  param('id').isUUID(), body('requestId').isUUID(),
  body('amount').custom(money).isFloat({gt:0,max:9999999999}).withMessage('Enter a positive amount with up to two decimal places').toFloat(),
  body('paymentDate').custom(dateCheck), body('method').isIn(['cash','bank','easypaisa','jazzcash','other']),
  body('reference').optional().trim().isLength({max:120}), body('notes').optional().trim().isLength({max:500}),
], validate, asyncHandler(async(req,res) => {
  const payment = await ledger.recordPayment(req.params.id,req.body,req.businessId,req.user);
  if (!payment.replayed) audit(req,'RECORD_CREDIT_PAYMENT','CREDIT_PAYMENT',payment.id,{customerId:req.params.id,amount:payment.amount});
  res.status(payment.replayed ? 200 : 201).json(payment);
}));
router.post('/customers/:id/payments/:paymentId/reverse', requireCapability('credit.reverse'), [
  param('id').isUUID(),param('paymentId').isUUID(),body('reason').trim().isLength({min:3,max:300}).withMessage('Enter a reason for the reversal'),
], validate, asyncHandler(async(req,res) => {
  const payment = await ledger.reversePayment(req.params.id,req.params.paymentId,req.body.reason,req.businessId);
  audit(req,'REVERSE_CREDIT_PAYMENT','CREDIT_PAYMENT',payment.id,{amount:payment.amount,reason:req.body.reason});
  res.json(payment);
}));
module.exports = router;
