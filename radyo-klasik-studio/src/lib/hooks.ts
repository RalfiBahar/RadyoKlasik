"use client";

import { useEffect, useState } from "react";

// Debounce a rapidly-changing value (e.g. a search box) before it triggers
// fetches.
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
