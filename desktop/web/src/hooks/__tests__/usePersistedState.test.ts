import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from '../usePersistedState';

const storage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(storage).forEach(k => delete storage[k]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
  });
});

describe('usePersistedState', () => {
  it('无存储值时使用默认值', () => {
    const { result } = renderHook(() => usePersistedState('test-key', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('有存储值时恢复', () => {
    storage['test-key'] = JSON.stringify('stored');
    const { result } = renderHook(() => usePersistedState('test-key', 'default'));
    expect(result.current[0]).toBe('stored');
  });

  it('setValue 更新状态并持久化', () => {
    const { result } = renderHook(() => usePersistedState('test-key', 'init'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(storage['test-key']).toBe(JSON.stringify('updated'));
  });

  it('支持复杂对象', () => {
    const defaultObj = { a: 1, b: [2, 3] };
    const { result } = renderHook(() => usePersistedState('obj-key', defaultObj));
    expect(result.current[0]).toEqual(defaultObj);

    const newObj = { a: 99, b: [4, 5] };
    act(() => {
      result.current[1](newObj);
    });
    expect(result.current[0]).toEqual(newObj);
    expect(JSON.parse(storage['obj-key'])).toEqual(newObj);
  });

  it('存储值损坏时使用默认值', () => {
    storage['bad-key'] = 'not valid json {{{';
    const { result } = renderHook(() => usePersistedState('bad-key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});
