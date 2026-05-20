import { useEffect, useState } from 'react';
import type { SettingsData } from '../../api/client';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';

export default function MaterialsSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const { addToast } = useStore();
  const [materialsPath, setMaterialsPath] = useState(data.download_dir);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    setMaterialsPath(data.download_dir);
  }, [data.download_dir]);

  async function handleBrowse() {
    setBrowsing(true);
    try {
      const res = await fetch('/api/pick-folder');
      const { path } = await res.json();
      if (path) setMaterialsPath(path);
    } catch (err: any) {
      addToast(err.message || '选择文件夹失败', 'error');
    } finally {
      setBrowsing(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="section-header">素材保存位置</div>
      <div className="space-y-2">
        <p className="text-xs text-text-muted">图片下载后的本地保存目录，置空恢复默认路径</p>
        <div className="flex gap-2">
          <input type="text" value={materialsPath} onChange={e => setMaterialsPath(e.target.value)} placeholder="默认路径" className="flex-1" />
          <button type="button" className="btn btn-sm" onClick={handleBrowse} disabled={browsing}>
            {browsing ? '选择中...' : '选择文件夹'}
          </button>
        </div>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => save({ MATERIALS_PATH: materialsPath }))} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存'}
      </button>
    </div>
  );
}
