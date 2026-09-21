import React from 'react';

// ── Boosterz-huisstijl ──────────────────────────────────────────────────────
// Eén plek voor de naam en het beeldmerk, zodat de schil, de leerlingpagina's
// en de laadschermen hetzelfde teken tonen. Het merk is een bliksemschicht op
// een afgerond vlak met het merkverloop: "geef je les een boost".

export const BRAND = 'Boosterz';
export const BRAND_TAGLINE = 'Geef je les een boost';

export function BrandMark({ size = 32, className, pulse = false }: { size?: number; className?: string; pulse?: boolean }) {
  return (
    <svg
      className={`brand-mark${pulse ? ' ai-pulse' : ''}${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="bz-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="24" fill="url(#bz-grad)" />
      <path d="M57 14 L26 56 H47 L42 86 L74 42 H53 Z" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
