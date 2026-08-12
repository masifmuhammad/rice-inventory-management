import api, { getToken, getErrorMessage } from './api';

const apiBase = () => process.env.REACT_APP_API_URL || '/api';

const aiApi = () =>
  api.create({
    baseURL: apiBase(),
    timeout: 90000,
    headers: { 'Content-Type': 'application/json' },
  });

const withAuth = (instance) => {
  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  return instance;
};

/** Quick probe — must not block the rest of the app. */
export const fetchAiStatus = (signal) =>
  withAuth(aiApi()).get('/ai/status', { signal, timeout: 8000 }).then((r) => r.data);

export const sendChatMessage = (message) =>
  withAuth(aiApi()).post('/ai/chat', { message }).then((r) => r.data);

export const parseIntent = (text) => withAuth(aiApi()).post('/ai/intent', { text }).then((r) => r.data);

export const sendVoiceAudio = (audio, format = 'webm', hard = false) =>
  withAuth(aiApi()).post('/ai/voice', { audio, format, hard }).then((r) => r.data);

export const fetchBriefing = () => withAuth(aiApi()).get('/ai/briefing').then((r) => r.data);

export const scanDeliveryNote = (image, mimeType = 'image/jpeg') =>
  withAuth(aiApi()).post('/ai/scan', { image, mimeType }).then((r) => r.data);

export const scanCashReceipt = (image, mimeType = 'image/jpeg') =>
  withAuth(aiApi()).post('/ai/scan-receipt', { image, mimeType }).then((r) => r.data);

export const saveCashEntry = (payload) => api.post('/cash-book', payload).then((r) => r.data);

export const fetchAnomalies = () => withAuth(aiApi()).get('/ai/anomalies').then((r) => r.data);

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
