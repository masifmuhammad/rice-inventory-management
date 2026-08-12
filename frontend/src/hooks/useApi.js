import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage, isCancel } from '../services/api';

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
export default function useApi(fetcher, deps = [], options = {}) {
  const { immediate = true, keepPreviousData = false, onSuccess, onError } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);

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
      if (!preserve) setData(null);

      try {
        const result = await fetcherRef.current(controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        setData(result);
        setLoading(false);
        successRef.current?.(result);
        return result;
      } catch (err) {
        if (isCancel(err) || !mountedRef.current || controller.signal.aborted) return;

        setError(getErrorMessage(err));
        setLoading(false);
        errorRef.current?.(err);
      }
    },
    [keepPreviousData]
  );

  useEffect(() => {
    if (!immediate) return;
    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, immediate, ...deps]);

  // Soft business switch: refetch without blanking so NumberFlow can roll digits.
  useEffect(() => {
    const onBusinessChanged = () => {
      execute({ keepPreviousData: true });
    };
    window.addEventListener('rim:business-changed', onBusinessChanged);
    return () => window.removeEventListener('rim:business-changed', onBusinessChanged);
  }, [execute]);

  return { data, error, loading, refetch: execute, setData };
}
