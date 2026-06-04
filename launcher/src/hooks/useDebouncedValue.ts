import { useEffect, useState } from "react";

/**
 * Returns a value that only updates after `delayMs` of stable input.
 * Useful for search inputs that drive expensive filtering or API calls.
 *
 * The trailing value is committed only when the input stops changing for
 * `delayMs` milliseconds. Cancelling the effect cleans up the pending timer.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return undefined;
    }

    const handle = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [value, delayMs]);

  return debounced;
}
