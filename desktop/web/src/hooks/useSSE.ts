import { useState, useCallback, useRef, useEffect } from 'react';
import { readSSEStream } from '../api/sse';

/**
 * SSE 流消费 hook，含 AbortController 生命周期管理。
 */
export function useSSE<T>(
  url: string,
  options?: {
    autoStart?: boolean;
    onComplete?: (events: T[]) => void;
    onError?: (error: string) => void;
  },
) {
  const [events, setEvents] = useState<T[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setEvents([]);

    fetch(url, { signal: controller.signal })
      .then((res) =>
        readSSEStream<T>(res.body!, (evt) => {
          setEvents((prev) => [...prev, evt]);
        }),
      )
      .then(() => {
        if (!controller.signal.aborted) {
          setRunning(false);
          options?.onComplete?.([]);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setRunning(false);
          options?.onError?.(err.message || 'SSE 连接失败');
        }
      });
  }, [url, cancel, options]);

  useEffect(() => {
    if (options?.autoStart) start();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, start, cancel, running };
}
