import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage, isCancel } from '../services/api';

/**
 * Data fetching with the three things every screen here needs: an abort signal so
 * superseded requests can't overwrite fresh data, an error string that is safe to
 * render, and a `refetch` for after a mutation.
 *
 * @param fetcher  (signal) => Promise<data>
 * @param deps     re-runs the fetcher when these change
 */
export default function useApi(fetcher, deps = [], options = {}) {
  const { immediate = true, keepPreviousData = false, onSuccess, onError } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);

  // Keep the latest callbacks in refs so a caller passing inline functions
  // doesn't retrigger the effect on every render.
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

  const execute = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    if (!keepPreviousData) setData(null);

    try {
      const result = await fetcherRef.current(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;

      setData(result);
      setLoading(false);
      successRef.current?.(result);
      return result;
    } catch (err) {
      // An aborted request was replaced by a newer one — not a failure.
      if (isCancel(err) || !mountedRef.current || controller.signal.aborted) return;

      setError(getErrorMessage(err));
      setLoading(false);
      errorRef.current?.(err);
    }
  }, [keepPreviousData]);

  useEffect(() => {
    if (!immediate) return;
    execute();
    // `deps` is the caller's dependency list; `execute` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, immediate, ...deps]);

  return { data, error, loading, refetch: execute, setData };
}
