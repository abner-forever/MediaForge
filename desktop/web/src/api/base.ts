/* ── API 基础工具 ─────────────────────────────── */

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(toUserError(err.detail || err.message || res.statusText));
  }
  return res.json();
}

export function toUserError(message: string): string {
  const text = String(message || '');
  const low = text.toLowerCase();
  if (low.includes('weibo_cookie') || text.includes('Cookie 无效')) return '微博登录已失效，请到设置页重新扫码登录。';
  if (low.includes('base url') || low.includes('base_url')) return '当前 AI 服务需要配置 Base URL，请到设置页补全后重试。';
  if (low.includes('未配置') && (low.includes('api_key') || low.includes('api key'))) return '当前未配置大模型 API Key，请先在设置页配置大模型服务。';
  if (low.includes('api_key') || low.includes('api key') || low.includes('401')) return '当前 AI 服务 API Key 不可用，请检查密钥配置。';
  if (text.includes('公众号未登录') || low.includes('mp.weixin') || low.includes('login')) return '公众号账号未登录，请先到设置页完成扫码登录。';
  if (low.includes('ai 服务调用失败') || low.includes('ai 调用失败') || low.includes('read timed out')) return 'AI 服务响应超时，请检查网络连接或到设置页增大 AI 超时时间后重试。';
  if (low.includes('playwright') || low.includes('locator') || low.includes('iframe')) return '微信后台页面结构可能已更新，请重试；若仍失败请保留日志排查。';
  if (low.includes('timeout')) return '请求超时，请稍后重试。';
  return text || '请求失败';
}

export const get = <T>(p: string) => request<T>('GET', p);
export const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b);
export const put = <T>(p: string, b?: unknown) => request<T>('PUT', p, b);
export const del = <T>(p: string, b?: unknown) => request<T>('DELETE', p, b);
