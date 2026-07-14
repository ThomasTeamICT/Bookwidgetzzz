import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { cycleTheme } from '../lib/theme';
import { getPrefs } from '../lib/storage';

const THEME_ICON: Record<string, string> = { auto: '🌓', light: '☀️', dark: '🌙' };
const THEME_LABEL: Record<string, string> = { auto: 'automatisch', light: 'licht', dark: 'donker' };

export function Layout() {
  const [theme, setTheme] = useState(getPrefs().theme);
  return (
    <div className="appshell">
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
      <main id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
