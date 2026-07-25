import { useEffect, useRef, useState } from 'react';
import { apiErrorToMessage } from '@/utils/errors';

interface UseAsyncQueryOptions<T> {
  enabled?: boolean;
  refreshIntervalMs?: number;
  initialData?: T | null;
  keepPreviousData?: boolean;
}

export function useAsyncQuery<T>(loader: () => Promise<T>, options: UseAsyncQueryOptions<T> = {}) {
  const { enabled = true, refreshIntervalMs, initialData = null, keepPreviousData = true } = options;
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const next = await loader();
        if (cancelled || !mountedRef.current) return;
        setData(next);
        setError(null);
      } catch (queryError) {
        if (cancelled || !mountedRef.current) return;
        setError(apiErrorToMessage(queryError));
        if (!keepPreviousData) setData(initialData);
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    void load();
    const timer = refreshIntervalMs ? window.setInterval(() => void load(), refreshIntervalMs) : undefined;

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [enabled, keepPreviousData, initialData, loader, refreshIntervalMs]);

  return {
    data,
    error,
    isLoading,
    refetch: async () => {
      setIsLoading(true);
      try {
        const next = await loader();
        setData(next);
        setError(null);
        return next;
      } catch (queryError) {
        const message = apiErrorToMessage(queryError);
        setError(message);
        throw queryError;
      } finally {
        setIsLoading(false);
      }
    },
    setData,
  };
}

