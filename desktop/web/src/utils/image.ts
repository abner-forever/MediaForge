export function imgSrc(p: string) {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
  if (!p.startsWith('/')) return `/images/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
}

export function thumbSrc(p: string) {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}&thumbnail=1`;
  if (!p.startsWith('/')) return `/images/thumbnail/${encodeURIComponent(p).replace(/%2F/g, '/')}?size=320`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/thumbnail/${encodeURIComponent(rel).replace(/%2F/g, '/')}?size=320`;
}

export function lightboxSrc(p: string) {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}&size=1200`;
  if (!p.startsWith('/')) return `/images/thumbnail/${encodeURIComponent(p).replace(/%2F/g, '/')}?size=1200`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/thumbnail/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
}
