import api, { getErrorMessage } from './api';

/**
 * The assistant reuses the shared client rather than building its own instance.
 *
 * `api.create()` copies configuration but *not* interceptors, so the old
 * per-call instances had no 401 handling: leaving the assistant open past token
 * expiry produced "Something went wrong with the assistant" instead of a session
 * expiry, and the user retried into the same wall while the rest of the app
 * signed them out. It also allocated a fresh instance and interceptor per call.
 *
 * The only thing these endpoints genuinely need is a longer timeout — a model
 * round-trip is not a database query.
 */
const AI = { timeout: 90000 };

/** Quick probe — must not block the rest of the app. */
export const fetchAiStatus = (signal) =>
  api.get('/ai/status', { signal, timeout: 8000 }).then((r) => r.data);

export const sendChatMessage = (message) =>
  api.post('/ai/chat', { message }, AI).then((r) => r.data);

export const parseIntent = (text) => api.post('/ai/intent', { text }, AI).then((r) => r.data);

export const sendVoiceAudio = (audio, format = 'webm', hard = false) =>
  api.post('/ai/voice', { audio, format, hard }, AI).then((r) => r.data);

export const fetchBriefing = () => api.get('/ai/briefing', AI).then((r) => r.data);

export const scanDeliveryNote = (image, mimeType = 'image/jpeg') =>
  api.post('/ai/scan', { image, mimeType }, AI).then((r) => r.data);

export const scanCashReceipt = (image, mimeType = 'image/jpeg') =>
  api.post('/ai/scan-receipt', { image, mimeType }, AI).then((r) => r.data);

export const saveCashEntry = (payload) => api.post('/cash-book', payload).then((r) => r.data);

export const fetchAnomalies = () => api.get('/ai/anomalies', AI).then((r) => r.data);

export const confirmTransaction = (payload) =>
  api.post('/transactions', payload).then((r) => r.data);

/** Friendlier copy for AI-related failures (OpenRouter jargon, timeouts, etc.). */
export const getAiErrorMessage = (error, fallback = 'Something went wrong with the assistant.') => {
  const raw = getErrorMessage(error, '');
  const lower = String(raw || '').toLowerCase();

  if (!raw) return fallback;
  if (lower.includes('no endpoint') || lower.includes('no endpoints') || lower.includes('unavailable for free')) {
    return 'That AI model is busy or offline. Please try again in a moment.';
  }
  if (lower.includes('timeout') || lower.includes('took too long') || error?.code === 'ECONNABORTED') {
    return 'The assistant took too long. Check your connection and try again.';
  }
  if (lower.includes('network') || lower.includes('cannot reach')) {
    return 'Cannot reach the AI service. Is the server running?';
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many AI requests. Wait a few seconds and try again.';
  }
  if (lower.includes('credit') || lower.includes('402')) {
    return 'OpenRouter credits are low. Add credits or use a free model.';
  }
  if (lower.includes('api key') || lower.includes('not configured') || lower.includes('not set up')) {
    return 'AI is not set up yet. Ask your admin to add an OpenRouter API key.';
  }

  return raw || fallback;
};
