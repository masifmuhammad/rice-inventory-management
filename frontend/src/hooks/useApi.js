import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTH_EXPIRED_EVENT, getErrorMessage, isCancel } from '../services/api';

/**
 * Data fetching with the three things every screen here needs: an abort signal so
 * superseded requests can't overwrite fresh data, an error string that is safe to
 * render, and a `refetch` for after a mutation.
 *
 * Also re-runs when the active business changes so screens update without a
 * full page reload — previous data is kept so animated figures can scroll.
 *
 * @param fetcher  (signal) => Promise<data>
 * @param deps     re-runs the fetcher when these change
 */
/**
 * Last known response per query, so returning to a screen shows it immediately.
 *
 * Without this every route change refetched from nothing and painted a
 * skeleton — Home to Stock and back re-fetched the dashboard you had been
 * looking at seconds earlier. The data is shown straight away and revalidated
 * behind it, so the screen is only ever blank the first time you visit it.
 *
 * Module-level and deliberately not persisted: it must not outlive the tab, and
 * it is emptied whenever the session or the active business changes, because
 * stale rows belonging to another tenant is the one failure mode that matters
 * more than the speed does.
 */
const cache = new Map();

if (typeof window !== 'undefined') {
  const empty = () => cache.clear();
  window.addEventListener('rim:business-changed', empty);
  window.addEventListener(AUTH_EXPIRED_EVENT, empty);
  window.addEventListener('storage', (event) => {
    if (event.key === 'rim.token' && !event.newValue) empty();
  });
}

export const clearApiCache = () => cache.clear();

export default function useApi(fetcher, deps = [], options = {}) {
  const { immediate = true, keepPreviousData = false, cacheKey, onSuccess, onError } = options;

  // Serialised here too so the entry is per query *and* per parameter set.
  const entryKey = cacheKey ? `${cacheKey}::${JSON.stringify(deps)}` : null;
  const cached = entryKey ? cache.get(entryKey) : undefined;

  const [data, setData] = useState(cached ?? null);
  const [error, setError] = useState(null);
  // Cached data means there is something to look at, so this is a background
  // revalidation rather than a load — the screen should not flash a skeleton.
  const [loading, setLoading] = useState(immediate && cached === undefined);

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
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (runtime = {}) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const preserve =
        typeof runtime.keepPreviousData === 'boolean'
          ? runtime.keepPreviousData
          : keepPreviousData;

      setLoading(true);
      setError(null);
      // A cached query already has something worth looking at, so a
      // revalidation must never blank it back to a skeleton.
      if (!preserve && !entryKey) setData(null);

      try {
        const result = await fetcherRef.current(controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        setData(result);
        setLoading(false);
        if (entryKey) cache.set(entryKey, result);
        successRef.current?.(result);
        return result;
      } catch (err) {
        if (isCancel(err) || !mountedRef.current || controller.signal.aborted) return;

        // Preserved data belongs to the query that was *superseded*. After a
        // business switch that is the previous tenant's rows, and leaving them
        // on screen under an error banner shows one business's figures beneath
        // another business's name.
        if (preserve && !entryKey) setData(null);
        setError(getErrorMessage(err));
        setLoading(false);
        errorRef.current?.(err);
      }
    },
    [keepPreviousData, entryKey]
  );

  // Serialised rather than spread. A spread dependency array changes length if a
  // caller ever writes something like `[page, ...(filter ? [filter] : [])]`, and
  // React responds by warning and leaving the effect in an undefined state — the
  // hook simply stops refetching. A single string keeps the length fixed.
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (!immediate) return;
    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, immediate, depsKey]);

  // Soft business switch: refetch without blanking so NumberFlow can roll digits.
  useEffect(() => {
    const onBusinessChanged = () => {
      execute({ keepPreviousData: true });
    };
    window.addEventListener('rim:business-changed', onBusinessChanged);
    // Pull-to-refresh reuses the same path: every query mounted on the page
    // refetches without blanking, so the screen updates in place rather than
    // flashing back through its skeletons.
    window.addEventListener('rim:refresh', onBusinessChanged);
    return () => {
      window.removeEventListener('rim:business-changed', onBusinessChanged);
      window.removeEventListener('rim:refresh', onBusinessChanged);
    };
  }, [execute]);

  return { data, error, loading, refetch: execute, setData };
}
