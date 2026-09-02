import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { cycleTheme } from '../lib/theme';
import { getPrefs, onStorageChange } from '../lib/storage';
import {
  clearBackupHint, formatPct, onStorageNotice, pendingBackupHint, readStorageHealth,
  type StorageNotice,
} from '../lib/storageHealth';

const THEME_ICON: Record<string, string> = { auto: '🌓', light: '☀️', dark: '🌙' };
const THEME_LABEL: Record<string, string> = { auto: 'automatisch', light: 'licht', dark: 'donker' };

// ── Opslagbalk ──────────────────────────────────────────────────────────────
// Twee dingen mogen niet ongemerkt voorbijgaan: (1) een bewaaractie die
// mislukte (dan is er data weg) en (2) een opslag die kritiek vol raakt (dan
// gáát er straks data weg). De balk hangt bewust in de leerkrachtschil: de
// leerlingweergave (/speel, /meedoen, /cursus/lees…) laadt deze Layout niet,
// dus een leerling krijgt hem nooit midden in een oefening te zien.

/** Bij welke vulling de balk werd weggeklikt — zodat hij niet blijft terugkomen. */
const BAR_DISMISS_KEY = 'wf.storage.barhidden.v1';
/** Pas opnieuw tonen als het merkbaar erger werd dan bij het wegklikken. */
const REAPPEAR_DELTA = 3;

function readDismissedPct(): number | null {
  try {
    const raw = localStorage.getItem(BAR_DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function rememberDismissedPct(pct: number) {
  try {
    localStorage.setItem(BAR_DISMISS_KEY, String(Math.round(pct)));
  } catch {
    // genegeerd: dan komt de balk bij een volgende meting gewoon terug
  }
}

function StorageBar() {
  // Een back-uphint die bij een vorig bezoek gezet werd, staat hier klaar.
  const [notice, setNotice] = useState<StorageNotice | null>(pendingBackupHint);
  const [criticalPct, setCriticalPct] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  // Meldingen uit de opslaglaag (mislukt bewaren, geweigerde bescherming).
  useEffect(() => onStorageNotice(setNotice), []);

  // Vulling meten: bij het openen en — ontdubbeld — na wijzigingen. Autosave
  // schrijft in bursts, dus we wachten telkens tot het even stil is.
  useEffect(() => {
    let alive = true;
    const measure = () => {
      void readStorageHealth()
        .then((health) => {
          if (!alive) return;
          const dismissed = readDismissedPct();
          const relevant =
            health.level === 'critical' &&
            (dismissed === null || health.worstPct >= dismissed + REAPPEAR_DELTA);
          setCriticalPct(relevant ? health.worstPct : null);
        })
        .catch(() => { /* genegeerd: zonder meting tonen we gewoon niets */ });
    };
    measure();
    const off = onStorageChange(() => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(measure, 3000);
    });
    return () => {
      alive = false;
      off();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  // Volgorde: verlies gaat vóór dreigend verlies, dat gaat vóór een tip.
  const severe = notice?.severe ? notice : null;
  const show = severe ?? (criticalPct !== null ? 'quota' : null) ?? notice;
  if (!show) return null;

  const isSevere = show !== 'quota' && show.severe;
  const text =
    show === 'quota'
      ? `De opslag van dit toestel is voor ${formatPct(criticalPct ?? 0)} vol. Bewaren kan binnenkort mislukken — exporteer je materiaal en ruim oude inzendingen op.`
      : show.message;
  // Het icoon is versiering; de betekenis moet uit het woord ervoor blijken.
  const label = isSevere ? 'Niet bewaard:' : show === 'quota' ? 'Opslag bijna vol:' : 'Back-uptip:';
  const icon = isSevere ? '⚠️' : '💾';

  const dismiss = () => {
    if (show === 'quota') {
      rememberDismissedPct(criticalPct ?? 0);
      setCriticalPct(null);
      return;
    }
    if (show.kind === 'persist-denied') clearBackupHint();
    setNotice(null);
  };

  return (
    <div
      className={`storage-bar${isSevere ? ' storage-bar-severe' : ''}`}
      role={isSevere ? 'alert' : 'status'}
    >
      <span aria-hidden>{icon}</span>
      <p>
        <strong>{label}</strong> {text}
      </p>
      <Link to="/privacy" className="btn btn-sm btn-ghost">Opslag bekijken</Link>
      <button
        className="btn btn-sm btn-quiet btn-icon"
        onClick={dismiss}
        aria-label="Deze melding sluiten"
        title="Sluiten"
      >
        ✕
      </button>
    </div>
  );
}

// Eigen opmaak voor de balk (staat niet in global.css, dat blijft ongemoeid).
const BAR_CSS = `
.storage-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 22px; font-size: 0.92rem;
  background: var(--warn-soft); color: var(--text);
  border-bottom: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
}
.storage-bar-severe {
  background: var(--err-soft);
  border-bottom-color: color-mix(in srgb, var(--err) 45%, transparent);
}
.storage-bar p { margin: 0; flex: 1; min-width: 220px; }
@media print { .storage-bar { display: none !important; } }
@media (max-width: 640px) { .storage-bar { padding: 8px 12px; } }
`;

export function Layout() {
  const [theme, setTheme] = useState(getPrefs().theme);
  return (
    <div className="appshell">
      <style>{BAR_CSS}</style>
      <a className="skip-link" href="#main">Naar de inhoud</a>
      <header className="topbar">
        <Link to="/" className="topbar-logo" aria-label="WidgetFabriek — startpagina">
          <span className="logo-mark" aria-hidden>🧩</span>
          <span>WidgetFabriek</span>
        </Link>
        <nav aria-label="Hoofdnavigatie">
          <NavLink to="/widgets">Mijn widgets</NavLink>
          <NavLink to="/nieuw">Nieuwe widget</NavLink>
          <NavLink to="/cursussen">Cursussen</NavLink>
          <NavLink to="/ai-studio" title="Widgets maken met AI vanuit je bronmateriaal">✨ AI-studio</NavLink>
          <NavLink to="/resultaten">Resultaten</NavLink>
          <NavLink to="/hulp" title="Aan de slag en veelgestelde vragen">Hulp</NavLink>
          <NavLink to="/privacy" title="Privacy en gegevensbeheer">Privacy</NavLink>
        </nav>
        <div className="topbar-spacer" />
        <Link to="/meedoen" className="btn btn-sm btn-ghost">🎓 Ik ben leerling</Link>
        <button
          className="btn btn-quiet btn-icon"
          onClick={() => setTheme(cycleTheme())}
          aria-label={`Thema wisselen (nu: ${THEME_LABEL[theme]})`}
          title={`Thema: ${THEME_LABEL[theme]}`}
        >
          {THEME_ICON[theme]}
        </button>
      </header>
      <StorageBar />
      <main id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
