/* ── 积分系统 API ──────────────────────────── */

import { get, post } from './base';
import type { CreditsInfo, CheckinResult, CreditsHistory, CheckinHistory } from '../types';

export const creditsApi = {
  /** 查询积分余额和签到状态 */
  get: () => get<CreditsInfo>('/api/credits'),

  /** 每日签到 */
  checkin: () => post<CheckinResult>('/api/credits/checkin'),

  /** 获取积分流水 */
  history: (page = 1, pageSize = 20) =>
    get<CreditsHistory>(`/api/credits/history?page=${page}&page_size=${pageSize}`),

  /** 获取指定月份的签到历史 */
  checkinHistory: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.append('year', String(year));
    if (month) params.append('month', String(month));
    return get<CheckinHistory>(`/api/credits/checkin-history?${params.toString()}`);
  },
};
