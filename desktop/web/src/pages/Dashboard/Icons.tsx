import React from 'react';

function Svg({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0 }}>
      {children}
    </svg>
  );
}

export const I = {
  image: (s: number) => <Svg size={s}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></Svg>,
  upload: (s: number) => <Svg size={s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>,
  check: (s: number) => <Svg size={s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Svg>,
  target: (s: number) => <Svg size={s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></Svg>,
  search: (s: number) => <Svg size={s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>,
  edit: (s: number) => <Svg size={s}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></Svg>,
  gear: (s: number) => <Svg size={s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Svg>,
  download: (s: number) => <Svg size={s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>,
  plus: (s: number) => <Svg size={s}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></Svg>,
  cpu: (s: number) => <Svg size={s}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M1 9h3"/><path d="M20 9h3"/><path d="M1 15h3"/><path d="M20 15h3"/></Svg>,
  save: (s: number) => <Svg size={s}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></Svg>,
  send: (s: number) => <Svg size={s}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></Svg>,
  pin: (s: number) => <Svg size={s}><line x1="12" y1="17" x2="12" y2="22"/><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17h8v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2"/></Svg>,
  plug: (s: number) => <Svg size={s}><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/></Svg>,
  list: (s: number) => <Svg size={s}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/><path d="M9 3v2"/><path d="M15 3v2"/></Svg>,
};

export const CARD_THEMES = [
  { accent: '#06b6d4', glow: 'rgba(6,182,212,0.2)', bg: 'linear-gradient(135deg, rgba(6,182,212,0.08), transparent 70%)', border: 'rgba(6,182,212,0.2)' },
  { accent: '#4f8cff', glow: 'rgba(79,140,255,0.2)', bg: 'linear-gradient(135deg, rgba(79,140,255,0.08), transparent 70%)', border: 'rgba(79,140,255,0.2)' },
  { accent: '#10b981', glow: 'rgba(16,185,129,0.2)', bg: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent 70%)', border: 'rgba(16,185,129,0.2)' },
  { accent: '#a855f7', glow: 'rgba(168,85,247,0.2)', bg: 'linear-gradient(135deg, rgba(168,85,247,0.08), transparent 70%)', border: 'rgba(168,85,247,0.2)' },
];

export const ACTION_ICONS: Record<string, React.ReactNode> = {
  '搜索': I.search(14), '下载图片': I.download(14), '加入队列': I.plus(14),
  'AI 生成': I.cpu(14), '保存草稿': I.save(14), '发布': I.send(14),
};
