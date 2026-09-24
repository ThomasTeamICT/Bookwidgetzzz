import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, WIDGET_TYPES } from '../widgets/registry';
import { contrastRatio, oklchToHex, typeAccent } from './color';

/** Leest de kleurtokens van één blok uit global.css (licht: `:root`, donker: `[data-theme='dark']`). */
function tokens(selector: string): Record<string, string> {
  const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
  const start = css.indexOf(`${selector} {`);
  expect(start, `blok ${selector} niet gevonden`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = tokens(':root');
const DARK = { ...LIGHT, ...tokens("[data-theme='dark']") };
const THEMES = { licht: LIGHT, donker: DARK };

describe('kleurformule', () => {
  it('rekent bekende OKLCH-waarden juist om', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    // oklch(0.628 0.2577 29.23) is sRGB-rood
    expect(oklchToHex(0.62796, 0.25768, 29.2339)).toBe('#ff0000');
  });

  it('elke soort heeft een eigen tint, minstens 3 graden van de volgende', () => {
    const hues = WIDGET_TYPES.map((t) => t.hue).sort((a, b) => a - b);
    for (let i = 0; i < hues.length; i++) {
      const next = i + 1 < hues.length ? hues[i + 1] : hues[0] + 360;
      expect(next - hues[i]).toBeGreaterThanOrEqual(3);
    }
  });

  it('soorten van één categorie liggen samen in één tintgebied', () => {
    for (const cat of CATEGORIES) {
      const hues = WIDGET_TYPES.filter((t) => t.category === cat.id).map((t) => t.hue);
      const spread = (h: number) => ((h - hues[0] + 540) % 360) - 180;
      const offsets = hues.map(spread);
      expect(Math.max(...offsets) - Math.min(...offsets), cat.id).toBeLessThanOrEqual(70);
    }
  });

  it('accentkleur van elke soort draagt witte tekst (4,5 : 1)', () => {
    for (const t of WIDGET_TYPES) {
      expect(t.color).toBe(typeAccent(t.hue));
      expect(contrastRatio(t.color, '#ffffff'), t.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(Object.entries(THEMES))('icoon op zijn tegel haalt 4,5 : 1 (%s)', (_naam, tk) => {
    const n = (k: string) => Number(tk[k]);
    for (const t of WIDGET_TYPES) {
      const tile = oklchToHex(n('tile-l'), n('tile-c'), t.hue);
      const icon = oklchToHex(n('icon-l'), n('icon-c'), t.hue);
      expect(contrastRatio(tile, icon), t.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('kleurtokens', () => {
  const PAIRS: [fg: string, bg: string, min: number][] = [
    ['text', 'bg', 7],
    ['text-soft', 'bg', 4.5],
    ['text-soft', 'bg-raised', 4.5],
    ['text-faint', 'bg', 4.5],
    ['text-faint', 'bg-raised', 4.5],
    ['text-faint', 'bg-sunken', 4.5],
    ['brand', 'bg-raised', 4.5],
    ['brand', 'brand-soft', 4.5],
    // ok, warn en err dienen op veel plaatsen als tekstkleur
    ['ok', 'bg-raised', 4.5],
    ['warn', 'bg-raised', 4.5],
    ['err', 'bg-raised', 4.5],
    ['ok', 'bg', 4.5],
    ['warn', 'bg', 4.5],
    ['err', 'bg', 4.5],
    ['ok-text', 'ok-soft', 4.5],
    ['warn-text', 'warn-soft', 4.5],
    ['err-text', 'err-soft', 4.5],
  ];
  it.each(Object.entries(THEMES))('tekstkleuren halen hun minimum (%s)', (naam, tk) => {
    for (const [fg, bg, min] of PAIRS) {
      expect(contrastRatio(tk[fg], tk[bg]), `${naam}: ${fg} op ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it.each(Object.entries(THEMES))('witte tekst op gevulde vlakken haalt 4,5 : 1 (%s)', (naam, tk) => {
    for (const k of ['ok-strong', 'err-strong', 'brand-fill', 'brand-fill-strong', 'accent-fill']) {
      expect(contrastRatio(tk[k], '#ffffff'), `${naam}: ${k}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('accentkleur als tekst (A3)', () => {
  // Mengt twee sRGB-kleuren zoals color-mix(in srgb, a p%, b) in de browser doet:
  // per kanaal een gewone (niet-gelineariseerde) menging van de bytewaarden.
  function mixSrgb(a: string, b: string, pctA: number): string {
    const parse = (hex: string) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
      if (!m) throw new Error(`Geen geldige hexkleur: ${hex}`);
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    const mix = (x: number, y: number) => Math.round(x * pctA + y * (1 - pctA));
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(mix(ar, br))}${toHex(mix(ag, bg))}${toHex(mix(ab, bb))}`;
  }

  // Enkele typische, door leerkrachten gekozen accentkleuren, waaronder #096b97
  // dat kaal op --bg-raised in het donkere thema maar 2,95 : 1 haalt.
  const ACCENTS = ['#096b97', '#4f46e5', '#5b3df5', '#d97706', '#16a34a', '#dc2626'];
  const MIX_PCT = 0.6; // 60 % accent, 40 % --text — zie global.css (--player-accent als tekst)

  it.each(Object.entries(THEMES))(
    'color-mix(accent 60%%, tekst) haalt 4,5 : 1 op --bg en --bg-raised (%s)',
    (naam, tk) => {
      for (const accent of ACCENTS) {
        const mixed = mixSrgb(accent, tk.text, MIX_PCT);
        for (const bgKey of ['bg', 'bg-raised']) {
          expect(
            contrastRatio(mixed, tk[bgKey]),
            `${naam}: ${accent} gemengd (${mixed}) op ${bgKey}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );
});

describe('knoppen', () => {
  it('geen donkere tekst op de primaire knop in het donkere thema', () => {
    // --brand-fill is in beide thema's donker genoeg voor witte tekst; een
    // regel die de tekst in het donkere thema donker maakt, gaf 3,1 : 1.
    const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\[data-theme='dark'\]\s*\.btn-primary\s*\{[^}]*color:\s*#(?!fff)/);
  });
});
