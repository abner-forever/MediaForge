export function fmtTime(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)} 天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export { imgSrc, thumbSrc, lightboxSrc } from '../../utils/image';
