/**
 * 用户信息卡片
 * 显示头像、昵称、邮箱和详细信息
 */

import type { UserProfile } from '@/types'

interface UserProfileCardProps {
  user: UserProfile
  onEditNickname: () => void
}

/** 信息行组件 */
function InfoRow({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm text-text" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
    </div>
  )
}

export default function UserProfileCard({ user, onEditNickname }: UserProfileCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-4">
        {/* 头像 */}
        <div className="w-16 h-16 rounded-full bg-accent-soft flex items-center justify-center text-2xl font-bold text-accent shrink-0">
          {user.nickname?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase()}
        </div>

        {/* 用户信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text m-0">{user.nickname}</h2>
            <button
              onClick={onEditNickname}
              className="p-1 text-text-muted hover:text-accent transition-colors cursor-pointer"
              title="编辑昵称"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-text-muted mt-1">{user.email}</p>
        </div>
      </div>

      {/* 详细信息 */}
      <div className="flex flex-col gap-3 mt-5 pt-5 border-t border-border">
        <InfoRow label="用户ID" value={<span className="font-mono text-xs">{user.user_id}</span>} />
        <InfoRow label="注册时间" value={new Date(user.created_at).toLocaleString('zh-CN')} />
        <InfoRow label="最后登录" value={user.last_login ? new Date(user.last_login).toLocaleString('zh-CN') : '-'} />
        <InfoRow label="邮箱验证" value={user.is_verified ? '已验证' : '未验证'} valueColor={user.is_verified ? 'var(--success)' : 'var(--warning)'} />
      </div>
    </div>
  )
}
