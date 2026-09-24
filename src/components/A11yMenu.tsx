import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';
import '../styles/leerling.css';

/**
 * `.player-topbar` heeft `backdrop-filter` (global.css), en dat maakt er —
 * net als `transform`/`filter`/`will-change` — een containing block van voor
 * `position: fixed`-nakomelingen. Een paneel dat daar gewoon in genest zit,
 * verschijnt dan niet t.o.v. het scherm maar t.o.v. de (lage) kopbalk, en
 * valt zo grotendeels erbuiten. Vandaar de portal naar `document.body`, met
 * positie zelf berekend (geen CSS-media-query): op gsm een vast paneel onder
 * in beeld, op groter scherm net onder de knop, uitgelijnd op de rechterrand.
 */
function computePosition(btn: HTMLElement): React.CSSProperties {
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  if (mobile) {
    return { position: 'fixed', left: 12, right: 12, bottom: 12, top: 'auto', width: 'auto' };
  }
  const rect = btn.getBoundingClientRect();
  const width = 250;
  const right = Math.max(12, window.innerWidth - rect.right);
  return { position: 'fixed', top: rect.bottom + 8, right, width, left: 'auto', bottom: 'auto' };
}

export interface A11yPrefs {
  /** Tekstschaal: 1 / 1.15 / 1.3 */
  scale: number;
  /** Prikkelarme modus: animaties en knipperen dempen. */
  calm: boolean;
  /** Ruimere letter- en regelafstand (leesbaarheid, o.a. bij dyslexie). */
  spacing: boolean;
  /** Voorleestempo voor de TTS-knoppen. */
  rate: number;
}

const KEY = 'wf.a11y.v1';
const DEFAULTS: A11yPrefs = { scale: 1, calm: false, spacing: false, rate: 0.95 };

export function loadA11y(): A11yPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* standaard gebruiken */ }
  return { ...DEFAULTS };
}

function save(p: A11yPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* best effort */ }
}

/**
 * Leerling-instelbaar toegankelijkheidsmenu (UDL): tekstgrootte, rust en
 * letterafstand. Keuzes gelden voor alle widgets op dit toestel.
 */
export function A11yMenu({ value, onChange }: { value: A11yPrefs; onChange: (p: A11yPrefs) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const set = (patch: Partial<A11yPrefs>) => {
    const next = { ...value, ...patch };
    save(next);
    onChange(next);
  };

  const close = () => {
    setOpen(false);
    setPos(null);
    toggleRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !toggleRef.current) return;
    const btn = toggleRef.current;
    const reposition = () => setPos(computePosition(btn));
    reposition();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onPointer = (e: PointerEvent) => {
      const panel = document.getElementById('a11y-panel');
      const target = e.target as Node;
      if (btn.contains(target) || panel?.contains(target)) return;
      setOpen(false); // buiten klikken sluit zonder focus te verplaatsen
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  return (
    <div className="a11y-wrap">
      <button
        ref={toggleRef}
        className="btn btn-quiet btn-icon"
        aria-label="Leesinstellingen (tekstgrootte, rustmodus, voorleestempo)"
        aria-expanded={open}
        aria-controls="a11y-panel"
        title="Leesinstellingen"
        onClick={() => setOpen((v) => !v)}
      >
        Aa
      </button>
      {open && pos && createPortal(
        <div
          id="a11y-panel"
          className="card a11y-panel"
          style={pos}
          role="group"
          aria-label="Leesinstellingen"
        >
          <div className="a11y-panel-head">
            <strong>Leesinstellingen</strong>
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Sluiten" onClick={close}>
              <CloseIcon size={16} />
            </button>
          </div>
          <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '0.85rem' }}>Tekstgrootte</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {[{ s: 1, l: 'A' }, { s: 1.15, l: 'A' }, { s: 1.3, l: 'A' }].map(({ s, l }, i) => (
              <button
                key={s}
                className={`btn btn-sm ${value.scale === s ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: `${0.8 + i * 0.18}rem`, flex: 1 }}
                aria-pressed={value.scale === s}
                aria-label={`Tekstgrootte ${i === 0 ? 'normaal' : i === 1 ? 'groot' : 'extra groot'}`}
                onClick={() => set({ scale: s })}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="checkbox-row" style={{ fontSize: '0.9rem' }}>
            <input type="checkbox" checked={value.spacing} onChange={(e) => set({ spacing: e.target.checked })} />
            <span>Ruimere letterafstand</span>
          </label>
          <label className="checkbox-row" style={{ fontSize: '0.9rem' }}>
            <input type="checkbox" checked={value.calm} onChange={(e) => set({ calm: e.target.checked })} />
            <span>Rustmodus (minder beweging)</span>
          </label>
          <p style={{ margin: '8px 0 4px', fontWeight: 700, fontSize: '0.85rem' }}>Voorleestempo</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ r: 0.75, l: 'Traag' }, { r: 0.95, l: 'Normaal' }, { r: 1.15, l: 'Vlot' }].map(({ r, l }) => (
              <button
                key={r}
                className={`btn btn-sm ${value.rate === r ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, fontSize: '0.78rem' }}
                aria-pressed={value.rate === r}
                onClick={() => set({ rate: r })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
