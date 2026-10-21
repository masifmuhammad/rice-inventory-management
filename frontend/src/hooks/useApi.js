import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTH_EXPIRED_EVENT, getErrorMessage, isCancel } from '../services/api';
import { useAuth } from '../context/AuthContext';

const cache = new Map();
const CACHE_LIMIT = 100;
let cacheVersion = 0;
export const clearApiCache = () => { cache.clear(); cacheVersion += 1; };

if (typeof window !== 'undefined') {
  window.addEventListener('rim:business-changed', clearApiCache);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearApiCache);
  window.addEventListener('storage', (event) => {
    if (event.key === 'rim.token') clearApiCache();
  });
}

export default function useApi(fetcher, deps = [], options = {}) {
  const { immediate = true, keepPreviousData = false, cacheKey, onSuccess, onError } = options;
  const { user, businessId } = useAuth();
  const scope = JSON.stringify([user?.id || user?._id, businessId]);
  const depsKey = JSON.stringify(deps);
  const entryKey = cacheKey ? JSON.stringify([scope, cacheKey, depsKey]) : null;
  const cached = entryKey ? cache.get(entryKey) : undefined;
  const [state, setState] = useState(() => ({ scope, data: cached ?? null, error: null, loading: immediate && cached === undefined }));
  const fetcherRef = useRef(fetcher);
  const successRef = useRef(onSuccess);
  const errorRef = useRef(onError);
  fetcherRef.current = fetcher;
  successRef.current = onSuccess;
  errorRef.current = onError;
  const controllerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, []);

  const execute = useCallback(async (runtime = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const version = cacheVersion;
    const preserve = runtime.keepPreviousData ?? keepPreviousData;
    setState((current) => ({ scope, error: null, loading: true,
      data: current.scope === scope && preserve ? current.data : (entryKey ? cache.get(entryKey) : null) ?? null }));
    try {
      const result = await fetcherRef.current(controller.signal);
      if (!mountedRef.current || controller.signal.aborted || version !== cacheVersion) return;
      setState({ scope, data: result, error: null, loading: false });
      if (entryKey) {
        cache.delete(entryKey);
        cache.set(entryKey, result);
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      }
      successRef.current?.(result);
      return result;
    } catch (err) {
      if (isCancel(err) || !mountedRef.current || controller.signal.aborted || version !== cacheVersion) return;
      setState((current) => ({ scope, data: current.scope === scope ? current.data : null,
        error: getErrorMessage(err), loading: false }));
      errorRef.current?.(err);
    }
  // depsKey also re-fetches queries that do not opt into caching.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, depsKey, entryKey, keepPreviousData]);

  useEffect(() => {
    if (immediate) execute();
    return () => controllerRef.current?.abort();
  }, [execute, immediate]);

  useEffect(() => {
    if (!immediate) return undefined;
    const refresh = () => execute({ keepPreviousData: true });
    window.addEventListener('rim:refresh', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.removeEventListener('rim:refresh', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [execute, immediate]);

  const setData = useCallback((next) => {
    setState((current) => {
      const data = typeof next === 'function' ? next(current.scope === scope ? current.data : null) : next;
      if (entryKey) cache.set(entryKey, data);
      return { ...current, scope, data };
    });
  }, [scope, entryKey]);

  // Hide another tenant's response during render, before effects have run.
  const visible = state.scope === scope ? state : { data: cached ?? null, error: null, loading: immediate };
  return { ...visible, refetch: execute, setData };
}
