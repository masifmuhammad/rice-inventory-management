const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { requireCapability, can } = require('../middleware/permissions');
const { aiLimiter } = require('../middleware/rateLimiters');
const { isConfigured, transcribeAudio, analyzeImage, analyzeCashReceipt } = require('../services/openrouter');
const CashEntry = require('../models/CashEntry');
const { gatherBusinessContext, detectAnomalies } = require('../services/aiContext');
const {
  parseIntentFromText,
  resolveIntent,
  answerQuestion,
  generateBriefing,
  explainRestock,
  explainAnomalies,
  shouldSkipBriefingAi,
  matchProduct,
} = require('../services/aiIntent');

const briefingCache = new Map();
const BRIEFING_TTL_MS = 60 * 60 * 1000;

const wrapAi = (fn) =>
  asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const status = error.status && error.status < 500 ? error.status : 502;
      throw new ApiError(status, error.message || 'The AI request failed. Please try again.');
    }
  });

const getContext = async (req) =>
  gatherBusinessContext(req.businessId, { canViewCash: can(req.user.role, 'cash.view') });

// @route   GET /api/ai/status
router.get(
  '/status',
  auth,
  requireCapability('products.view'),
  asyncHandler(async (req, res) => {
    res.json({
      enabled: isConfigured(),
      message: isConfigured()
        ? 'AI assistant is ready.'
        : 'Add OPENROUTER_API_KEY on the server to enable the assistant.',
    });
  })
);

// @route   POST /api/ai/chat
router.post(
  '/chat',
  auth,
  aiLimiter,
  requireCapability('products.view'),
  wrapAi(async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) throw new ApiError(400, 'Type a question first.');

    const context = await getContext(req);
    const reply = await answerQuestion(message.trim(), context);

    res.json({ reply });
  })
);

// @route   POST /api/ai/intent
router.post(
  '/intent',
  auth,
  aiLimiter,
  requireCapability('products.view'),
  wrapAi(async (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) throw new ApiError(400, 'Say or type a command first.');

    const context = await getContext(req);
    const parsed = await parseIntentFromText(text.trim(), context);
    const resolved = resolveIntent(parsed, context);

    if (resolved.requiresConfirmation && !can(req.user.role, 'transactions.create')) {
      throw new ApiError(403, 'Your account cannot record transactions.');
    }

    res.json({
      transcript: text.trim(),
      intent: resolved,
    });
  })
);

// @route   POST /api/ai/voice
router.post(
  '/voice',
  auth,
  aiLimiter,
  requireCapability('products.view'),
  wrapAi(async (req, res) => {
    const { audio, format = 'webm', hard = false } = req.body;
    if (!audio) throw new ApiError(400, 'No audio received.');

    const { text, model: sttModel } = await transcribeAudio(audio, format, { language: 'ur', hard });

    const context = await getContext(req);
    const parsed = await parseIntentFromText(text, context);
    const resolved = resolveIntent(parsed, context);

    if (resolved.requiresConfirmation && !can(req.user.role, 'transactions.create')) {
      throw new ApiError(403, 'Your account cannot record transactions.');
    }

    res.json({
      transcript: text,
      sttModel,
      intent: resolved,
    });
  })
);

// @route   GET /api/ai/briefing
router.get(
  '/briefing',
  auth,
  aiLimiter,
  requireCapability('products.view'),
  wrapAi(async (req, res) => {
    const cacheKey = `${req.businessId}:${new Date().toISOString().slice(0, 10)}`;
    const cached = briefingCache.get(cacheKey);
    if (cached && Date.now() - cached.at < BRIEFING_TTL_MS) {
      return res.json({ ...cached.payload, cached: true });
    }

    const [context, anomalies] = await Promise.all([
      getContext(req),
      detectAnomalies(req.businessId),
    ]);

    // Quiet / empty days: local briefing only — no LLM round-trips.
    // Busy days: run briefing + restock + anomaly explainers in parallel.
    const [briefing, restock, anomalyText] = await Promise.all([
      generateBriefing(context, anomalies),
      explainRestock(context.restockHints),
      explainAnomalies(anomalies),
    ]);

    const payload = {
      briefing,
      restock,
      anomalies: anomalyText,
      raw: {
        today: context.today,
        lowStockCount: context.lowStock.length,
        restockCount: context.restockHints.length,
        anomalyCount: anomalies.length,
        aiSkipped: shouldSkipBriefingAi(context, anomalies),
      },
      cached: false,
    };

    briefingCache.set(cacheKey, { at: Date.now(), payload });
    res.json(payload);
  })
);

// @route   POST /api/ai/scan
router.post(
  '/scan',
  auth,
  aiLimiter,
  requireCapability('transactions.create'),
  wrapAi(async (req, res) => {
    const { image, mimeType = 'image/jpeg' } = req.body;
    if (!image) throw new ApiError(400, 'No image received. Choose a photo of the delivery slip.');

    const extracted = await analyzeImage(image, mimeType);
    const context = await getContext(req);
    const product = extracted.productName ? matchProduct(extracted.productName, context.products) : null;

    res.json({
      extracted,
      product: product
        ? {
            id: product.id,
            name: product.name,
            unit: product.unit,
            costPrice: product.costPrice,
          }
        : null,
      candidates: context.products.slice(0, 50).map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        costPrice: p.costPrice,
      })),
      proposedTransaction: product && extracted.quantity
        ? {
            type: 'stock_in',
            product: product.id,
            productName: product.name,
            quantity: Number(extracted.quantity) || null,
            unit: extracted.unit || product.unit,
            supplier: extracted.supplier || null,
            reference: extracted.reference || null,
            notes: extracted.notes || null,
          }
        : null,
    });
  })
);

// @route   POST /api/ai/scan-receipt
// @desc    Read a cash receipt / bill and propose a cash-book entry (confirm before save)
router.post(
  '/scan-receipt',
  auth,
  aiLimiter,
  requireCapability('cash.manage'),
  wrapAi(async (req, res) => {
    const { image, mimeType = 'image/jpeg' } = req.body;
    if (!image) throw new ApiError(400, 'No image received. Choose a photo of the receipt.');

    const extracted = await analyzeCashReceipt(image, mimeType, {
      inCategories: CashEntry.IN_CATEGORIES,
      outCategories: CashEntry.OUT_CATEGORIES,
    });

    if (!extracted.direction || !extracted.amount) {
      throw new ApiError(
        422,
        'Could not find a clear amount on that receipt. Try a sharper photo, or enter it manually in Cash Book.'
      );
    }

    res.json({
      extracted,
      categories: {
        in: CashEntry.IN_CATEGORIES,
        out: CashEntry.OUT_CATEGORIES,
      },
      proposedEntry: {
        direction: extracted.direction,
        amount: extracted.amount,
        category: extracted.category,
        purpose: extracted.purpose || (extracted.direction === 'in' ? 'Receipt — money in' : 'Receipt — money out'),
        party: extracted.party || '',
        reference: extracted.reference || '',
        notes: extracted.notes || 'From AI receipt scan',
        occurredAt: extracted.occurredAt || new Date().toISOString().slice(0, 10),
      },
    });
  })
);

// @route   GET /api/ai/anomalies
router.get(
  '/anomalies',
  auth,
  aiLimiter,
  requireCapability('reports.view'),
  wrapAi(async (req, res) => {
    const anomalies = await detectAnomalies(req.businessId);
    const explanation = await explainAnomalies(anomalies);
    res.json({ anomalies, explanation });
  })
);

module.exports = router;
