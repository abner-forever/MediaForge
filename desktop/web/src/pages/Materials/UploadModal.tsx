import { useState, useRef, useCallback } from 'react';
import { materialsApi } from '../../api/materials';
import { isImageFile, isTextFile, isPdfFile } from '../../utils/file';

interface UploadItem {
  file: File;
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function UploadModal({
  currentPath, onClose, onUploadComplete,
}: {
  currentPath: string;
  onClose: () => void;
  onUploadComplete: () => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = [];
    for (const f of Array.from(files)) {
      const suffix = '.' + f.name.split('.').pop()?.toLowerCase();
      if (isImageFile(suffix) || isTextFile(suffix) || isPdfFile(suffix)) {
        newItems.push({ file: f, name: f.name, status: 'pending' });
      }
    }
    setItems(prev => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const startUpload = async () => {
    setUploading(true);
    const pending = items.filter(i => i.status === 'pending');
    for (let i = 0; i < pending.length; i++) {
      const idx = items.indexOf(pending[i]);
      setItems(prev => prev.map((item, j) => j === idx ? { ...item, status: 'uploading' } : item));
      try {
        await materialsApi.upload(pending[i].file, currentPath);
        setItems(prev => prev.map((item, j) => j === idx ? { ...item, status: 'success' } : item));
      } catch (e: any) {
        setItems(prev => prev.map((item, j) => j === idx ? { ...item, status: 'error', error: e.message } : item));
      }
    }
    setUploading(false);
    onUploadComplete();
  };

  const hasPending = items.some(i => i.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-h-[80vh] bg-bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 标题 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-text">上传文件</h3>
          <button className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors" onClick={onClose}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          {/* 拖拽上传区 */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-bg-hover/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.gif,.md,.txt,.pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            <svg className="w-10 h-10 mx-auto mb-3 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-sm text-text-muted">拖拽文件到此处，或点击选择文件</p>
            <p className="text-xs text-text-muted/60 mt-1">支持 JPG / PNG / WebP / GIF / MD / TXT / PDF</p>
          </div>

          {/* 文件列表 */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-muted">待上传文件 ({items.length})</div>
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary">
                  {/* 状态图标 */}
                  <div className="shrink-0">
                    {item.status === 'uploading' && (
                      <svg className="w-4 h-4 text-accent animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                    )}
                    {item.status === 'success' && (
                      <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    {item.status === 'error' && (
                      <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    )}
                    {(item.status === 'pending') && (
                      <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                  </div>
                  {/* 文件名 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text truncate">{item.name}</div>
                    {item.error && <div className="text-[10px] text-red-400 mt-0.5">{item.error}</div>}
                  </div>
                  {/* 删除按钮 */}
                  {item.status === 'pending' && (
                    <button className="shrink-0 p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text" onClick={() => removeItem(index)}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border shrink-0">
          <button
            className="px-4 py-1.5 text-sm rounded-lg text-text-muted hover:bg-bg-hover transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={!hasPending || uploading}
            onClick={startUpload}
          >
            {uploading ? '上传中...' : `上传 (${items.filter(i => i.status === 'pending').length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
