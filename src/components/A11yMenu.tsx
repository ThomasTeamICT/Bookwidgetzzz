import React, { useEffect, useState } from 'react';

export interface A11yPrefs {
  /** Tekstschaal: 1 / 1.15 / 1.3 */
  scale: number;
  /** Prikkelarme modus: animaties en knipperen dempen. */
  calm: boolean;
  /** Ruimere letter- en regelafstand (leesbaarheid, o.a. bij dyslexie). */
  spacing: boolean;
}

const KEY = 'wf.a11y.v1';

export function loadA11y(): A11yPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { scale: 1, calm: false, spacing: false, ...JSON.parse(raw) };
  } catch { /* standaard gebruiken */ }
  return { scale: 1, calm: false, spacing: false };
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

  const set = (patch: Partial<A11yPrefs>) => {
    const next = { ...value, ...patch };
    save(next);
    onChange(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-quiet btn-icon"
        aria-label="Weergave aanpassen (tekstgrootte, rustmodus)"
        aria-expanded={open}
        title="Weergave aanpassen"
        onClick={() => setOpen((v) => !v)}
      >
        Aa
      </button>
      {open && (
        <div
          className="card"
          role="group"
          aria-label="Weergave-instellingen"
          style={{ position: 'absolute', right: 0, top: '115%', zIndex: 60, width: 230, padding: 12, boxShadow: 'var(--shadow-2)' }}
        >
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
        </div>
      )}
    </div>
  );
}
