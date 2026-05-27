import { useState, useEffect } from 'react';
import type { HealthStatus } from '../../api/client';
import GlowOrb from './GlowOrb';
import StatusDot, { getGreeting } from './StatusDot';
import { I } from './Icons';

function useCurrentTime() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const w = weekdays[d.getDay()];
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  return `${y}/${m}/${day} 周${w} ${h}:${min}:${sec}`;
}

export default function HeroSection({ health }: { health: HealthStatus | null }) {
  const now = useCurrentTime();
  const statusItems: { label: string; ok: boolean | undefined }[] = [
    { label: '平台认证', ok: health?.platform_auth },
    { label: '微博 Cookie', ok: health?.weibo_cookie },
    { label: 'AI API Key', ok: health?.ai_api_key },
    { label: 'AI Base URL', ok: health?.ai_base_url },
  ];

  return (
    <section style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 16,
      background: [
        'linear-gradient(135deg, rgba(6,182,212,0.06) 0%, transparent 40%)',
        'linear-gradient(225deg, rgba(79,140,255,0.08) 0%, transparent 40%)',
        'linear-gradient(180deg, rgba(168,85,247,0.05) 0%, transparent 50%)',
        'var(--bg-card)',
      ].join(', '),
      boxShadow: '0 4px 20px rgba(79,140,255,0.08), 0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Gradient border layer */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 16,
        padding: 1,
        background: 'linear-gradient(135deg, rgba(6,182,212,0.5), rgba(79,140,255,0.5), rgba(168,85,247,0.5))',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        pointerEvents: 'none',
      }} />
      {/* Grid mesh */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: [
          'linear-gradient(rgba(79,140,255,0.05) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(79,140,255,0.05) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '36px 36px',
      }} />
      <GlowOrb color="rgba(6,182,212,0.15)" size={280} style={{ top: -80, left: -60 }} />
      <GlowOrb color="rgba(79,140,255,0.18)" size={360} style={{ top: -100, right: -100 }} />
      <GlowOrb color="rgba(168,85,247,0.1)" size={240} style={{ bottom: -60, left: '30%' }} />
      <div style={{
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(79,140,255,0.3), rgba(6,182,212,0.3), transparent)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '20%',
        right: '20%',
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.2), rgba(79,140,255,0.2), transparent)',
      }} />
      <div style={{
        position: 'relative',
        background: 'color-mix(in srgb, var(--bg-elevated) 72%, transparent)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '32px 40px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.6px',
              margin: 0,
              background: 'linear-gradient(135deg, var(--text) 0%, #4f8cff 60%, #a855f7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {getGreeting()}，创作者
            </h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', margin: '4px 0 0', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(now)}
            </p>
            <p style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: 'var(--text-muted)', margin: '8px 0 0', maxWidth: 520 }}>
              AI 驱动的图文创作工作流 — 发现、评分、发布，一站式完成
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            {statusItems.map((item) => (
              <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <StatusDot ok={item.ok} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
