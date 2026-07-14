import { useState, useEffect } from 'react';

/**
 * Delays updating a value until it stops changing for `delay` ms.
 * Use this for controlled inputs (reactive value debouncing).
 * For debouncing callback functions, use `debounce` from `@/lib/utils` instead.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
