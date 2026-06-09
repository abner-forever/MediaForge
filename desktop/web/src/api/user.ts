/**
 * 用户系统 API
 */

import { get, post, put } from './base'
import type {
  LoginRequest,
  LoginResponse,
  LoginWithCodeRequest,
  RegisterRequest,
  RegisterResponse,
  SendCodeResponse,
  UserProfile,
  ResetPasswordRequest,
  ChangePasswordRequest
} from '../types'

export const userApi = {
  /** 发送验证码 */
  sendCode: (email: string) =>
    post<SendCodeResponse>('/api/user/send-code', { email }),

  /** 用户注册 */
  register: (data: RegisterRequest) =>
    post<RegisterResponse>('/api/user/register', data),

  /** 用户登录 */
  login: (data: LoginRequest) =>
    post<LoginResponse>('/api/user/login', data),

  /** 验证码登录 */
  loginWithCode: (data: LoginWithCodeRequest) =>
    post<LoginResponse>('/api/user/login-with-code', data),

  /** 获取当前用户信息 */
  getCurrentUser: () =>
    get<{ success: boolean; data: UserProfile }>('/api/user/current'),

  /** 获取用户资料 */
  getProfile: () =>
    get<{ success: boolean; data: UserProfile }>('/api/user/profile'),

  /** 更新用户资料 */
  updateProfile: (data: { nickname?: string; avatar?: string }) =>
    put<{ success: boolean; message: string }>('/api/user/profile', data),

  /** 获取用户设置 */
  getSettings: () =>
    get<{ success: boolean; data: Record<string, any> }>('/api/user/settings'),

  /** 更新用户设置 */
  updateSettings: (settings: Record<string, any>) =>
    put<{ success: boolean; message: string }>('/api/user/settings', { settings }),

  /** 获取绑定设备列表 */
  getDevices: () =>
    get<{ success: boolean; data: string[] }>('/api/user/devices'),

  /** 绑定设备 */
  bindDevice: (device_id?: string) =>
    post<{ success: boolean; message: string }>('/api/user/bind-device', { device_id }),

  /** 解绑设备 */
  unbindDevice: (device_id?: string) =>
    post<{ success: boolean; message: string }>('/api/user/unbind-device', { device_id }),

  /** 检查认证状态 */
  checkAuth: () =>
    get<{ success: boolean; authenticated: boolean; user_id: string; email: string; nickname: string }>('/api/user/check-auth'),

  /** 重置密码（忘记密码） */
  resetPassword: (data: ResetPasswordRequest) =>
    post<{ success: boolean; message: string }>('/api/user/reset-password', data),

  /** 修改密码（已登录） */
  changePassword: (data: ChangePasswordRequest) =>
    post<{ success: boolean; message: string }>('/api/user/change-password', data),

  /** 获取本地保存的 token（PyWebView 重启后恢复登录） */
  getSavedToken: () =>
    get<{ success: boolean; token: string | null }>('/api/user/saved-token'),

  /** 退出登录（清除服务端保存的 token） */
  logout: () =>
    post<{ success: boolean }>('/api/user/logout'),
}
