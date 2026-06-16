/**
 * 用户中心页面
 * 整合个人信息、积分中心、绑定设备、签到日历、任务中心
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { userApi, creditsApi } from '@/api/client';
import { useStore } from '@/stores';
import type { CheckinStatus, CreditTransaction, CheckinHistory } from '@/types';

// 子组件
import UserProfileCard from './components/UserProfileCard';
import CreditsBalanceCard from './components/CreditsBalanceCard';
import CheckinCalendar from './components/CheckinCalendar';
import TransactionList from './components/TransactionList';
import DeviceList from './components/DeviceList';
import SecuritySection from './components/SecuritySection';
import CheckinRulesModal from './components/CheckinRulesModal';
import EditNicknameModal from './components/EditNicknameModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import TaskCenter from './components/TaskCenter';

type TabKey = 'account' | 'tasks';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'account', label: '账户', icon: '🔒' },
  { key: 'tasks', label: '任务中心', icon: '🎯' },
];

export default function UserCenter() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, updateUserInfo, addToast } = useStore();

  // Tab 状态
  const [activeTab, setActiveTab] = useState<TabKey>('account');

  // 弹窗状态
  const [showEditNickname, setShowEditNickname] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showCalendarInfo, setShowCalendarInfo] = useState(false);

  // 设备
  const [devices, setDevices] = useState<string[]>([]);

  // 积分
  const [balance, setBalance] = useState(0);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus>({
    can_checkin: false,
    streak: 0,
    today_earned: 0,
  });
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [justChecked, setJustChecked] = useState(false);

  // 积分明细
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);

  // 签到日历
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);
  const [checkinHistory, setCheckinHistory] = useState<CheckinHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadDevices = async () => {
    try {
      const result = await userApi.getDevices();
      if (result.success) setDevices(result.data);
    } catch (err) {
      console.error('加载设备列表失败:', err);
    }
  };

  const loadCredits = async () => {
    try {
      const data = await creditsApi.get();
      setBalance(data.balance);
      setCheckinStatus(data.checkin_status);
    } catch (err) {
      console.error('加载积分信息失败:', err);
    }
  };

  const loadTransactions = useCallback(async (p: number) => {
    setTxLoading(true);
    try {
      const result = await creditsApi.history(p, 10);
      if (p === 1) {
        setTransactions(result.transactions);
      } else {
        setTransactions((prev) => [...prev, ...result.transactions]);
      }
      setTxTotal(result.total);
      setTxPage(p);
    } catch (err) {
      console.error('加载积分明细失败:', err);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadCheckinHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await creditsApi.checkinHistory(calendarYear, calendarMonth);
      setCheckinHistory(data);
    } catch (err) {
      console.error('加载签到历史失败:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 未登录跳转
  useEffect(() => {
    if (!isAuthenticated) navigate('/auth');
  }, [isAuthenticated, navigate]);

  // 加载数据
  useEffect(() => {
    if (!isAuthenticated) return;
    loadDevices();
    loadCredits();
    loadTransactions(1);
  }, [isAuthenticated]);

  // 加载签到历史
  useEffect(() => {
    if (!isAuthenticated) return;
    loadCheckinHistory();
  }, [isAuthenticated, calendarYear, calendarMonth]);

  /** 执行签到 */
  const handleCheckin = async () => {
    if (!checkinStatus.can_checkin || checkinLoading) return;
    setCheckinLoading(true);
    try {
      const result = await creditsApi.checkin();
      setJustChecked(true);
      setBalance(result.balance);
      setCheckinStatus({
        can_checkin: false,
        streak: result.streak,
        today_earned: result.earned,
      });
      addToast(`签到成功，获得 ${result.earned} 积分`, 'success');
    } catch (err: any) {
      addToast(err.message || '签到失败', 'error');
    } finally {
      setCheckinLoading(false);
    }
  };

  /** 切换月份（最多查看6个月前） */
  const handleMonthChange = (delta: number) => {
    let newMonth = calendarMonth + delta;
    let newYear = calendarYear;

    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }

    // 验证范围：不能超过当前月，不能早于6个月前
    const currentMonth = now.getFullYear() * 12 + (now.getMonth() + 1);
    const targetMonth = newYear * 12 + newMonth;
    if (targetMonth > currentMonth || currentMonth - targetMonth > 5) {
      return;
    }

    setCalendarYear(newYear);
    setCalendarMonth(newMonth);
  };

  /** 回到今天 */
  const handleBackToToday = () => {
    const today = new Date();
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth() + 1);
  };

  // 更新昵称
  const handleUpdateNickname = async (nickname: string) => {
    if (!nickname || nickname.length < 1 || nickname.length > 20) {
      addToast('昵称长度1-20位', 'error');
      return;
    }
    try {
      const result = await userApi.updateProfile({ nickname });
      if (result.success) {
        updateUserInfo({ nickname });
        setShowEditNickname(false);
        addToast('昵称更新成功', 'success');
      } else {
        addToast(result.message, 'error');
      }
    } catch (err: any) {
      addToast(err.message || '更新失败', 'error');
    }
  };

  // 解绑设备
  const handleUnbindDevice = async (deviceId: string) => {
    if (!confirm('确定要解绑该设备吗？')) return;
    try {
      const result = await userApi.unbindDevice(deviceId);
      if (result.success) {
        setDevices(devices.filter((d) => d !== deviceId));
        addToast('设备解绑成功', 'success');
      } else {
        addToast(result.message, 'error');
      }
    } catch (err: any) {
      addToast(err.message || '解绑失败', 'error');
    }
  };

  // 退出登录
  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout();
      navigate('/');
      addToast('已退出登录', 'info');
    }
  };

  // 修改密码
  const handleChangePassword = async (oldPassword: string, newPassword: string) => {
    if (!oldPassword || !newPassword) {
      addToast('请填写所有密码字段', 'error');
      return;
    }
    if (newPassword.length < 6) {
      addToast('新密码至少6位', 'error');
      return;
    }
    if (newPassword === oldPassword) {
      addToast('新密码不能与旧密码相同', 'error');
      return;
    }

    try {
      const result = await userApi.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      if (result.success) {
        addToast('密码修改成功', 'success');
        setShowChangePwd(false);
      } else {
        addToast(result.message, 'error');
      }
    } catch (err: any) {
      addToast(err.message || '修改密码失败', 'error');
    }
  };

  if (!user) return null;

  return (
    <div className="animate-in space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">用户中心</h1>
        <p className="text-sm text-text-secondary mt-1">管理账户信息、积分和任务</p>
      </div>

      {/* 顶部：用户信息 + 积分余额（所有 Tab 共用） */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <UserProfileCard user={user} onEditNickname={() => setShowEditNickname(true)} />
        <CreditsBalanceCard balance={balance} checkinStatus={checkinStatus} />
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'text-accent' : 'text-text-muted hover:text-text'
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'account' && (
        <>
          {/* 签到日历 + 积分明细 并排 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CheckinCalendar
              checkinStatus={checkinStatus}
              checkinLoading={checkinLoading}
              justChecked={justChecked}
              checkinHistory={checkinHistory}
              historyLoading={historyLoading}
              calendarYear={calendarYear}
              calendarMonth={calendarMonth}
              onCheckin={handleCheckin}
              onMonthChange={handleMonthChange}
              onBackToToday={handleBackToToday}
              onShowRules={() => setShowCalendarInfo(true)}
            />
            <TransactionList
              transactions={transactions}
              txTotal={txTotal}
              txLoading={txLoading}
              onLoadMore={() => loadTransactions(txPage + 1)}
            />
          </div>

          {/* 绑定设备 + 修改密码 并排 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DeviceList devices={devices} onUnbind={handleUnbindDevice} />
            <SecuritySection onChangePassword={() => setShowChangePwd(true)} />
          </div>

          {/* 退出登录 */}
          <div className="flex justify-end">
            <button onClick={handleLogout} className="btn btn-sm btn-danger">
              退出登录
            </button>
          </div>
        </>
      )}

      {activeTab === 'tasks' && <TaskCenter />}

      {/* 弹窗 */}
      <CheckinRulesModal
        open={showCalendarInfo}
        onClose={() => setShowCalendarInfo(false)}
        checkinHistory={checkinHistory}
        currentStreak={checkinStatus.streak}
      />

      <EditNicknameModal
        open={showEditNickname}
        onClose={() => setShowEditNickname(false)}
        initialNickname={user.nickname}
        onSave={handleUpdateNickname}
      />

      <ChangePasswordModal
        open={showChangePwd}
        onClose={() => setShowChangePwd(false)}
        onSave={handleChangePassword}
      />
    </div>
  );
}
