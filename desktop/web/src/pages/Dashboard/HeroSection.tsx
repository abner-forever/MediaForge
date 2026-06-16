import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const statusItems: { label: string; ok: boolean | undefined; hash: string }[] = [
    { label: '平台认证', ok: health?.platform_auth, hash: 'system-media-source' },
    { label: '微博 Cookie', ok: health?.weibo_cookie, hash: 'system-media-source' },
    { label: 'AI API Key', ok: health?.ai_api_key, hash: 'system-llm' },
    { label: 'AI Base URL', ok: health?.ai_base_url, hash: 'system-llm' },
  ];

  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 18,
        background: [
          'linear-gradient(135deg, rgba(120,104,208,0.05) 0%, transparent 40%)',
          'linear-gradient(225deg, rgba(160,120,208,0.04) 0%, transparent 40%)',
          'linear-gradient(180deg, rgba(96,120,200,0.03) 0%, transparent 50%)',
          'var(--bg-card)',
        ].join(', '),
        boxShadow: '0 4px 24px rgba(120,104,208,0.08), 0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Gradient border — purple to orange */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 18,
          padding: 1,
          background:
            'linear-gradient(135deg, rgba(120,104,208,0.4), rgba(96,120,200,0.25), rgba(160,120,208,0.4))',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        }}
      />
      {/* Grid mesh */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: [
            'linear-gradient(rgba(120,104,208,0.03) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(120,104,208,0.03) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '36px 36px',
        }}
      />
      <GlowOrb color="rgba(120,104,208,0.10)" size={300} style={{ top: -80, left: -60 }} />
      <GlowOrb color="rgba(160,120,208,0.07)" size={340} style={{ top: -100, right: -100 }} />
      <GlowOrb color="rgba(96,120,200,0.08)" size={240} style={{ bottom: -60, left: '30%' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(120,104,208,0.2), rgba(160,120,208,0.15), transparent)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '20%',
          right: '20%',
          height: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(96,120,200,0.12), rgba(120,104,208,0.12), transparent)',
        }}
      />
      <div
        style={{
          position: 'relative',
          background: 'color-mix(in srgb, var(--bg-elevated) 72%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '32px 40px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-0.6px',
                margin: 0,
                background: 'linear-gradient(135deg, var(--text) 0%, #7868d0 50%, #a078d0 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {getGreeting()}，创作者
            </h1>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-muted)',
                margin: '4px 0 0',
                opacity: 0.6,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTime(now)}
            </p>
            <p
              style={{
                fontSize: 16,
                fontWeight: 400,
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                margin: '8px 0 0',
                maxWidth: 520,
              }}
            >
              AI 驱动的图文创作工作流 — 发现、评分、发布，一站式完成
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 24px',
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
            }}
          >
            {statusItems.map((item) => (
              <span
                key={item.label}
                onClick={() => navigate({ pathname: '/settings', hash: item.hash })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
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
