/**
 * Sentry 错误监控配置
 * 接入文档：https://docs.sentry.io/platforms/javascript/guides/react/
 */

import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** 脱敏邮箱：abc@example.com → a***@example.com */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const masked = name.charAt(0) + '***';
  return `${masked}@${domain}`;
}

/** 生成或读取持久化的设备指纹 */
function getDeviceFingerprint(): string {
  const key = 'sentry_device_fp';
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

/**
 * 初始化 Sentry
 * - 仅在 production 模式或显式开启 DEBUG_SENTRY 时启用
 * - web – 开发时通过 cookie 手动标记版本避免污染
 * - desktop/PyWebView 构建 – 内置 __APP_VERSION__
 */
export function initSentry() {
  if (!SENTRY_DSN) return;

  const isEnabled =
    import.meta.env.PROD || import.meta.env.VITE_SENTRY_DEBUG === '1';

  if (!isEnabled) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    // 优先使用 VITE_SENTRY_ENV，否则自动判断
    // desktop:start 本地构建时传 VITE_SENTRY_ENV=development 来区分
    environment:
      (import.meta.env.VITE_SENTRY_ENV as string | undefined) ??
      (import.meta.env.PROD ? 'production' : 'development'),

    // 捕获未捕获的 Promise 异常
    integrations: [Sentry.browserTracingIntegration()],

    // beforeSend 在发送前对事件做最后处理
    beforeSend(event) {
      // 自动附上设备指纹（作为 tag 方便过滤）
      event.tags = { ...event.tags, device_fp: getDeviceFingerprint() };
      return event;
    },

    // 采样率
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // 忽略的错误模式（按需扩展）
    ignoreErrors: [
      // 浏览器扩展注入的错误
      /topGLOB/i,
      /chrome-extension:/i,
      /moz-extension:/i,
      /safari-extension:/i,
      // ResizeObserver 循环 – 无害
      /ResizeObserver.*loop/i,
      // 网络中断等非前端 bug
      /NetworkError/i,
      /Failed to fetch/i,
      // 微信浏览器常见噪声
      /WeChatJSBridge/i,
    ],
  });

  // 初始附上设备指纹作为用户上下文的一部分
  Sentry.setTag('device_fp', getDeviceFingerprint());
}

/**
 * 设置登录用户上下文 — 每次用户登录/信息变更时调用
 * - 邮箱会脱敏后上报
 * - user_id 作为 Sentry User ID（关联事件到用户）
 * - device_ids 作为额外 tag
 */
export function setSentryUser(
  user: { user_id: string; email?: string; nickname?: string; device_ids?: string[] } | null,
) {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  // Sentry 的 User 上下文 — user_id 用于跨事件聚合
  Sentry.setUser({
    id: user.user_id,
    email: user.email ? maskEmail(user.email) : undefined,
    username: user.nickname,
  });

  // 额外用 tag 记录设备 ID 列表
  if (user.device_ids?.length) {
    Sentry.setTag('device_ids', user.device_ids.join(','));
  }
}

export default Sentry;
