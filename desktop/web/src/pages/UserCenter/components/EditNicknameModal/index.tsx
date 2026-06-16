/**
 * 编辑昵称弹窗
 */

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

interface EditNicknameModalProps {
  open: boolean;
  onClose: () => void;
  initialNickname: string;
  onSave: (nickname: string) => Promise<void>;
}

export default function EditNicknameModal({
  open,
  onClose,
  initialNickname,
  onSave,
}: EditNicknameModalProps) {
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(nickname);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-[360px]">
        <h3 className="text-base font-semibold text-text mb-5">修改昵称</h3>
        <div className="flex flex-col gap-1.5 mb-5">
          <label className="text-[13px] font-medium text-text-secondary">新昵称</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="输入新昵称"
            maxLength={20}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-sm" onClick={onClose}>
            取消
          </button>
          <Button type="primary" size="sm" loading={saving} onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
}
