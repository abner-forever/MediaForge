import { useState } from 'react';
import type { SettingsData, WeiboLoginEvent } from '../../api/client';
import Select from '../../components/Select';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';
import { settingsApi } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function WeiboSection({ data, save, onReload }: { data: SettingsData; save: (u: Record<string, string>) => void; onReload?: () => Promise<void> }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [cookie, setCookie] = useState(data.weibo_cookie || '');
  const [uid, setUid] = useState(data.weibo_uid);
  const [screenName, setScreenName] = useState(data.weibo_screen_name || '');
  const [avatar, setAvatar] = useState(data.weibo_avatar || '');
  const [fetchMode, setFetchMode] = useState(data.weibo_fetch_mode);
  const [celebs, setCelebs] = useState(data.weibo_celebrities);
  const [tags, setTags] = useState(data.weibo_search_tags);
  const [sceneTags, setSceneTags] = useState(data.weibo_scene_extra_tags);
  const [superTopics, setSuperTopics] = useState(data.weibo_super_topics);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loginMessage, setLoginMessage] = useState('');
  const [cookieRevealed, setCookieRevealed] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const { addToast } = useStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const rawCookie = cookie || data.weibo_cookie || '';

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
      setVerifyMessage('请先填写或登录获取微博 Cookie');
      return;
    }
    setVerifyState('verifying');
    setVerifyMessage('');
    try {
      const result = await settingsApi.verifyWeibo(cookie || data.weibo_cookie || undefined);
      if (result.valid) {
        setVerifyState('valid');
        setVerifyMessage(`账号：${result.screen_name || ''}（${result.uid || ''}）`);
        if (result.screen_name) setScreenName(result.screen_name);
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

  async function handleWeiboLogin() {
    setLoginState('loading');
    setLoginMessage('正在启动浏览器...');
    try {
      await settingsApi.weiboLogin((evt: WeiboLoginEvent) => {
        if (evt.type === 'progress') {
          setLoginMessage(evt.message || '');
        } else if (evt.type === 'done') {
          // 一次性设置所有状态，确保状态一致性
          const newCookie = evt.cookie || '';
          const newUid = evt.uid || '';
          const newScreenName = evt.screen_name || '';
          const newAvatar = evt.avatar || '';
          setCookie(newCookie);
          setUid(newUid);
          setScreenName(newScreenName);
          setAvatar(newAvatar);
          setLoginState('idle');
          setLoginMessage('登录成功，Cookie 已自动填入');
          addToast('微博登录成功，请点击保存', 'success');
        } else if (evt.type === 'error') {
          setLoginState('error');
          setLoginMessage(evt.message || '登录失败');
          addToast(evt.message || '微博登录失败', 'error');
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
        <div className="section-header">微博配置</div>
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
            <button className="btn btn-sm" onClick={handleWeiboLogin} disabled={loginState === 'loading'}>
              {loginState === 'loading' ? '登录中...' : '微博快速登录'}
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
            <span>微博 Cookie</span>
            <div className="flex items-center gap-1">
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-lg hover:bg-bg-secondary transition-colors" onClick={() => setCookieRevealed(!cookieRevealed)}>
                {cookieRevealed ? '隐藏' : '显示'}
              </button>
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-lg hover:bg-bg-secondary transition-colors" onClick={handleCopyCookie}>
                复制
              </button>
            </div>
          </div>
          <textarea value={cookieRevealed ? rawCookie : maskCookie('')} onChange={e => { setCookie(e.target.value); setCookieRevealed(true); }} placeholder={data.weibo_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} className="font-mono text-xs" readOnly={!cookieRevealed && !cookie} />
        </label>
        <label>微博 UID<input type="text" value={uid} onChange={e => setUid(e.target.value)} placeholder="留空自动推断" /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '本人时间线', value: 'own' }, { label: '明星列表', value: 'celebrities' }, { label: '混合模式', value: 'mixed' }, { label: '超话抓取', value: 'super_topic' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label>明星列表<input type="text" value={celebs} onChange={e => setCelebs(e.target.value)} placeholder="迪丽热巴,杨幂（逗号分隔）" /></label>
        <label>搜索标签<input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="写真,街拍（逗号分隔）" /></label>
        <label>超话列表<input type="text" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="迪丽热巴超话,杨幂超话（逗号分隔）" /></label>
        <label>场景标签<input type="text" value={sceneTags} onChange={e => setSceneTags(e.target.value)} placeholder="例如：写真,街拍" /></label>
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
              <p className="text-xs mt-1 opacity-80 leading-relaxed">{verifyMessage || '请先通过微博快速登录获取 Cookie，或手动填写'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { WEIBO_COOKIE: rawCookie, WEIBO_UID: uid, WEIBO_SCREEN_NAME: screenName, WEIBO_AVATAR: avatar, WEIBO_FETCH_MODE: fetchMode, WEIBO_CELEBRITIES: celebs, WEIBO_SEARCH_TAGS: tags, WEIBO_SCENE_EXTRA_TAGS: sceneTags, WEIBO_SUPER_TOPICS: superTopics }; await save(u); })} disabled={saving || loginState === 'loading'}>
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存微博配置'}
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
        title="清空微博鉴权信息"
        message="确定清空微博鉴权信息（Cookie、UID）吗？"
        confirmText="清空"
        danger
        onConfirm={async () => {
          setShowClearConfirm(false);
          try {
            await settingsApi.clearWeibo();
            setCookie('');
            setUid('');
            setScreenName('');
            setAvatar('');
            setVerifyState('idle');
            setVerifyMessage('');
            addToast('微博鉴权信息已清空', 'success');
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
