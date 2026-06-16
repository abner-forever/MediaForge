import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApi } from '../useApi';

describe('useApi', () => {
  it('初始状态', () => {
    const { result } = renderHook(() => useApi(() => Promise.resolve('data')));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('execute 成功时设置 data', async () => {
    const fn = vi.fn().mockResolvedValue({ name: 'test' });
    const { result } = renderHook(() => useApi(fn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toEqual({ name: 'test' });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('execute 失败时设置 error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('网络错误'));
    const { result } = renderHook(() => useApi(fn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('网络错误');
    expect(result.current.loading).toBe(false);
  });

  it('execute 期间 loading 为 true', async () => {
    let resolve: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    const fn = () => promise;
    const { result } = renderHook(() => useApi(fn));

    act(() => {
      result.current.execute();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve!('ok');
    });
    expect(result.current.loading).toBe(false);
  });

  it('reset 重置所有状态', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useApi(fn));

    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.data).toBe('data');

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('execute 返回函数结果', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const { result } = renderHook(() => useApi(fn));

    let value: any;
    await act(async () => {
      value = await result.current.execute();
    });
    expect(value).toBe(42);
  });

  it('execute 失败时返回 undefined', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useApi(fn));

    let value: any;
    await act(async () => {
      value = await result.current.execute();
    });
    expect(value).toBeUndefined();
  });
});
