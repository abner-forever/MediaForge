import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoading } from '../useLoading';

describe('useLoading', () => {
  it('初始状态 loading 为 false', () => {
    const { result } = renderHook(() => useLoading());
    expect(result.current.loading).toBe(false);
  });

  it('withLoading 执行时设置 loading 为 true，完成后恢复', async () => {
    const { result } = renderHook(() => useLoading());
    let resolve: (v: string) => void;
    const promise = new Promise<string>((r) => { resolve = r; });

    act(() => {
      result.current.withLoading(() => promise);
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve!('done');
      await promise;
    });
    expect(result.current.loading).toBe(false);
  });

  it('withLoading 返回函数结果', async () => {
    const { result } = renderHook(() => useLoading());
    const fn = vi.fn().mockResolvedValue(42);

    let value: number | undefined;
    await act(async () => {
      value = await result.current.withLoading(fn);
    });
    expect(value).toBe(42);
  });

  it('withLoading 函数抛异常时 loading 恢复', async () => {
    const { result } = renderHook(() => useLoading());
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await act(async () => {
      try {
        await result.current.withLoading(fn);
      } catch {
        // expected
      }
    });
    expect(result.current.loading).toBe(false);
  });

  it('防重复调用：loading 中再次调用直接返回 undefined', async () => {
    const { result } = renderHook(() => useLoading());
    const fn1 = vi.fn().mockResolvedValue('first');
    const fn2 = vi.fn().mockResolvedValue('second');

    let promise1: Promise<any>;
    act(() => {
      promise1 = result.current.withLoading(fn1);
    });

    let value2: any;
    await act(async () => {
      value2 = await result.current.withLoading(fn2);
    });

    expect(fn2).not.toHaveBeenCalled();
    expect(value2).toBeUndefined();

    await act(async () => {
      await promise1;
    });
  });
});
