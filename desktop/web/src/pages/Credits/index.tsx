import { useEffect, useCallback } from 'react';
import { creditsApi } from '../../api/client';
import { useStore } from '../../stores';
import { useLoading } from '../../hooks/useLoading';
import BalanceCard from './BalanceCard';
import CheckinCard from './CheckinCard';
import CloudSyncCard from './CloudSyncCard';
import TransactionList from './TransactionList';
import type { CheckinResult } from '../../types';

export default function Credits() {
  const addToast = useStore((s) => s.addToast);
  const balance = useStore((s) => s.creditsBalance);
  const checkinStatus = useStore((s) => s.checkinStatus);
  const setBalance = useStore((s) => s.setCreditsBalance);
  const setCheckinStatus = useStore((s) => s.setCheckinStatus);
  const { loading, withLoading } = useLoading();

  const load = useCallback(async () => {
    await withLoading(async () => {
      try {
        const data = await creditsApi.get();
        setBalance(data.balance);
        setCheckinStatus(data.checkin_status);
      } catch {
        addToast('加载积分信息失败', 'error');
      }
    });
  }, [withLoading, setBalance, setCheckinStatus, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCheckin(result: CheckinResult) {
    setBalance(result.balance);
    setCheckinStatus({
      can_checkin: false,
      streak: result.streak,
      today_earned: result.earned,
    });
    addToast(`签到成功，获得 ${result.earned} 积分`, 'success');
  }

  const todayEarned = checkinStatus.can_checkin ? 0 : checkinStatus.today_earned;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 页面标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>积分中心</h1>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {/* 积分余额 */}
      <BalanceCard balance={balance} todayEarned={todayEarned} />

      {/* 签到区域 */}
      <CheckinCard status={checkinStatus} onCheckin={handleCheckin} />

      {/* 云同步 */}
      <CloudSyncCard />

      {/* 积分明细 */}
      <TransactionList />
    </div>
  );
}
