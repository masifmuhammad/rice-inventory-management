import { useEffect, useState } from 'react';

/**
 * Delays a rapidly changing value. Typing in a search box should cost one
 * request when you stop typing, not one per keystroke.
 */
export default function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
