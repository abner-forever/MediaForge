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
