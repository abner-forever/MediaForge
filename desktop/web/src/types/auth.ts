export interface WeiboLoginEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
  cookie?: string;
  uid?: string;
  screen_name?: string;
  avatar?: string;
}

export interface WeiboVerifyResult {
  valid: boolean;
  uid?: string;
  screen_name?: string;
  avatar?: string;
  message?: string;
}

export interface ToutiaoLoginEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
  cookie?: string;
  uid?: string;
  screen_name?: string;
  avatar?: string;
}

export interface ToutiaoVerifyResult {
  valid: boolean;
  uid?: string;
  screen_name?: string;
  avatar?: string;
  message?: string;
}
