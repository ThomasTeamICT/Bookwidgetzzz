import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getWidgetByCode } from '../lib/storage';
import { getCourseByCode } from '../lib/courses';

export function JoinPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const go = () => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) {
      setError('Vul de volledige code in (6 tekens).');
      return;
    }
    // Eén codeveld voor alles: eerst widgets proberen, dan cursussen.
    if (getWidgetByCode(c)) {
      navigate(`/speel/${c}`);
      return;
    }
    if (getCourseByCode(c)) {
      navigate(`/cursus/lees/${c}`);
      return;
    }
    setError(`Geen opdracht of cursus gevonden met code ${c} op dit toestel. Werk je thuis? Vraag dan de draagbare link aan je leerkracht.`);
  };

  return (
    <div className="player-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="player-topbar">
        <Link to="/" className="topbar-logo" style={{ fontSize: '1rem' }}>
          <span className="logo-mark" aria-hidden style={{ width: 28, height: 28, fontSize: '0.9rem' }}>🧩</span>
          WidgetFabriek
        </Link>
      </header>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.8rem' }} aria-hidden>🎓</div>
            <h1 style={{ fontSize: '1.45rem' }}>Meedoen met een opdracht</h1>
            <p style={{ color: 'var(--text-soft)' }}>Typ de code die je van je leerkracht kreeg.</p>
            <form onSubmit={(e) => { e.preventDefault(); go(); }}>
              <input
                className="input join-code-input"
                value={code}
                maxLength={6}
                placeholder="ABC123"
                autoFocus
                aria-label="Klascode van 6 tekens"
                onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(''); }}
              />
              {error && <p role="alert" style={{ color: 'var(--err)', fontWeight: 600, marginTop: 10 }}>{error}</p>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 14 }} type="submit" disabled={code.length < 6}>
                Start →
              </button>
            </form>
          </div>
          <p style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
            <Link to="/voortgang" style={{ color: 'var(--text-soft)', fontSize: '0.9rem' }}>
              📈 Mijn voortgang
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
