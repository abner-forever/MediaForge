import React from 'react';

export default function GlowOrb({
  color = '#4f8cff',
  size = 320,
  style,
}: {
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        borderRadius: '50%',
        width: size,
        height: size,
        background: `radial-gradient(circle at center, ${color}, transparent 70%)`,
        filter: 'blur(80px)',
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}
