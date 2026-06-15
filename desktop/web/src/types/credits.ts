/* ── 积分系统类型定义 ──────────────────────────── */

export interface CheckinStatus {
  can_checkin: boolean;
  streak: number;
  today_earned: number;
}

export interface CreditsInfo {
  balance: number;
  checkin_status: CheckinStatus;
}

export interface CheckinResult {
  success: boolean;
  earned: number;
  streak: number;
  balance: number;
}

export interface CreditTransaction {
  id: string;
  type: 'earn' | 'spend';
  source: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export interface CreditsHistory {
  transactions: CreditTransaction[];
  total: number;
  page: number;
  page_size: number;
}

/** 单日签到记录 */
export interface CheckinRecord {
  earned: number;
  streak: number;
}

/** 月度签到历史 */
export interface CheckinHistory {
  year: number;
  month: number;
  records: Record<string, CheckinRecord>;
  total_days: number;
  checked_days: number;
  total_earned: number;
  current_streak: number;
  max_streak_in_month: number;
}

/* ── 任务/视频类型 ──────────────────────────── */

/** 可观看的视频元数据 */
export interface VideoTask {
  id: string;
  title: string;
  filename: string;
  duration_seconds: number;
  reward: number;
  description: string;
  thumbnail?: string;
}

/** 每日任务进度 */
export interface DailyTask {
  id: string;
  type: 'video' | 'checkin' | 'invite' | 'profile';
  label: string;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  reward: string;
  icon: string;
}

/** 观看视频领取结果 */
export interface WatchVideoResult {
  success: boolean;
  earned: number;
  daily_count: number;
  daily_limit: number;
  balance: number;
  message?: string;
}

/** 今日任务列表 */
export interface DailyTasksResult {
  tasks: DailyTask[];
  today_earned: number;
}

/** 视频列表结果 */
export interface VideoListResult {
  videos: VideoTask[];
}
