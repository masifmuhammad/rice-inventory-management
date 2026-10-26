const router = require('express').Router();
const { body, param, query } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { requireCapability } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');
const { audit } = require('../middleware/audit');
const { dayStart, localDay } = require('../db/dates');
const ledger = require('../services/supplierLedger');

const dateCheck = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid calendar date');
  dayStart(value); return true;
};
const money = (value) => Number.isFinite(Number(value)) && /^\d+(\.\d{1,2})?$/.test(String(value));
const quantity = (value) => Number.isFinite(Number(value)) && /^\d+(\.\d{1,4})?$/.test(String(value));
const contactFields = () => [
  body('name').trim().notEmpty().isLength({max:120}).withMessage('Enter a supplier name (up to 120 characters)'),
  body('phone').optional().trim().isLength({max:40}),
  body('notes').optional().trim().isLength({max:1000}),
];
const reasonFields = () => [param('id').isUUID(),body('reason').trim().isLength({min:3,max:300}).withMessage('Enter a reason for the reversal')];
const paymentFields = () => [
  body('method').isIn(['cash','bank','easypaisa','jazzcash','other']),
  body('reference').optional().trim().isLength({max:120}),
  body('notes').optional().trim().isLength({max:500}),
];

router.use(auth,requireCapability('suppliers.view'));
router.get('/',asyncHandler(async(req,res)=>res.json({suppliers:await ledger.listSuppliers(req.businessId),today:localDay()})));
router.post('/',requireCapability('suppliers.manage'),[
  ...contactFields(),body('openingBalance').optional().custom(money).isFloat({min:0,max:9999999999}).toFloat(),
  body('dueDate').optional({values:'falsy'}).custom(dateCheck),body('openingDate').optional({values:'falsy'}).custom(dateCheck),
],validate,asyncHandler(async(req,res)=>{
  const supplier=await ledger.createSupplier(req.body,req.businessId,req.user);
  audit(req,'CREATE_SUPPLIER','SUPPLIER',supplier.id,{name:supplier.name,openingBalance:req.body.openingBalance || 0});
  res.status(201).json(supplier);
}));
router.get('/:id',[
  param('id').isUUID(),query('startDate').optional({values:'falsy'}).custom(dateCheck),query('endDate').optional({values:'falsy'}).custom(dateCheck),
],validate,asyncHandler(async(req,res)=>res.json(await ledger.supplierDetail(req.params.id,req.businessId,req.query))));
router.put('/:id',requireCapability('suppliers.manage'),[
  param('id').isUUID(),...contactFields(),
],validate,asyncHandler(async(req,res)=>{
  const supplier=await ledger.updateSupplier(req.params.id,req.body,req.businessId);
  audit(req,'UPDATE_SUPPLIER','SUPPLIER',supplier.id,{name:supplier.name});res.json(supplier);
}));
router.post('/:id/purchases',requireCapability('suppliers.manage'),[
  param('id').isUUID(),body('requestId').isUUID(),body('product').isUUID(),
  body('quantity').custom(quantity).isFloat({gt:0,max:9999999999}).toFloat(),
  body('price').custom(quantity).isFloat({gt:0,max:9999999999}).toFloat(),
  body('amountPaid').optional().custom(money).isFloat({min:0,max:9999999999}).toFloat(),
  body('purchaseDate').custom(dateCheck),body('dueDate').custom(dateCheck),...paymentFields(),
],validate,asyncHandler(async(req,res)=>{
  const purchase=await ledger.recordPurchase(req.params.id,req.body,req.businessId,req.user);
  if(!purchase.replayed) audit(req,'RECORD_SUPPLIER_PURCHASE','SUPPLIER_CHARGE',purchase.id,{supplierId:req.params.id,amount:purchase.amount});
  res.status(purchase.replayed ? 200 : 201).json(purchase);
}));
router.post('/:id/payments',requireCapability('suppliers.manage'),[
  param('id').isUUID(),body('requestId').isUUID(),
  body('amount').custom(money).isFloat({gt:0,max:9999999999}).withMessage('Enter a positive amount with up to two decimal places').toFloat(),
  body('paymentDate').custom(dateCheck),...paymentFields(),
],validate,asyncHandler(async(req,res)=>{
  const payment=await ledger.recordPayment(req.params.id,req.body,req.businessId,req.user);
  if(!payment.replayed) audit(req,'RECORD_SUPPLIER_PAYMENT','SUPPLIER_PAYMENT',payment.id,{supplierId:req.params.id,amount:payment.amount});
  res.status(payment.replayed ? 200 : 201).json(payment);
}));
router.post('/:id/payments/:paymentId/reverse',requireCapability('suppliers.reverse'),[
  ...reasonFields(),param('paymentId').isUUID(),
],validate,asyncHandler(async(req,res)=>{
  const payment=await ledger.reversePayment(req.params.id,req.params.paymentId,req.body.reason,req.businessId);
  audit(req,'REVERSE_SUPPLIER_PAYMENT','SUPPLIER_PAYMENT',payment.id,{reason:req.body.reason,amount:payment.amount});res.json(payment);
}));
router.post('/:id/charges/:chargeId/reverse',requireCapability('suppliers.reverse'),[
  ...reasonFields(),param('chargeId').isUUID(),
],validate,asyncHandler(async(req,res)=>{
  const charge=await ledger.reverseCharge(req.params.id,req.params.chargeId,req.body.reason,req.businessId);
  audit(req,'REVERSE_SUPPLIER_CHARGE','SUPPLIER_CHARGE',charge.id,{reason:req.body.reason,amount:charge.amount});res.json(charge);
}));

module.exports=router;
