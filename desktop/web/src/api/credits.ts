/* ── 积分系统 API ──────────────────────────── */

import { get, post } from './base';
import type {
  CreditsInfo, CheckinResult, CreditsHistory, CheckinHistory,
  WatchVideoResult, DailyTasksResult, VideoListResult,
} from '../types';

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

  // ── 看视频赚积分 ──────────────────────────────

  /** 观看视频领取积分 */
  watchVideo: (videoId: string, watchDuration: number) =>
    post<WatchVideoResult>('/api/credits/watch-video', { video_id: videoId, watch_duration: watchDuration }),

  /** 获取今日任务列表 */
  getTasks: () => get<DailyTasksResult>('/api/credits/tasks'),

  /** 获取可观看视频列表 */
  getVideoList: () => get<VideoListResult>('/api/videos/list'),
};
