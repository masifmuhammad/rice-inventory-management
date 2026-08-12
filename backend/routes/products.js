const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { requireCapability } = require('../middleware/permissions');
const { audit } = require('../middleware/audit');

const CATEGORIES = ['Basmati', 'Jasmine', 'Long Grain', 'Short Grain', 'Brown Rice', 'Wild Rice', 'Other'];
const UNITS = ['kg', 'ton', 'bag', 'sack'];

const CATEGORY_PREFIX = {
  Basmati: 'BAS',
  Jasmine: 'JAS',
  'Long Grain': 'LNG',
  'Short Grain': 'SHT',
  'Brown Rice': 'BRN',
  'Wild Rice': 'WLD',
  Other: 'GEN',
};

/** Escapes user input before it reaches a $regex, so `.` or `(` can't blow up the query. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a unique SKU like `BAS-0007`.
 *
 * The unique index is the real guard against collisions; this just picks the next
 * free number and retries if two requests land on the same one.
 */
const generateSku = async (category, businessId) => {
  const prefix = CATEGORY_PREFIX[category] || 'GEN';

  const last = await Product.findOne(
    { sku: new RegExp(`^${prefix}-\\d+$`), businessId },
    { sort: { sku: -1 }, select: 'sku' }
  );

  const lastNumber = last ? parseInt(last.sku.split('-')[1], 10) : 0;
  return `${prefix}-${String(lastNumber + 1).padStart(4, '0')}`;
};

// @route   GET /api/products
// @desc    List products
// @access  Private
router.get(
  '/',
  auth,
  requireCapability('products.view'),
  [
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    query('sort').optional().isIn(['name', 'newest', 'stock', 'value']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { search, category, lowStock, sort = 'newest', limit = 500 } = req.query;
    const filter = { isActive: true, businessId: req.businessId };

    if (search) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ name: rx }, { sku: rx }, { supplier: rx }, { batchNumber: rx }];
    }

    if (category) filter.category = category;
    if (lowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minStockLevel'] };

    const sortMap = {
      name: { name: 1 },
      newest: { createdAt: -1 },
      stock: { currentStock: -1 },
      value: { createdAt: -1 },
    };

    const products = await Product.find(filter, { sort: sortMap[sort], limit });

    res.json(products);
  })
);

// @route   GET /api/products/meta
// @desc    Allowed categories/units, so the UI never drifts from the schema
// @access  Private
router.get('/meta', auth, (req, res) => {
  res.json({ categories: CATEGORIES, units: UNITS });
});

// @route   GET /api/products/summary
// @desc    Totals across ALL products, not just the page that was fetched
// @access  Private
router.get(
  '/summary',
  auth,
  requireCapability('products.view'),
  asyncHandler(async (req, res) => {
    // Computed in the database rather than by reducing the (capped) list the
    // client happens to be holding — otherwise a business past the row limit
    // sees a stock value quietly missing everything beyond it.
    const [totals] = await Product.aggregate(
      [
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            stockValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
            retailValue: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } },
            lowStock: {
              $sum: { $cond: [{ $lte: ['$currentStock', '$minStockLevel'] }, 1, 0] },
            },
          },
        },
      ],
      { businessId: req.businessId }
    );

    const summary = totals || { total: 0, stockValue: 0, retailValue: 0, lowStock: 0 };

    res.json({
      total: summary.total,
      stockValue: Math.round(summary.stockValue * 100) / 100,
      retailValue: Math.round(summary.retailValue * 100) / 100,
      lowStock: summary.lowStock,
      healthy: summary.total - summary.lowStock,
    });
  })
);

// @route   GET /api/products/:id
// @access  Private
router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id, { businessId: req.businessId });
    if (!product) throw new ApiError(404, 'Product not found');
    res.json(product);
  })
);

