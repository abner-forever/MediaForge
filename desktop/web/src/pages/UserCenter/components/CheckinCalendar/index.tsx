/**
 * 签到日历组件
 * 显示月度签到日历、签到按钮、统计信息
 */

import { useMemo } from 'react';
import type { CheckinStatus, CheckinHistory } from '@/types';

/** 连续签到里程碑奖励 */
export const STREAK_MILESTONES = [
  { days: 7, bonus: 50, label: '周达成' },
  { days: 14, bonus: 100, label: '两周达人' },
  { days: 30, bonus: 300, label: '月度冠军' },
  { days: 60, bonus: 500, label: '签到达人' },
  { days: 100, bonus: 1000, label: '百日坚持' },
];

/** 获取指定月份的天数 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 获取指定月份第一天是星期几（0=周日，1=周一...） */
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface CheckinCalendarProps {
  checkinStatus: CheckinStatus;
  checkinLoading: boolean;
  justChecked: boolean;
  checkinHistory: CheckinHistory | null;
  historyLoading: boolean;
  calendarYear: number;
  calendarMonth: number;
  onCheckin: () => void;
  onMonthChange: (delta: number) => void;
  onBackToToday: () => void;
  onShowRules: () => void;
}

export default function CheckinCalendar({
  checkinStatus,
  checkinLoading,
  justChecked,
  checkinHistory,
  historyLoading,
  calendarYear,
  calendarMonth,
  onCheckin,
  onMonthChange,
  onBackToToday,
  onShowRules,
}: CheckinCalendarProps) {
  const now = new Date();

  // 计算日历数据
  const calendarDays = useMemo(() => {
    if (!checkinHistory) return [];
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
    const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
    const days: Array<{
      day: number;
      date: string;
      checked: boolean;
      earned: number;
      streak: number;
      isToday: boolean;
      isFuture: boolean;
    }> = [];

    // 填充前置空白
    for (let i = 0; i < firstDay; i++) {
      days.push({
        day: 0,
        date: '',
        checked: false,
        earned: 0,
        streak: 0,
        isToday: false,
        isFuture: false,
      });
    }

    // 填充日期
    const todayStr = formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(calendarYear, calendarMonth, d);
      const record = checkinHistory.records[dateStr];
      const isFuture = new Date(dateStr) > new Date(todayStr);
      days.push({
        day: d,
        date: dateStr,
        checked: !!record,
        earned: record?.earned || 0,
        streak: record?.streak || 0,
        isToday: dateStr === todayStr,
        isFuture,
      });
    }

    return days;
  }, [checkinHistory, calendarYear, calendarMonth]);

  // 计算下一个里程碑
  const nextMilestone = useMemo(() => {
    return STREAK_MILESTONES.find((m) => m.days > checkinStatus.streak);
  }, [checkinStatus.streak]);

  // 月份导航状态
  const currentMonthNum = now.getFullYear() * 12 + (now.getMonth() + 1);
  const thisMonthNum = calendarYear * 12 + calendarMonth;
  const canGoPrev = currentMonthNum - thisMonthNum < 5;
  const canGoNext = thisMonthNum < currentMonthNum;

  return (
    <div className="card p-5">
      <div className="section-header">签到日历</div>

      {/* 统计 + 月份导航 */}
      <div className="flex items-center justify-between mb-3">
        {checkinHistory && (
          <div className="flex gap-3 text-[11px] text-text-muted">
            <span>
              已签 <b className="text-accent">{checkinHistory.checked_days}</b> 天
            </span>
            <span>
              获得 <b className="text-success">{checkinHistory.total_earned}</b> 积分
            </span>
            <span>
              最长 <b className="text-warning">{checkinHistory.max_streak_in_month}</b> 天
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onMonthChange(-1)}
            disabled={!canGoPrev}
            className={`px-1.5 py-0.5 text-[11px] border rounded-md transition-colors bg-transparent ${canGoPrev ? 'text-text-muted border-border hover:border-accent/40 cursor-pointer' : 'text-text-muted/40 border-border/50 cursor-not-allowed opacity-50'}`}
          >
            ◀
          </button>
          <span className="text-xs font-medium text-text min-w-[80px] text-center">
            {calendarYear}年{calendarMonth}月
          </span>
          <button
            onClick={() => onMonthChange(1)}
            disabled={!canGoNext}
            className={`px-1.5 py-0.5 text-[11px] border rounded-md transition-colors bg-transparent ${canGoNext ? 'text-text-muted border-border hover:border-accent/40 cursor-pointer' : 'text-text-muted/40 border-border/50 cursor-not-allowed opacity-50'}`}
          >
            ▶
          </button>
          <button
            onClick={onBackToToday}
            className="px-2 py-0.5 text-[11px] text-accent border border-border rounded-md hover:border-accent/40 transition-colors cursor-pointer bg-transparent"
          >
            今天
          </button>
          <button
            onClick={onShowRules}
            className="w-5 h-5 text-[11px] text-text-muted border border-border rounded-full flex items-center justify-center leading-none hover:border-accent/40 transition-colors cursor-pointer bg-transparent"
            title="签到规则与奖励"
          >
            ?
          </button>
        </div>
      </div>

      {/* 签到按钮 */}
      <button
        onClick={onCheckin}
        disabled={!checkinStatus.can_checkin || checkinLoading || justChecked}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all mb-3 border-none"
        style={{
          cursor: checkinStatus.can_checkin && !justChecked ? 'pointer' : 'not-allowed',
          background:
            checkinStatus.can_checkin && !justChecked
              ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #a855f7))'
              : 'var(--bg-card-hover)',
          color: checkinStatus.can_checkin && !justChecked ? '#fff' : 'var(--text-muted)',
        }}
      >
        {justChecked
          ? `签到成功 +${checkinStatus.today_earned} 积分`
          : checkinStatus.can_checkin
            ? checkinLoading
              ? '签到中…'
              : `立即签到 +${checkinStatus.today_earned} 积分`
            : '今日已签到'}
      </button>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
          <div key={day} className="text-center text-[10px] text-text-muted py-0.5">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 */}
      {historyLoading ? (
        <div className="text-center py-4 text-text-muted text-xs">加载中…</div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((item, index) => (
            <div
              key={index}
              className={`h-8 flex items-center justify-center rounded-md border transition-colors ${
                item.day === 0
                  ? 'border-transparent'
                  : item.checked
                    ? 'bg-accent-soft border-transparent'
                    : item.isToday
                      ? 'border-accent'
                      : 'border-transparent'
              }`}
              style={{
                background:
                  item.day === 0
                    ? 'transparent'
                    : item.checked
                      ? undefined
                      : item.isToday
                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                        : 'transparent',
                opacity: item.isFuture ? 0.4 : 1,
              }}
            >
              {item.day > 0 && (
                <span
                  className={`text-[11px] ${item.isToday ? 'font-semibold' : 'font-normal'} ${item.checked || item.isToday ? 'text-accent' : 'text-text'}`}
                >
                  {item.day}
                  {item.checked ? '✓' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
