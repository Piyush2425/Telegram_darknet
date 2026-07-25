import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after
 * the component stops changing it for `delayMs` milliseconds.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
