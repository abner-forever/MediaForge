/**
 * 修改密码弹窗
 */

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import EyeIcon from '@/components/ui/EyeIcon'

interface ChangePasswordModalProps {
  open: boolean
  onClose: () => void
  onSave: (oldPassword: string, newPassword: string) => Promise<void>
}

export default function ChangePasswordModal({ open, onClose, onSave }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPwd, setConfirmNewPwd] = useState('')
  const [changing, setChanging] = useState(false)
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)

  const handleClose = () => {
    onClose()
    setOldPassword('')
    setNewPassword('')
    setConfirmNewPwd('')
  }

  const handleSave = async () => {
    setChanging(true)
    try {
      await onSave(oldPassword, newPassword)
      handleClose()
    } finally {
      setChanging(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="w-[380px]">
        <h3 className="text-base font-semibold text-text mb-5">修改密码</h3>
        <div className="flex flex-col gap-4">
          {/* 旧密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-secondary">当前密码</label>
            <div className="relative">
              <input
                type={showOldPwd ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="输入当前密码"
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowOldPwd(!showOldPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted flex items-center cursor-pointer bg-transparent border-none"
              ><EyeIcon visible={showOldPwd} /></button>
            </div>
          </div>
          {/* 新密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-secondary">新密码</label>
            <div className="relative">
              <input
                type={showNewPwd ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少6位"
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPwd(!showNewPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted flex items-center cursor-pointer bg-transparent border-none"
              ><EyeIcon visible={showNewPwd} /></button>
            </div>
          </div>
          {/* 确认新密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-secondary">确认新密码</label>
            <input
              type="password"
              value={confirmNewPwd}
              onChange={(e) => setConfirmNewPwd(e.target.value)}
              placeholder="再次输入新密码"
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button
            className="btn btn-sm"
            onClick={handleClose}
          >取消</button>
          <Button type="primary" size="sm" loading={changing} onClick={handleSave}>确认修改</Button>
        </div>
      </div>
    </Modal>
  )
}
