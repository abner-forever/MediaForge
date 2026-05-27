export { imgSrc, thumbSrc, lightboxSrc } from '../../utils/image';

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
