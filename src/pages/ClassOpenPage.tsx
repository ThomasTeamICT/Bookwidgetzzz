import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ClassPack } from '../lib/classPack';
import { adoptClassPack, decodeClassPack, importClassPackJson } from '../lib/classPack';
import { BrandMark } from '../components/Brand';
import { EmptyState } from '../components/ui';

/**
 * /klas/open?d=… — het klaspakket binnenhalen op het toestel van de leerling.
 *
 * Alles uit het pakket wordt lokaal bewaard: de cursussen met hun oefeningen,
 * de losse widgets, en de klas zelf (in een aparte leerlingopslag, zodat de
 * klassenlijst van de leerkracht schoon blijft). Daarna gaat de leerling
 * meteen naar zijn eigen hub.
 *
 * Zonder `d` is dit het loket voor een pakketbestand of een geplakte link —
 * handig wanneer de link te lang was om te scannen.
 */
export function ClassOpenPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pack, setPack] = useState<ClassPack | null>(null);
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const d = params.get('d');

  const take = (p: ClassPack) => {
    setPack(p);
    try {
      adoptClassPack(p);
    } catch {
      setError('Het pakket kon niet bewaard worden op dit toestel. Is de opslag van je browser vol of geblokkeerd?');
      return;
    }
    navigate(`/leerling/${p.klas.code}`, { replace: true });
  };

  useEffect(() => {
    if (!d) return;
    const decoded = decodeClassPack(d);
    if (!decoded) {
      setError('Deze klaslink werkt niet — hij is onvolledig of beschadigd (misschien afgebroken bij het kopiëren). Vraag je leerkracht om de link opnieuw.');
      return;
    }
    take(decoded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const openBestand = async (f: File) => {
    let text: string;
    try {
      text = await f.text();
    } catch {
      setError('Het bestand kon niet gelezen worden.');
      return;
    }
    const p = importClassPackJson(text);
    if (!p) {
      setError('Dit is geen klaspakket van Boosterz. Vraag je leerkracht het juiste bestand.');
      return;
    }
    take(p);
  };

  const openGeplakt = () => {
    const value = paste.trim();
    if (!value) return;
    // Zowel een volledige link als alleen het d=-stuk mag.
    const match = /[?&]d=([^&\s]+)/.exec(value);
    const decoded = decodeClassPack(match ? match[1] : value) ?? importClassPackJson(value);
    if (!decoded) {
      setError('Dat is geen geldige klaslink of pakket. Plak de volledige link die je van je leerkracht kreeg.');
      return;
    }
    take(decoded);
  };

  return (
    <div className="player-shell" style={{ minHeight: '100vh' }}>
      <header className="player-topbar">
        <Link to="/meedoen" className="topbar-logo" style={{ fontSize: '1.05rem' }}>
          <BrandMark size={28} />
          <span className="wordmark">Booster<b>z</b></span>
        </Link>
        <span className="title">Klaspakket openen</span>
      </header>

      <div className="player-main" style={{ maxWidth: 560 }}>
        {error ? (
          <EmptyState icon="⚠️" title="Dit pakket kon niet geopend worden">
            <p>{error}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/meedoen" className="btn btn-primary">Met een code meedoen</Link>
              <button className="btn btn-ghost" onClick={() => setError('')}>Opnieuw proberen</button>
            </div>
          </EmptyState>
        ) : d && !pack ? (
          <div style={{ textAlign: 'center', paddingTop: 70 }}>
            <div style={{ fontSize: '3rem' }} aria-hidden>📦</div>
            <p role="status" style={{ color: 'var(--text-soft)' }}>Je klas wordt klaargezet…</p>
          </div>
        ) : (
          <div className="card card-pad">
            <h1 style={{ fontSize: '1.35rem', marginTop: 0 }}>📦 Klaspakket openen</h1>
            <p style={{ color: 'var(--text-soft)' }}>
              Kreeg je van je leerkracht een <strong>klaslink</strong> of een <strong>pakketbestand</strong>?
              Open het hier: je cursussen en oefeningen komen dan op dit toestel te staan, ook zonder
              internet achteraf.
            </p>

            <div className="field">
              <label htmlFor="klaslink">Klaslink plakken</label>
              <textarea
                id="klaslink"
                className="textarea"
                rows={3}
                value={paste}
                placeholder="https://…#/klas/open?d=…"
                onChange={(e) => { setPaste(e.target.value); setError(''); }}
                style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={!paste.trim()} onClick={openGeplakt}>
                ✔ Openen
              </button>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                📂 Pakketbestand kiezen…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label="Klaspakketbestand kiezen"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void openBestand(f);
                  e.target.value = '';
                }}
              />
            </div>

            <hr className="divider" />
            <p className="hint" style={{ marginBottom: 0 }}>
              Heb je alleen een korte klascode (6 tekens)? Ga dan naar{' '}
              <Link to="/meedoen">Meedoen</Link> en typ ze daar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
