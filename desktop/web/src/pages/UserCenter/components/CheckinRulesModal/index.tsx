/**
 * 签到规则弹窗
 * 显示签到规则和里程碑奖励
 */

import Modal from '@/components/ui/Modal';
import type { CheckinHistory } from '@/types';
import { STREAK_MILESTONES } from '../CheckinCalendar';

interface CheckinRulesModalProps {
  open: boolean;
  onClose: () => void;
  checkinHistory: CheckinHistory | null;
  currentStreak: number;
}

export default function CheckinRulesModal({
  open,
  onClose,
  checkinHistory,
  currentStreak,
}: CheckinRulesModalProps) {
  // 计算下一个里程碑
  const nextMilestone = STREAK_MILESTONES.find((m) => m.days > currentStreak);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-[380px]">
        <h3 className="text-base font-semibold text-text mb-4">签到规则</h3>
        <div className="text-[13px] text-text-secondary leading-relaxed mb-5">
          <p className="mb-2">• 每日签到可获得积分，连续签到积分递增</p>
          <p className="mb-2">• 第1天 +5，第2天 +10，第3天 +15，第4天 +20</p>
          <p className="mb-2">• 第5天 +25，第6天 +30，第7天 +50</p>
          <p className="mb-2">• 连续签到满7天后自动重置，从第1天重新开始</p>
          <p className="m-0">• 断签一天即重新计算连续天数</p>
        </div>

        <h4 className="text-sm font-semibold text-text mb-3">连续签到里程碑</h4>
        <div className="flex flex-col gap-2">
          {STREAK_MILESTONES.map((milestone) => {
            const achieved = checkinHistory
              ? checkinHistory.current_streak >= milestone.days
              : false;
            const isNext = nextMilestone?.days === milestone.days;
            return (
              <div
                key={milestone.days}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-colors ${
                  achieved
                    ? 'bg-success/10'
                    : isNext
                      ? 'bg-accent-soft border border-accent'
                      : 'bg-bg-secondary'
                }`}
                style={{ border: isNext ? undefined : '1px solid transparent' }}
              >
                <div>
                  <span
                    className={`text-[13px] font-medium ${achieved ? 'text-success' : 'text-text'}`}
                  >
                    {milestone.label}
                  </span>
                  <span className="text-xs text-text-muted ml-2">连续{milestone.days}天</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[13px] font-semibold ${achieved ? 'text-success' : 'text-accent'}`}
                  >
                    +{milestone.bonus}
                  </span>
                  {achieved && <span className="text-[11px] text-success">✓ 已达成</span>}
                  {isNext && checkinHistory && (
                    <span className="text-[11px] text-accent">
                      还差{milestone.days - checkinHistory.current_streak}天
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end mt-5">
          <button className="btn btn-sm" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </Modal>
  );
}
