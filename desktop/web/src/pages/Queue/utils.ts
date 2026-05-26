export const imgSrc = (p: string) => {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
  if (!p.startsWith('/')) return `/images/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
};

/** 压缩缩略图，用于列表和封面选择等场景，避免加载大图 */
export const thumbSrc = (p: string) => {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}&thumbnail=1`;
  if (!p.startsWith('/')) return `/images/thumbnail/${encodeURIComponent(p).replace(/%2F/g, '/')}?size=320`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/thumbnail/${encodeURIComponent(rel).replace(/%2F/g, '/')}?size=320`;
};

export function formatTime(timeStr?: string): string {
  if (!timeStr) return '';
  const now = Date.now();
  const time = new Date(timeStr).getTime();
  if (isNaN(time)) return '';
  const diff = now - time;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    const d = new Date(timeStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }
  return `${hours}小时前`;
}
