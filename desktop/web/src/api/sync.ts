/**
 * 云同步 API
 */

import { get, post } from './base'
import type { SyncStatus, SyncConfigRequest, SyncResult, DeviceInfo } from '../types'

export const syncApi = {
  /** 获取同步状态 */
  getStatus: () => get<SyncStatus>('/api/sync/status'),

  /** 配置同步 */
  configure: (data: SyncConfigRequest) => post<SyncResult>('/api/sync/configure', data),

  /** 禁用同步 */
  disable: () => post<SyncResult>('/api/sync/disable'),

  /** 测试连接 */
  testConnection: () => post<SyncResult>('/api/sync/test'),

  /** 手动同步 */
  manualSync: () => post<SyncResult>('/api/sync/manual'),

  /** 从云端加载 */
  loadFromCloud: () => post<SyncResult>('/api/sync/load'),

  /** 获取设备信息 */
  getDeviceInfo: () => get<DeviceInfo>('/api/sync/device-info'),
}
