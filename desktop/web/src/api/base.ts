/* ── API 基础工具 ─────────────────────────────── */

const REQUEST_TIMEOUT = 15000; // 15 秒超时

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // 自动添加 Authorization header
  const token = localStorage.getItem('auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  // 使用 AbortController 实现超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  opts.signal = controller.signal;

  let res: Response;
  try {
    res = await fetch(path, opts);
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('请求超时，请检查后端服务是否正常运行');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // 如果返回 401，清除 token 并跳转到登录页
  // 但登录/注册/发验证码接口的 401 是业务错误（密码错误等），不应触发登出
  if (res.status === 401) {
    const isAuthEndpoint = path === '/api/user/login' || path === '/api/user/register' || path === '/api/user/send-code';
    if (!isAuthEndpoint) {
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      throw new Error('认证已过期，请重新登录');
    }
  }

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
