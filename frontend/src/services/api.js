import axios from 'axios';

export const TOKEN_KEY = 'rim.token';
export const USER_KEY = 'rim.user';
export const CAPABILITIES_KEY = 'rim.capabilities';

/**
 * Same-origin by default: the Docker image serves the API and this app together,
 * and `package.json` proxies `/api` to :5000 during local development.
 * REACT_APP_API_URL is only needed for split hosting (e.g. Vercel + a separate API).
 */
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' },
});

// #region agent log
const dbg = (location, message, data, hypothesisId) => {
  fetch('http://127.0.0.1:7498/ingest/bb659440-42af-44d0-9469-4bd87f9cef58', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '130b99' },
    body: JSON.stringify({
      sessionId: '130b99',
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
      runId: 'pre-fix',
    }),
  }).catch(() => {});
};
dbg('api.js:init', 'API client created', {
  baseURL: process.env.REACT_APP_API_URL || '/api',
  pageOrigin: typeof window !== 'undefined' ? window.location.origin : null,
}, 'E');
// #endregion

/* ------------------------------------------------------------ token storage */

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private browsing / storage disabled
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* non-fatal: the session just won't survive a refresh */
  }
};

export const getCachedUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedUser = (user) => {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* non-fatal */
  }
};

export const getCachedCapabilities = () => {
  try {
    const raw = localStorage.getItem(CAPABILITIES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedCapabilities = (capabilities) => {
  try {
    if (capabilities) localStorage.setItem(CAPABILITIES_KEY, JSON.stringify(capabilities));
    else localStorage.removeItem(CAPABILITIES_KEY);
  } catch {
    /* non-fatal */
  }
};

/* ------------------------------------------------------------- interceptors */

// Read the token per request rather than pinning it to axios defaults, so a
// login or logout in another tab is picked up immediately.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // #region agent log
  config.metadata = { start: Date.now() };
  dbg('api.js:request', 'Outgoing API request', {
    method: config.method,
    url: config.url,
    baseURL: config.baseURL,
    fullURL: `${config.baseURL || ''}${config.url || ''}`,
  }, 'A');
  // #endregion
  return config;
});

/** Endpoints where a 401 means "wrong password", not "session over". */
const isCredentialRequest = (url = '') =>
  url.includes('/auth/login') || url.includes('/auth/register');

export const AUTH_EXPIRED_EVENT = 'rim:auth-expired';
export const PASSWORD_CHANGE_EVENT = 'rim:password-change-required';

api.interceptors.response.use(
  (response) => {
    // #region agent log
    const ms = Date.now() - (response.config.metadata?.start || Date.now());
    dbg('api.js:response-ok', 'API response OK', {
      url: response.config.url,
      status: response.status,
      ms,
    }, 'A');
    // #endregion
    return response;
  },
  (error) => {
    // #region agent log
    const ms = Date.now() - (error.config?.metadata?.start || Date.now());
    dbg('api.js:response-err', 'API response failed', {
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      status: error.response?.status ?? null,
      code: error.code ?? null,
      message: error.message,
      ms,
    }, 'A');
    // #endregion
    const status = error.response?.status;

    if (status === 401 && !isCredentialRequest(error.config?.url)) {
      setToken(null);
      setCachedUser(null);
      setCachedCapabilities(null);
      window.dispatchEvent(
        new CustomEvent(AUTH_EXPIRED_EVENT, {
          detail: { message: error.response?.data?.message },
        })
      );
    }

    if (
      status === 403 &&
      error.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED' &&
      !window.location.pathname.startsWith('/change-password')
    ) {
      const cached = getCachedUser();
      if (cached) {
        setCachedUser({ ...cached, mustChangePassword: true });
      }
      window.dispatchEvent(new CustomEvent(PASSWORD_CHANGE_EVENT));
    }

    return Promise.reject(error);
  }
);

/* ------------------------------------------------------------------ helpers */

/** True when a request was deliberately aborted, which should never surface as an error. */
export const isCancel = (error) =>
  axios.isCancel(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';

/**
 * Turns any axios failure into one sentence worth showing a user.
 * Server messages win; network and timeout cases get plain language.
 */
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  if (!error) return fallback;

  const data = error.response?.data;
  if (data?.message) return data.message;
  if (Array.isArray(data?.errors) && data.errors[0]?.message) return data.errors[0].message;

  if (error.code === 'ECONNABORTED') return 'That took too long. Check your connection and try again.';
  if (error.code === 'ERR_NETWORK' || !error.response) {
    return 'Cannot reach the server. Check your internet connection.';
  }
  if (error.response.status >= 500) return 'The server had a problem. Please try again in a moment.';

  return error.message || fallback;
};

export default api;
