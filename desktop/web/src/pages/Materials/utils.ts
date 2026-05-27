export { imgSrc, thumbSrc, lightboxSrc } from '../../utils/image';

export const formatSize = (bytes: number) => {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
};
