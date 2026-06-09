/**
 * 云同步相关类型定义
 */

/** 同步状态 */
export interface SyncStatus {
  enabled: boolean;
  configured: boolean;
  server_url: string;
  device_id: string | null;
  last_sync: string | null;
  auto_sync: boolean;
  sync_interval: number;
  is_syncing: boolean;
}

/** 同步配置请求 */
export interface SyncConfigRequest {
  server_url: string;
  secret: string;
}

/** 同步操作结果 */
export interface SyncResult {
  success: boolean;
  message: string;
  last_sync?: string;
  balance?: number;
}

/** 设备信息 */
export interface DeviceInfo {
  device_id: string;
  hostname: string;
  system: string;
  release: string;
  machine: string;
  processor: string;
}
