export type TabKey = 'all' | 'draft' | 'queued' | 'published';
export const TAB_LABELS: Record<TabKey, string> = {
  all: '全部',
  draft: '草稿',
  queued: '已排队',
  published: '已发布',
};
export const STATUS_LABELS: Record<string, { text: string }> = {
  draft: { text: '草稿' },
  reviewing: { text: '待检查' },
  queued: { text: '已排队' },
  saved_to_wechat: { text: '公众号草稿' },
  published: { text: '已发布' },
  failed: { text: '发布失败' },
};

export function coverImageUrl(path: string, source?: string) {
  if (source === 'web' || path.startsWith('http')) return `/proxy?url=${encodeURIComponent(path)}`;
  if (!path.startsWith('/')) return `/images/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  return `/images/${path}`;
}

export function fmtTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
