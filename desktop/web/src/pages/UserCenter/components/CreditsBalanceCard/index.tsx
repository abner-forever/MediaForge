/**
 * 积分余额卡片
 * 显示当前积分、今日获得、连续签到天数
 */

import type { CheckinStatus } from '@/types'

interface CreditsBalanceCardProps {
  balance: number
  checkinStatus: CheckinStatus
}

export default function CreditsBalanceCard({ balance, checkinStatus }: CreditsBalanceCardProps) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #a855f7))',
        borderRadius: 16,
        padding: '28px 32px',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      />
      <div className="relative">
        <div className="text-[13px] opacity-85 mb-2">当前积分</div>
        <div className="text-[42px] font-bold tracking-tight leading-[1.1]">
          {balance.toLocaleString()}
        </div>
        <div className="text-[13px] opacity-75 mt-3">
          今日已获得 <span className="font-semibold">{checkinStatus.can_checkin ? 0 : checkinStatus.today_earned}</span> 积分
        </div>
      </div>
      <div className="relative mt-4">
        <div className="text-[13px] opacity-85">
          连续签到 <span className="font-bold text-lg">{checkinStatus.streak}</span> 天
        </div>
      </div>
    </div>
  )
}
