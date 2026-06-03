export interface HealthStatus {
  platform: string;
  platform_name: string;
  platform_auth: boolean;
  weibo_cookie: boolean;
  weibo_uid_or_celebrities: boolean;
  ai_api_key: boolean;
  ai_base_url: boolean;
}

export interface DashboardStats {
  local_images: number;
  queue_size: number;
  selected_count: number;
  discovery_count: number;
}

export interface RunInfo {
  run_id: string;
  status: string;
  processed: number;
  failed: number;
  payload: Record<string, unknown>;
  prompt_tokens?: number;
  completion_tokens?: number;
  started_at?: string;
  title?: string;
  elapsed_seconds?: number;
  total_posts?: number;
  published?: number;
}

export interface OperationItem {
  id: string;
  time: string;
  action: string;
  detail: string;
}

export interface OperationsResponse {
  items: OperationItem[];
  total: number;
  page: number;
  page_size: number;
}
