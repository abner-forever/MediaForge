import type { WeChatAccount } from './wechat';

export interface SettingsData {
  platform: string;
  ai_provider: string;
  ai_model: string;
  ai_base_url: string;
  ai_api_key_set: boolean;
  ai_api_key_masked: string;
  ai_api_keys: Record<string, string>;
  tavily_api_key_set: boolean;
  tavily_api_key_masked: string;
  weibo_cookie_set: boolean;
  weibo_cookie: string;
  weibo_uid: string;
  weibo_screen_name: string;
  weibo_avatar: string;
  weibo_fetch_mode: string;
  weibo_celebrities: string;
  weibo_search_tags: string;
  weibo_scene_extra_tags: string;
  weibo_super_topics: string;
  toutiao_cookie_set: boolean;
  toutiao_cookie: string;
  toutiao_uid: string;
  toutiao_screen_name: string;
  toutiao_avatar: string;
  toutiao_user_id: string;
  toutiao_fetch_mode: string;
  toutiao_search_tags: string;
  post_limit: number;
  weibo_pages: number;
  publish_interval: number;
  request_timeout: number;
  ai_timeout: number;
  retry_times: number;
  require_confirm: boolean;
  watermark_filter: boolean;
  watermark_strict_mode: boolean;
  min_clean_images: number;
  watermark_corner_ratio: number;
  watermark_bottom_ratio: number;
  allow_watermark_fallback: boolean;
  materials_path: string;
  download_dir: string;
  wechat_accounts: WeChatAccount[];
  sidebar_open: string;
  sidebar_width: string;
}

export interface PlatformMeta {
  id: string;
  name: string;
  auth_fields: string[];
  fetch_modes: Record<string, string>;
  default_fetch_mode: string;
  search_params_description: string;
}

export interface LogFileInfo {
  name: string;
  size: number;
  mtime: string;
}

export interface LogContentResponse {
  name: string;
  lines: string[];
  total: number;
}
