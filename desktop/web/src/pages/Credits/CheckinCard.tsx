import { useState } from 'react';
import type { CheckinStatus, CheckinResult } from '../../types';
import { creditsApi } from '../../api/client';

const CHECKIN_REWARDS = [5, 10, 15, 20, 25, 30, 50];

interface Props {
  status: CheckinStatus;
  onCheckin: (result: CheckinResult) => void;
}

export default function CheckinCard({ status, onCheckin }: Props) {
  const [loading, setLoading] = useState(false);
  const [justChecked, setJustChecked] = useState(false);

  async function handleCheckin() {
    if (!status.can_checkin || loading) return;
    setLoading(true);
    try {
      const result = await creditsApi.checkin();
      setJustChecked(true);
      onCheckin(result);
    } catch {
      // 错误由上层 toast 处理
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>每日签到</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          连续签到 <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{status.streak}</span> 天
        </div>
      </div>

      {/* 7天签到进度 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {CHECKIN_REWARDS.map((reward, i) => {
          const done = i < status.streak;
          const isCurrent = i === status.streak && status.can_checkin;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '10px 0',
                borderRadius: 10,
                background: done
                  ? 'var(--accent-soft)'
                  : isCurrent
                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                    : 'var(--bg-card-hover)',
                border: isCurrent ? '1.5px solid var(--accent)' : '1px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {i === 6 ? '第7天' : `第${i + 1}天`}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: done ? 'var(--accent)' : isCurrent ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                +{reward}
              </div>
              {done && (
                <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>✓</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 签到按钮 */}
      <button
        onClick={handleCheckin}
        disabled={!status.can_checkin || loading || justChecked}
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 12,
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: status.can_checkin && !justChecked ? 'pointer' : 'not-allowed',
          background: status.can_checkin && !justChecked
            ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #a855f7))'
            : 'var(--bg-card-hover)',
          color: status.can_checkin && !justChecked ? '#fff' : 'var(--text-muted)',
          transition: 'all 0.2s',
        }}
      >
        {justChecked
          ? `签到成功 +${status.today_earned} 积分`
          : status.can_checkin
            ? loading
              ? '签到中…'
              : `立即签到 +${status.today_earned} 积分`
            : '今日已签到'}
      </button>
    </div>
  );
}
