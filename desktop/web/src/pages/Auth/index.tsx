/**
 * 认证页面（登录/注册/忘记密码）
 * 登录支持：密码登录 / 验证码登录
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userApi } from '@/api/client';
import { useStore } from '@/stores';
import Button from '@/components/ui/Button';
import EyeIcon from '@/components/ui/EyeIcon';
import type {
  LoginRequest,
  LoginWithCodeRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '@/types';

type Mode = 'login' | 'register' | 'resetPassword';

export default function Auth() {
  const navigate = useNavigate();
  const { login, isAuthenticated, addToast } = useStore();
  const [mode, setMode] = useState<Mode>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'code'>('password');
  const [error, setError] = useState<string | null>(null);

  // loading 状态
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 表单数据
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // 密码可见性
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 验证码倒计时
  const [codeCountdown, setCodeCountdown] = useState(0);

  // 已登录跳转
  useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // 验证码倒计时
  useEffect(() => {
    if (codeCountdown > 0) {
      const timer = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [codeCountdown]);

  // 发送验证码（通用）
  const handleSendCode = async () => {
    if (!email) {
      setError('请输入邮箱');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setSendingCode(true);
    setError(null);

    try {
      const result = await userApi.sendCode(email);
      if (result.success) {
        setCodeCountdown(60);
        addToast('验证码已发送到您的邮箱', 'success');
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  // 密码登录
  const handlePasswordLogin = async () => {
    if (!email || !password) {
      setError('请填写邮箱和密码');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const request: LoginRequest = { email, password };
      const result = await userApi.login(request);
      if (result.success) {
        login(result.data.user, result.data.token);
        addToast('登录成功', 'success');
        navigate('/');
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 验证码登录
  const handleCodeLogin = async () => {
    if (!email) {
      setError('请输入邮箱');
      return;
    }
    if (!verificationCode) {
      setError('请输入验证码');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const request: LoginWithCodeRequest = { email, verification_code: verificationCode };
      const result = await userApi.loginWithCode(request);
      if (result.success) {
        login(result.data.user, result.data.token);
        addToast('登录成功', 'success');
        navigate('/');
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '验证码登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    if (!email || !password || !confirmPassword || !nickname || !verificationCode) {
      setError('请填写所有必填字段');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (nickname.length < 1 || nickname.length > 20) {
      setError('昵称长度1-20位');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const request: RegisterRequest = {
        email,
        password,
        nickname,
        verification_code: verificationCode,
      };
      const result = await userApi.register(request);
      if (result.success) {
        login(result.data.user, result.data.token);
        addToast('注册成功', 'success');
        navigate('/');
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 重置密码
  const handleResetPassword = async () => {
    if (!email || !verificationCode || !password || !confirmPassword) {
      setError('请填写所有必填字段');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('新密码至少6位');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const request: ResetPasswordRequest = {
        email,
        verification_code: verificationCode,
        new_password: password,
      };
      const result = await userApi.resetPassword(request);
      if (result.success) {
        addToast('密码重置成功，请登录', 'success');
        switchMode('login');
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 提交
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      if (loginMethod === 'password') {
        handlePasswordLogin();
      } else {
        handleCodeLogin();
      }
    } else if (mode === 'register') {
      handleRegister();
    } else {
      handleResetPassword();
    }
  };

  // 切换模式时重置状态
  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setVerificationCode('');
    setCodeCountdown(0);
    if (newMode !== 'resetPassword') {
      setPassword('');
      setConfirmPassword('');
    }
  };

  // 页面标题
  const titles: Record<Mode, string> = {
    login: '登录您的账号',
    register: '创建新账号',
    resetPassword: '重置密码',
  };

  // 提交按钮文本
  const submitLabels: Record<Mode, string> = {
    login: '登录',
    register: '注册',
    resetPassword: '重置密码',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '48px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo 和标题 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 16px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(120, 104, 208, 0.3)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            图文工坊
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '8px 0 0' }}>
            {titles[mode]}
          </p>
        </div>

        {/* 表单卡片 */}
        <div className="card" style={{ padding: '28px 24px' }}>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            {/* 登录方式切换（仅登录模式） */}
            {mode === 'login' && (
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('password');
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    background: 'none',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    color: loginMethod === 'password' ? 'var(--accent)' : 'var(--text-muted)',
                    borderBottom:
                      loginMethod === 'password'
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  密码登录
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('code');
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    background: 'none',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    color: loginMethod === 'code' ? 'var(--accent)' : 'var(--text-muted)',
                    borderBottom:
                      loginMethod === 'code' ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  验证码登录
                </button>
              </div>
            )}

            {/* 邮箱 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                邮箱地址
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>

            {/* 昵称（仅注册） */}
            {mode === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  昵称
                </label>
                <input
                  type="text"
                  autoComplete="nickname"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="您的昵称"
                />
              </div>
            )}

            {/* 密码（密码登录 / 注册 / 重置密码中的新密码） */}
            {(mode !== 'login' || loginMethod === 'password') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {mode === 'resetPassword' ? '新密码' : '密码'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少6位"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 4,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>
              </div>
            )}

            {/* 确认密码（注册 / 重置密码） */}
            {(mode === 'register' || mode === 'resetPassword') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {mode === 'resetPassword' ? '确认新密码' : '确认密码'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 4,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <EyeIcon visible={showConfirmPassword} />
                  </button>
                </div>
              </div>
            )}

            {/* 验证码（验证码登录 / 注册 / 重置密码） */}
            {(mode === 'register' || mode === 'resetPassword' || loginMethod === 'code') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  邮箱验证码
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="6位验证码"
                    maxLength={6}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="primary"
                    onClick={handleSendCode}
                    disabled={sendingCode || codeCountdown > 0}
                    loading={sendingCode}
                    style={{ whiteSpace: 'nowrap', minWidth: 100 }}
                  >
                    {codeCountdown > 0 ? `${codeCountdown}秒` : '发送验证码'}
                  </Button>
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {error && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--danger)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                }}
              >
                {error}
              </div>
            )}

            {/* 提交按钮 */}
            <Button type="primary" htmlType="submit" block loading={submitting} size="lg">
              {submitLabels[mode]}
            </Button>

            {/* 底部链接 */}
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mode === 'login' && (
                <>
                  <button
                    type="button"
                    onClick={() => switchMode('resetPassword')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: 0,
                    }}
                  >
                    忘记密码？
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 0,
                    }}
                  >
                    没有账号？立即注册
                  </button>
                </>
              )}
              {mode === 'register' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0,
                  }}
                >
                  已有账号？立即登录
                </button>
              )}
              {mode === 'resetPassword' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0,
                  }}
                >
                  返回登录
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
