import { useCallback, useRef, useState } from 'react';

export function useLoading() {
  const [loading, setLoading] = useState(false);
  const ref = useRef(false);

  const withLoading = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (ref.current) return;
    ref.current = true;
    setLoading(true);
    try {
      return await fn();
    } finally {
      ref.current = false;
      setLoading(false);
    }
  }, []);

  return { loading, withLoading };
}
