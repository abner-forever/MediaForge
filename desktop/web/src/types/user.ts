/**
 * 用户系统相关类型定义
 */

/** 用户资料 */
export interface UserProfile {
  user_id: string;
  email: string;
  nickname: string;
  avatar: string;
  created_at: string;
  last_login: string;
  is_active: boolean;
  is_verified: boolean;
  device_ids: string[];
  settings: Record<string, any>;
}

/** 登录响应 */
export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: UserProfile;
    token: string;
  };
}

/** 注册响应 */
export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: UserProfile;
    token: string;
  };
}

/** 发送验证码响应 */
export interface SendCodeResponse {
  success: boolean;
  message: string;
}

/** 用户状态 */
export interface UserState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

/** 登录请求 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** 验证码登录请求 */
export interface LoginWithCodeRequest {
  email: string;
  verification_code: string;
}

/** 注册请求 */
export interface RegisterRequest {
  email: string;
  password: string;
  nickname: string;
  verification_code: string;
}

/** 重置密码请求（忘记密码） */
export interface ResetPasswordRequest {
  email: string;
  verification_code: string;
  new_password: string;
}

/** 修改密码请求（已登录） */
export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}
