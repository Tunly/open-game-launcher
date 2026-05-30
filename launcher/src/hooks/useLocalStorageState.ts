import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? (JSON.parse(storedValue) as T) : initialValue;
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
