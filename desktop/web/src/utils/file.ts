/** 素材文件工具函数 */

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const TEXT_EXTS = new Set(['.md', '.txt']);
const PDF_EXTS = new Set(['.pdf']);

/** 根据相对路径构造素材文件预览 URL */
export function fileUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `/api/materials/file/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}

/** 是否为图片文件 */
export function isImageFile(suffix: string): boolean {
  return IMAGE_EXTS.has(suffix.toLowerCase());
}

/** 是否为文本文件（MD/TXT） */
export function isTextFile(suffix: string): boolean {
  return TEXT_EXTS.has(suffix.toLowerCase());
}

/** 是否为 PDF 文件 */
export function isPdfFile(suffix: string): boolean {
  return PDF_EXTS.has(suffix.toLowerCase());
}

/** 格式化文件大小为人类可读字符串 */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
