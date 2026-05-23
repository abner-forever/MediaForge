import { useState } from 'react';
import type { SettingsData, ToutiaoLoginEvent } from '../../api/client';
import Select from '../../components/Select';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';
import { settingsApi } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function ToutiaoSection({ data, save, onReload }: { data: SettingsData; save: (u: Record<string, string>) => void; onReload?: () => Promise<void> }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [cookie, setCookie] = useState(data.toutiao_cookie || '');
  const [uid, setUid] = useState(data.toutiao_uid || '');
  const [screenName, setScreenName] = useState(data.toutiao_screen_name || '');
  const [avatar, setAvatar] = useState(data.toutiao_avatar || '');
  const [userId, setUserId] = useState(data.toutiao_user_id);
  const [fetchMode, setFetchMode] = useState(data.toutiao_fetch_mode);
  const [searchTags, setSearchTags] = useState(data.toutiao_search_tags);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loginMessage, setLoginMessage] = useState('');
  const [cookieRevealed, setCookieRevealed] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const { addToast } = useStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const rawCookie = cookie || data.toutiao_cookie || '';

  function maskCookie(val: string): string {
    if (!rawCookie) return '<未设置>';
    if (rawCookie.length <= 12) return rawCookie;
    return rawCookie.slice(0, 4) + '***' + rawCookie.slice(-4);
  }

  async function handleCopyCookie() {
    if (!rawCookie) { addToast('没有可复制的 Cookie', 'error'); return; }
    try {
      await navigator.clipboard.writeText(rawCookie);
      addToast('Cookie 已复制到剪贴板', 'success');
    } catch {
      addToast('复制失败', 'error');
    }
  }

  async function handleVerify() {
    if (!rawCookie) {
      setVerifyState('invalid');
      setVerifyMessage('请先填写或登录获取今日头条 Cookie');
      return;
    }
    setVerifyState('verifying');
    setVerifyMessage('');
    try {
      const result = await settingsApi.verifyToutiao(cookie || data.toutiao_cookie || undefined);
      if (result.valid) {
        setVerifyState('valid');
        if (result.screen_name) {
          setVerifyMessage(`账号：${result.screen_name}（${result.uid || ''}）`);
          setScreenName(result.screen_name);
        } else {
          setVerifyMessage('Cookie 有效');
        }
        if (result.uid) setUid(result.uid);
        if (result.avatar) setAvatar(result.avatar);
      } else {
        setVerifyState('invalid');
        setVerifyMessage(result.message || 'Cookie 无效');
      }
    } catch (err: any) {
      setVerifyState('invalid');
      setVerifyMessage(err.message || '验证失败');
    }
  }

  async function handleToutiaoLogin() {
    setLoginState('loading');
    setLoginMessage('正在启动浏览器...');
    try {
      await settingsApi.toutiaoLogin((evt: ToutiaoLoginEvent) => {
        if (evt.type === 'progress') {
          setLoginMessage(evt.message || '');
        } else if (evt.type === 'done') {
          if (evt.cookie) setCookie(evt.cookie);
          if (evt.uid) setUid(evt.uid);
          if (evt.screen_name) setScreenName(evt.screen_name);
          if (evt.avatar) setAvatar(evt.avatar);
          setLoginState('idle');
          setLoginMessage('登录成功，Cookie 已自动填入');
          addToast('今日头条登录成功，请点击保存', 'success');
        } else if (evt.type === 'error') {
          setLoginState('error');
          setLoginMessage(evt.message || '登录失败');
          addToast(evt.message || '今日头条登录失败', 'error');
        }
      });
    } catch (err: any) {
      setLoginState('error');
      setLoginMessage(err.message || '登录异常');
      addToast(err.message || '登录异常', 'error');
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="section-header">今日头条配置</div>
        <div className="flex items-center gap-2">
          {loginState === 'loading' && (
            <span className="text-xs text-text-muted flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {loginMessage}
            </span>
          )}
          {loginState === 'error' && (
            <span className="text-xs text-danger">{loginMessage}</span>
          )}
          {!rawCookie && (
            <button className="btn btn-sm" onClick={handleToutiaoLogin} disabled={loginState === 'loading'}>
              {loginState === 'loading' ? '登录中...' : '头条快速登录'}
            </button>
          )}
        </div>
      </div>

      {screenName && (
        <div className="bg-accent-soft/40 border border-accent/20 rounded-xl px-4 py-3 flex items-center gap-3">
          {avatar && !avatarError ? (
            <img src={avatar.startsWith('http') ? `/proxy?url=${encodeURIComponent(avatar)}` : avatar} alt={screenName}
              className="w-9 h-9 rounded-full shrink-0 object-cover border border-accent/20"
              onError={() => setAvatarError(true)} />
          ) : (
            <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
              {screenName.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{screenName}</p>
            <p className="text-xs text-text-muted">UID: {uid || '未知'}</p>
          </div>
          <div className="text-xs text-accent font-medium bg-accent/10 px-2 py-1 rounded-lg">已登录</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <span>头条 Cookie</span>
            <div className="flex items-center gap-1">
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-lg hover:bg-bg-secondary transition-colors" onClick={() => setCookieRevealed(!cookieRevealed)}>
                {cookieRevealed ? '隐藏' : '显示'}
              </button>
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-lg hover:bg-bg-secondary transition-colors" onClick={handleCopyCookie}>
                复制
              </button>
            </div>
          </div>
          <textarea value={cookieRevealed ? rawCookie : maskCookie('')} onChange={e => { setCookie(e.target.value); setCookieRevealed(true); }} placeholder={data.toutiao_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} className="font-mono text-xs" readOnly={!cookieRevealed && !cookie} />
        </label>
        <label>用户ID<input type="text" value={userId} onChange={e => setUserId(e.target.value)} placeholder="留空自动推断" /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '推荐流', value: 'feed' }, { label: '用户主页', value: 'user' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label className="col-span-2">搜索关键词<input type="text" value={searchTags} onChange={e => setSearchTags(e.target.value)} placeholder="时尚,明星,穿搭（逗号分隔）" /></label>
      </div>

      {(verifyMessage || (!rawCookie && verifyState === 'idle')) && (
        <div className={`relative overflow-hidden rounded-xl border-l-4 ${
          verifyState === 'valid' ? 'border-l-green-500 text-green-600 dark:text-green-400' :
          verifyState === 'invalid' || verifyMessage ? 'border-l-danger text-danger' :
          'border-l-warning text-amber-600 dark:text-amber-400'
        }`} style={{
          background: verifyState === 'valid'
            ? '#22c55e1a'
            : verifyState === 'invalid' || verifyMessage
              ? '#ef44441a'
              : '#f59e0b1a'
        }}>
          <div className="px-4 py-3 flex items-start gap-3">
            {verifyState === 'valid' ? (
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
            ) : verifyState === 'invalid' || (verifyMessage && !rawCookie) ? (
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            ) : (
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {verifyState === 'valid' ? '验证通过' :
                 verifyState === 'invalid' ? 'Cookie 无效或已过期' :
                 verifyMessage ? '配置提示' : 'Cookie 未配置'}
              </p>
              <p className="text-xs mt-1 opacity-80 leading-relaxed">{verifyMessage || '请先通过头条快速登录获取 Cookie，或手动填写'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { TOUTIAO_COOKIE: rawCookie, TOUTIAO_UID: uid, TOUTIAO_SCREEN_NAME: screenName, TOUTIAO_AVATAR: avatar, TOUTIAO_USER_ID: userId, TOUTIAO_FETCH_MODE: fetchMode, TOUTIAO_SEARCH_TAGS: searchTags }; await save(u); })} disabled={saving || loginState === 'loading'}>
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存头条配置'}
        </button>
        <button className="btn btn-sm" onClick={handleVerify} disabled={verifyState === 'verifying'}>
          {verifyState === 'verifying' ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin mr-1" /> 验证中</> : '测试连接'}
        </button>
        <button className="btn btn-sm btn-danger ml-auto" onClick={() => setShowClearConfirm(true)}>
          清空
        </button>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="清空头条鉴权信息"
        message="确定清空今日头条鉴权信息（Cookie、UID）吗？"
        confirmText="清空"
        danger
        onConfirm={async () => {
          setShowClearConfirm(false);
          try {
            await settingsApi.clearToutiao();
            setCookie('');
            setUid('');
            setScreenName('');
            setAvatar('');
            setVerifyState('idle');
            setVerifyMessage('');
            addToast('头条鉴权信息已清空', 'success');
            onReload?.();
          } catch (err: any) {
            addToast(err.message, 'error');
          }
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
