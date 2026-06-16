/**
 * 用户状态 Slice
 */

import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { UserProfile } from '../types';
import { userApi } from '../api/client';
import { setSentryUser } from '../sentry';

export interface UserSlice {
  // 状态
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;

  // 操作
  setUser: (user: UserProfile | null) => void;
  setToken: (token: string | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  updateUserInfo: (updates: Partial<UserProfile>) => void;
}

export const createUserSlice: StateCreator<AppState, [], [], UserSlice> = (set, get) => ({
  // 初始状态
  isAuthenticated: false,
  user: null,
  token: null,

  // 设置用户
  setUser: (user) => {
    set({ user });
  },

  // 设置Token
  setToken: (token) => {
    set({ token });
    // 持久化到 localStorage
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  },

  // 设置认证状态
  setAuthenticated: (isAuthenticated) => {
    set({ isAuthenticated });
  },

  // 登录
  login: (user, token) => {
    set({
      isAuthenticated: true,
      user,
      token,
    });
    localStorage.setItem('auth_token', token);
    // 同步用户上下文到 Sentry
    setSentryUser(user);
  },

  // 登出
  logout: () => {
    set({
      isAuthenticated: false,
      user: null,
      token: null,
    });
    localStorage.removeItem('auth_token');
    // 清除后端持久化的 token（PyWebView 重启恢复用）
    userApi.logout().catch(() => {});
    // 清除 Sentry 用户上下文
    setSentryUser(null);
  },

  // 更新用户信息
  updateUserInfo: (updates) => {
    const { user } = get();
    if (user) {
      const updated = { ...user, ...updates };
      set({ user: updated });
      // 同步更新 Sentry 上下文
      setSentryUser(updated);
    }
  },
});
