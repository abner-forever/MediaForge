import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request, toUserError, get, post, put, del } from '../base';

describe('toUserError', () => {
  it('空消息返回默认文案', () => {
    expect(toUserError('')).toBe('请求失败');
  });

  it('微博 Cookie 失效', () => {
    expect(toUserError('weibo_cookie expired')).toBe('微博登录已失效，请到设置页重新扫码登录。');
    expect(toUserError('Cookie 无效')).toBe('微博登录已失效，请到设置页重新扫码登录。');
  });

  it('API Key 未配置', () => {
    expect(toUserError('未配置 api_key')).toBe(
      '当前未配置大模型 API Key，请先在设置页配置大模型服务。',
    );
  });

  it('API Key 不可用', () => {
    expect(toUserError('api_key invalid')).toBe('当前 AI 服务 API Key 不可用，请检查密钥配置。');
    expect(toUserError('401 unauthorized')).toBe('当前 AI 服务 API Key 不可用，请检查密钥配置。');
  });

  it('公众号未登录', () => {
    expect(toUserError('公众号未登录')).toBe('公众号账号未登录，请先到设置页完成扫码登录。');
  });

  it('AI 服务超时', () => {
    expect(toUserError('AI 服务调用失败')).toBe(
      'AI 服务响应超时，请检查网络连接或到设置页增大 AI 超时时间后重试。',
    );
    expect(toUserError('read timed out')).toBe(
      'AI 服务响应超时，请检查网络连接或到设置页增大 AI 超时时间后重试。',
    );
  });

  it('Playwright 错误', () => {
    expect(toUserError('playwright locator error')).toBe(
      '微信后台页面结构可能已更新，请重试；若仍失败请保留日志排查。',
    );
  });

  it('超时', () => {
    expect(toUserError('connection timeout')).toBe('请求超时，请稍后重试。');
  });

  it('未知消息原样返回', () => {
    expect(toUserError('some random error')).toBe('some random error');
  });
});

describe('request', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('成功请求返回 JSON', async () => {
    const mockData = { ok: true };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );
    const result = await request<{ ok: boolean }>('GET', '/api/test');
    expect(result).toEqual(mockData);
  });

  it('失败请求抛出用户友好错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'api_key missing' }), { status: 400 }),
    );
    await expect(request('GET', '/api/test')).rejects.toThrow('API Key');
  });

  it('发送 body 时序列化为 JSON', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await request('POST', '/api/test', { foo: 'bar' });
    expect(spy).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      }),
    );
  });
});

describe('HTTP 方法快捷函数', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('get 发送 GET 请求', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await get('/api/test');
    expect(spy).toHaveBeenCalledWith('/api/test', expect.objectContaining({ method: 'GET' }));
  });

  it('post 发送 POST 请求', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await post('/api/test', { a: 1 });
    expect(spy).toHaveBeenCalledWith('/api/test', expect.objectContaining({ method: 'POST' }));
  });

  it('put 发送 PUT 请求', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await put('/api/test', { a: 1 });
    expect(spy).toHaveBeenCalledWith('/api/test', expect.objectContaining({ method: 'PUT' }));
  });

  it('del 发送 DELETE 请求', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await del('/api/test');
    expect(spy).toHaveBeenCalledWith('/api/test', expect.objectContaining({ method: 'DELETE' }));
  });
});
