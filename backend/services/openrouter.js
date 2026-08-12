const env = require('../config/env');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/**
 * Prefer the free router, then other free models that still have capacity.
 * Never pin llama-3.1-8b:free — OpenRouter removed that free endpoint.
 */
const FREE_FALLBACKS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-12b-it:free',
  'qwen/qwen3-4b:free',
];

/** Cheap paid models used when free capacity is gone (you have credits). */
const PAID_FALLBACKS = [
  'meta-llama/llama-3.1-8b-instruct',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku',
];

const isConfigured = () => Boolean(env.openrouterApiKey);

const headers = () => ({
  Authorization: `Bearer ${env.openrouterApiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': env.openrouterSiteUrl,
  'X-OpenRouter-Title': env.openrouterSiteName,
});

/** Pull "use this slug instead: foo/bar" from OpenRouter error text. */
const extractSuggestedSlug = (raw) => {
  const match = String(raw || '').match(/use this slug instead:\s*([a-z0-9_./:-]+)/i);
  return match ? match[1].trim() : null;
};

/** If a :free model died, try the same model without :free. */
const paidVariantOf = (model) => {
  if (!model || !String(model).endsWith(':free')) return null;
  return String(model).replace(/:free$/, '');
};

/** Turn OpenRouter jargon into something staff can understand. */
const friendlyMessage = (raw, status) => {
  const text = String(raw || '');
  const lower = text.toLowerCase();

  if (status === 401 || lower.includes('user not found') || lower.includes('invalid api key')) {
    return 'AI key is invalid or missing. Check OPENROUTER_API_KEY on the server.';
  }
  if (status === 402 || lower.includes('insufficient') || lower.includes('credits')) {
    return 'OpenRouter credits are low. Add credits, or try again with a free model.';
  }
  if (lower.includes('unavailable for free') || lower.includes('paid version is available')) {
    return 'That free model is offline right now. Switching to a paid backup — try again.';
  }
  if (
    status === 404 ||
    lower.includes('no endpoints') ||
    lower.includes('no endpoint') ||
    lower.includes('not found')
  ) {
    return 'That AI model is temporarily unavailable. Trying another model — please try again in a moment.';
  }
  if (status === 429 || lower.includes('rate limit')) {
    return 'Too many AI requests right now. Wait a few seconds and try again.';
  }
  if (status >= 500 || lower.includes('provider')) {
    return 'The AI provider had a problem. Please try again shortly.';
  }
  if (lower.includes('empty response')) {
    return 'The AI returned an empty answer. Please try again.';
  }
  if (lower.includes('endpoint')) {
    return 'The AI service could not start that request. Please try again — we will use a backup model.';
  }

  return text || 'The AI request failed. Please try again.';
};

const isRetryableRaw = (raw, status) =>
  status === 404 ||
  status === 429 ||
  /no endpoints?/i.test(raw) ||
  /unavailable for free/i.test(raw) ||
  /paid version is available/i.test(raw) ||
  /use this slug instead/i.test(raw);

const parseJsonResponse = async (response) => {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error(friendlyMessage(`OpenRouter returned invalid JSON (${response.status})`, response.status));
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const raw = data?.error?.message || data?.message || `OpenRouter error ${response.status}`;
    const error = new Error(friendlyMessage(raw, response.status));
    error.status = response.status;
    error.rawMessage = raw;
    error.retryable = isRetryableRaw(String(raw), response.status);
    error.suggestedModel = extractSuggestedSlug(raw);
    throw error;
  }

  return data;
};

const uniqueModels = (...lists) => {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const model of list) {
      if (!model || seen.has(model)) continue;
      // Skip known-dead free slug that OpenRouter keeps rejecting
      if (model === 'meta-llama/llama-3.1-8b-instruct:free') continue;
      seen.add(model);
      out.push(model);
    }
  }
  return out;
};

/**
 * Chat completion with automatic fallback across free → paid models.
 * If OpenRouter says a free model is gone and suggests a paid slug, we insert it next.
 */
const chatCompletion = async (messages, { hard = false, json = false, temperature = 0.3 } = {}) => {
  if (!isConfigured()) {
    throw new Error('AI is not set up yet. Ask your admin to add an OpenRouter API key.');
  }

  const models = hard
    ? uniqueModels([env.openrouterModelPaid], PAID_FALLBACKS, [env.openrouterModelFree], FREE_FALLBACKS)
    : uniqueModels([env.openrouterModelFree], FREE_FALLBACKS, [env.openrouterModelPaid], PAID_FALLBACKS);

  let lastError;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const body = {
      model,
      messages,
      temperature,
    };

    if (json) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });

      const data = await parseJsonResponse(response);
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from AI model');

      return { content, model: data?.model || model, usage: data?.usage };
    } catch (error) {
      lastError = error;

      // OpenRouter suggested a replacement slug — try it next
      const suggested = error.suggestedModel || paidVariantOf(model);
      if (suggested && !models.includes(suggested)) {
        models.splice(i + 1, 0, suggested);
      }

      const canRetry =
        error.retryable ||
        error.status === 429 ||
        error.status === 404 ||
        /unavailable for free|paid version is available|no endpoints?/i.test(
          String(error.rawMessage || error.message)
        );

      if (canRetry && i < models.length - 1) continue;
      if (i < models.length - 1 && hard) continue;

      if (i === models.length - 1 && canRetry) {
        throw new Error(
          'None of the AI models are available right now. Check your OpenRouter credits or try again later.'
        );
      }
      throw error;
    }
  }

  throw lastError || new Error('The AI request failed. Please try again.');
};

/**
 * Speech-to-text via OpenRouter (Whisper). Small per-minute cost.
 */
const transcribeAudio = async (base64Audio, format = 'webm', { language = 'ur', hard = false } = {}) => {
  if (!isConfigured()) {
    throw new Error('AI is not set up yet. Ask your admin to add an OpenRouter API key.');
  }

  const models = hard
    ? uniqueModels([env.openrouterSttFallback], [env.openrouterStt], ['openai/whisper-large-v3', 'openai/whisper-1'])
    : uniqueModels([env.openrouterStt], [env.openrouterSttFallback], ['openai/whisper-1', 'openai/whisper-large-v3']);

  let lastError;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];

    try {
      const response = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model,
          language,
          input_audio: { data: base64Audio, format },
        }),
      });

      const data = await parseJsonResponse(response);
      const text = (data?.text || '').trim();
      if (!text) throw new Error('Could not understand the audio. Please speak clearly and try again.');
      return { text, model };
    } catch (error) {
      lastError = error;
      const canRetry = error.retryable || error.status === 429 || error.status === 404;
      if (canRetry && i < models.length - 1) continue;
      if (i < models.length - 1) continue;
      throw error;
    }
  }

  throw lastError || new Error('Could not transcribe your voice. Please try again.');
};

/**
 * Vision OCR for delivery notes — uses paid multimodal models with fallbacks.
 */
const analyzeImage = async (base64Image, mimeType = 'image/jpeg') => {
  if (!isConfigured()) {
    throw new Error('AI is not set up yet. Ask your admin to add an OpenRouter API key.');
  }

  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You extract structured data from rice mill delivery notes and invoices. ' +
          'Return ONLY valid JSON with keys: productName, quantity, unit, supplier, reference, notes. ' +
          'Use null for missing fields. Quantities must be numbers. Prefer English product names when possible.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract product, quantity, unit, supplier, and reference from this delivery note.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    { hard: true, json: true }
  );

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Could not read the delivery note. Try a clearer, well-lit photo of the whole slip.');
  }
};

/**
 * Vision OCR for cash receipts / bills — money in or money out.
 */
const analyzeCashReceipt = async (base64Image, mimeType = 'image/jpeg', { inCategories = [], outCategories = [] } = {}) => {
  if (!isConfigured()) {
    throw new Error('AI is not set up yet. Ask your admin to add an OpenRouter API key.');
  }

  const dataUrl = `data:${mimeType};base64,${base64Image}`;
  const inList = inCategories.join(', ') || 'Sale, Other income';
  const outList = outCategories.join(', ') || 'Personal expense, Utilities, Other expense';

  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You extract cash-book data from receipts, bills, and payment slips for a rice mill shop in Pakistan. ' +
          'Return ONLY valid JSON with keys: direction, amount, category, purpose, party, reference, occurredAt, notes, confidence. ' +
          'direction must be "in" (money received) or "out" (money spent). ' +
          'amount must be a number (no currency symbols). ' +
          `category must be one of — money in: [${inList}] — money out: [${outList}]. ` +
          'If unsure of category use "Other income" or "Other expense". ' +
          'occurredAt should be YYYY-MM-DD if a date is visible, else null. ' +
          'purpose is a short English description of what was paid/received. ' +
          'party is who paid or was paid. confidence is 0-1. Use null for missing fields.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Read this receipt and extract cash direction, amount, category, purpose, party, date, and reference.',
          },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    { hard: true, json: true }
  );

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Could not read the receipt. Try a clearer, well-lit photo of the whole slip.');
  }

  const direction = parsed.direction === 'in' ? 'in' : parsed.direction === 'out' ? 'out' : null;
  const amount = Number(parsed.amount);
  const allowed = direction === 'in' ? inCategories : direction === 'out' ? outCategories : [];
  let category = parsed.category || null;
  if (category && allowed.length && !allowed.includes(category)) {
    category = direction === 'in' ? 'Other income' : 'Other expense';
  }
  if (!category && direction) {
    category = direction === 'in' ? 'Other income' : 'Other expense';
  }

  return {
    direction,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    category,
    purpose: parsed.purpose || null,
    party: parsed.party || null,
    reference: parsed.reference || null,
    occurredAt: parsed.occurredAt || null,
    notes: parsed.notes || null,
    confidence: parsed.confidence ?? null,
  };
};

module.exports = {
  isConfigured,
  chatCompletion,
  transcribeAudio,
  analyzeImage,
  analyzeCashReceipt,
  friendlyMessage,
};