const productValidators = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 120 }),
  body('sku').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('category').isIn(CATEGORIES).withMessage('Pick a valid category'),
  body('unit').optional().isIn(UNITS).withMessage('Pick a valid unit'),
  body('currentStock').isFloat({ min: 0 }).withMessage('Stock must be 0 or greater').toFloat(),
  body('minStockLevel').isFloat({ min: 0 }).withMessage('Minimum stock must be 0 or greater').toFloat(),
  body('maxStockLevel').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body('costPrice').isFloat({ min: 0 }).withMessage('Cost price must be 0 or greater').toFloat(),
  body('sellingPrice').isFloat({ min: 0 }).withMessage('Selling price must be 0 or greater').toFloat(),
];

// @route   POST /api/products
// @desc    Create a product. SKU is generated when the client leaves it blank.
// @access  Private
router.post(
  '/',
  auth,
  requireCapability('products.manage'),
  productValidators,
  validate,
  asyncHandler(async (req, res) => {
    const payload = { ...req.body, createdBy: req.user._id, businessId: req.businessId };

    const providedSku = (req.body.sku || '').trim().toUpperCase();
    if (providedSku) {
      const clash = await Product.findOne({ sku: providedSku, businessId: req.businessId });
      if (clash) throw new ApiError(409, `SKU ${providedSku} is already used by "${clash.name}"`);
      payload.sku = providedSku;
    }

    let product;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (!providedSku) payload.sku = await generateSku(payload.category, req.businessId);
        product = await Product.create(payload);
        break;
      } catch (error) {
        // Another request claimed the same generated SKU — pick the next one.
        const isDuplicateSku = error.code === 11000 && !providedSku;
        if (!isDuplicateSku || attempt === 4) throw error;
      }
    }

    await product.populate('createdBy', 'name email');
    audit(req, 'CREATE_PRODUCT', 'PRODUCT', product._id, { name: product.name, sku: product.sku });

    res.status(201).json(product);
  })
);

// @route   PUT /api/products/:id
// @access  Private
router.put(
  '/:id',
  auth,
  requireCapability('products.manage'),
  productValidators,
  validate,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id, { businessId: req.businessId });
    if (!product) throw new ApiError(404, 'Product not found');

    const before = product.toObject();
    const { sku, createdBy, _id, ...updates } = req.body;

    if (sku !== undefined) {
      const nextSku = (sku || '').trim().toUpperCase();
      if (nextSku && nextSku !== product.sku) {
        const clash = await Product.findOne({ sku: nextSku, _id: { $ne: product._id }, businessId: req.businessId });
        if (clash) throw new ApiError(409, `SKU ${nextSku} is already used by "${clash.name}"`);
        product.sku = nextSku;
      } else if (!nextSku) {
        product.sku = await generateSku(updates.category || product.category, req.businessId);
      }
    }

    Object.assign(product, updates);
    await product.save();
    await product.populate('createdBy', 'name email');

    audit(
      req,
      'UPDATE_PRODUCT',
      'PRODUCT',
      product._id,
      { name: product.name },
      { currentStock: before.currentStock, costPrice: before.costPrice, sellingPrice: before.sellingPrice },
      { currentStock: product.currentStock, costPrice: product.costPrice, sellingPrice: product.sellingPrice }
    );

    res.json(product);
  })
);

// @route   DELETE /api/products/:id
// @desc    Archive a product. Soft delete keeps historical transactions readable.
// @access  Private
router.delete(
  '/:id',
  auth,
  requireCapability('products.delete'),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id, { businessId: req.businessId });
    if (!product) throw new ApiError(404, 'Product not found');

    if (!product.isActive) {
      return res.json({ message: 'Product already archived', id: product._id });
    }

    product.isActive = false;
    await product.save();

    const transactionCount = await Transaction.countDocuments({ product: product._id });

    audit(req, 'DELETE_PRODUCT', 'PRODUCT', product._id, {
      name: product.name,
      sku: product.sku,
      transactionCount,
    });

    res.json({ message: `"${product.name}" archived`, id: product._id });
  })
);

module.exports = router;
