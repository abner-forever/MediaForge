import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { materialsApi } from '../../api/client';
import type { MaterialMeta } from '../../api/client';

export default function TagEditorModal({
  path,
  meta,
  onClose,
  onSaved,
  addToast,
}: {
  path: string | null;
  meta: MaterialMeta | null;
  onClose: () => void;
  onSaved: () => void;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [tagsText, setTagsText] = useState('');
  const [celebrity, setCelebrity] = useState('');
  const [scene, setScene] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meta) {
      setTagsText((meta.tags || []).join(', '));
      setCelebrity(meta.celebrity || '');
      setScene(meta.scene || '');
    } else {
      setTagsText('');
      setCelebrity('');
      setScene('');
    }
  }, [meta]);

  async function handleSave() {
    if (!path) return;
    setSaving(true);
    try {
      await materialsApi.updateMeta(path, {
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        celebrity: celebrity.trim(),
        scene: scene.trim(),
      });
      addToast('标签已保存', 'success');
      onSaved();
    } catch (err: any) {
      addToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!path} onClose={onClose} className="w-96">
      <h3 className="text-sm font-bold text-text mb-4">编辑标签</h3>
      {path && <p className="text-xs text-text-muted mb-4 truncate">{path.split('/').pop()}</p>}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-text-muted">标签（逗号分隔）</label>
          <input
            type="text"
            className="w-full text-sm"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="例如：时尚, 街拍, 穿搭"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted">人物</label>
          <input
            type="text"
            className="w-full text-sm"
            value={celebrity}
            onChange={(e) => setCelebrity(e.target.value)}
            placeholder="艺人姓名"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted">场景</label>
          <input
            type="text"
            className="w-full text-sm"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            placeholder="例如：红毯, 机场, 活动"
          />
        </div>
      </div>
      {meta && (
        <div className="mt-3 text-xs text-text-muted space-y-1">
          {meta.source_platform && <div>来源平台：{meta.source_platform}</div>}
          {meta.used_count > 0 && <div>已使用 {meta.used_count} 次</div>}
        </div>
      )}
      <div className="flex gap-2 justify-end mt-5">
        <button className="btn btn-sm" onClick={onClose}>
          取消
        </button>
        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
              保存中
            </>
          ) : (
            '保存'
          )}
        </button>
      </div>
    </Modal>
  );
}
