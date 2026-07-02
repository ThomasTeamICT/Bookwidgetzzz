import React from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, WIDGET_TYPES } from '../widgets/registry';

export function Landing() {
  return (
    <div>
      <section className="hero">
        <h1>Interactieve oefeningen voor je klas, in enkele minuten</h1>
        <p className="lede">
          Maak quizzen, kruiswoordraadsels, flitskaarten, spelletjes en meer.
          Deel ze met een code of link, en volg de resultaten van je leerlingen op — alles in je browser.
        </p>
        <div className="hero-actions">
          <Link to="/nieuw" className="btn btn-primary btn-lg">✨ Maak je eerste widget</Link>
          <Link to="/meedoen" className="btn btn-ghost btn-lg">🎓 Ik heb een code van mijn leerkracht</Link>
        </div>
      </section>

      <section className="page" aria-labelledby="types-title">
        <h2 id="types-title" style={{ textAlign: 'center', marginBottom: 6 }}>
          {WIDGET_TYPES.length} soorten widgets
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-soft)', marginBottom: 26 }}>
          Van toetsen met automatische verbetering tot spelletjes en klashulpjes.
        </p>
        {CATEGORIES.map((cat) => {
          const types = WIDGET_TYPES.filter((t) => t.category === cat.id);
          return (
            <div key={cat.id} style={{ marginBottom: 26 }}>
              <h3 style={{ marginBottom: 12 }}>{cat.icon} {cat.name}</h3>
              <div className="type-grid">
                {types.map((t) => (
                  <Link
                    key={t.id}
                    to={`/nieuw?type=${t.id}`}
                    className="card type-card"
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="type-icon" style={{ background: t.color }} aria-hidden>{t.icon}</span>
                    <span>
                      <h3>{t.name}</h3>
                      <p>{t.tagline}</p>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="page page-narrow" aria-labelledby="how-title" style={{ paddingTop: 0 }}>
        <h2 id="how-title" style={{ textAlign: 'center', marginBottom: 20 }}>Zo werkt het</h2>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {[
            { n: '1', icon: '🛠️', title: 'Maak', text: 'Kies een widgettype en vul je eigen inhoud in. Je ziet meteen een voorbeeld.' },
            { n: '2', icon: '📤', title: 'Deel', text: 'Geef je leerlingen de code van 6 tekens of stuur hen de deellink.' },
            { n: '3', icon: '📊', title: 'Volg op', text: 'Bekijk scores en antwoorden per leerling, beoordeel open vragen en exporteer naar CSV.' },
          ].map((s) => (
            <div key={s.n} className="card card-pad" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem' }} aria-hidden>{s.icon}</div>
              <h3>{s.n}. {s.title}</h3>
              <p style={{ color: 'var(--text-soft)', margin: 0 }}>{s.text}</p>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: 30, fontSize: '0.88rem' }}>
          💾 Alles wordt lokaal in je browser opgeslagen — geen account nodig. Gebruik exporteren/importeren om widgets over te zetten naar een ander toestel.
        </p>
      </section>
    </div>
  );
}
