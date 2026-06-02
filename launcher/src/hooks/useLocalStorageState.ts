import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ZodType } from "zod";

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  schema?: ZodType<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      if (!storedValue) {
        return initialValue;
      }

      const parsed: unknown = JSON.parse(storedValue);
      if (schema) {
        const result = schema.safeParse(parsed);
        return result.success ? result.data : initialValue;
      }

      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  const skipInitialWrite = useRef(true);

  useEffect(() => {
    if (skipInitialWrite.current) {
      skipInitialWrite.current = false;
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local storage can be unavailable in hardened environments.
    }
  }, [key, value]);

  return [value, setValue];
}
