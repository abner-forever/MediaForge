/**
 * 账户安全区域
 * 修改密码入口
 */

interface SecuritySectionProps {
  onChangePassword: () => void
}

export default function SecuritySection({ onChangePassword }: SecuritySectionProps) {
  return (
    <div className="card p-5">
      <div className="section-header">账户安全</div>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">定期修改密码可以保护您的账户安全</p>
        <div className="flex gap-3">
          <button
            onClick={onChangePassword}
            className="btn btn-sm"
          >
            修改密码
          </button>
        </div>
      </div>
    </div>
  )
}
