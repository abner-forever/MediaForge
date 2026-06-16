/**
 * 通用 SSE 流式读取器。
 * 从 ReadableStream 中解析 `data: {...}` 格式的 Server-Sent Events。
 */
export async function readSSEStream<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
  options?: {
    /** 流结束时是否处理 buffer 中剩余的数据（默认 true） */
    flushBuffer?: boolean;
  },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flushBuffer = options?.flushBuffer ?? true;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (flushBuffer && buffer) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {
            /* ignore */
          }
        }
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 从 URL 建立 SSE 连接（GET 请求）。
 */
export async function sseGet<T = unknown>(
  url: string,
  onEvent: (event: T) => void,
  options?: { signal?: AbortSignal; flushBuffer?: boolean },
): Promise<void> {
  const res = await fetch(url, { signal: options?.signal });
  await readSSEStream<T>(res.body!, onEvent, { flushBuffer: options?.flushBuffer });
}

/**
 * 从 URL 建立 SSE 连接（POST 请求），支持返回最终结果。
 */
export async function ssePost<T = unknown, R = void>(
  url: string,
  body: unknown,
  onEvent: (event: T) => void,
  options?: {
    signal?: AbortSignal;
    /** 从事件中提取最终结果，返回非 null 值时作为 Promise 结果 */
    extractResult?: (event: T) => R | null;
  },
): Promise<R> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: R | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6)) as T;
        onEvent(evt);
        if (options?.extractResult) {
          const r = options.extractResult(evt);
          if (r !== null) result = r;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
      }
    }
  }

  if (options?.extractResult && result === null) {
    throw new Error('SSE stream ended without producing a result');
  }
  return result as R;
}
