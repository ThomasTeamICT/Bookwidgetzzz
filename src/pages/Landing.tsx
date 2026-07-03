import React from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, WIDGET_TYPES } from '../widgets/registry';

export function Landing() {
  return (
    <div>
      <section className="hero">
        <h1>Van bronmateriaal naar lesmateriaal, in enkele minuten</h1>
        <p className="lede">
          Maak quizzen, spelletjes en volledige digitale cursussen. Laat de ✨ AI-assistent het
          voorbereidende werk doen vanuit jouw eigen cursustekst of leerplandoelen — jij kijkt na
          en deelt met één code of link. Alles in je browser, zonder account.
        </p>
        <div className="hero-actions">
          <Link to="/ai-studio" className="btn btn-ai btn-lg">✨ Maak widgets met AI</Link>
          <Link to="/nieuw" className="btn btn-primary btn-lg">🛠️ Zelf bouwen</Link>
          <Link to="/meedoen" className="btn btn-ghost btn-lg">🎓 Ik heb een code van mijn leerkracht</Link>
        </div>
      </section>

      <section className="page" aria-labelledby="pijlers-title" style={{ paddingBottom: 6 }}>
        <h2 id="pijlers-title" className="sr-only">Wat kan WidgetFabriek?</h2>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <div className="card card-pad">
            <div style={{ fontSize: '1.9rem' }} aria-hidden>✨</div>
            <h3>AI-assistent, overal</h3>
            <p style={{ color: 'var(--text-soft)' }}>
              Plak een hoofdstuk of je leerplandoelen en krijg in één minuut een voorzet: vragen mét
              uitleg, hints en steuntaal. Jij blijft de leerkracht — alles komt eerst in een
              voorvertoning die jij nakijkt.
            </p>
            <Link to="/ai-studio" className="btn btn-sm btn-ghost">Naar de AI-studio →</Link>
          </div>
          <div className="card card-pad">
            <div style={{ fontSize: '1.9rem' }} aria-hidden>📚</div>
            <h3>Digitale cursussen</h3>
            <p style={{ color: 'var(--text-soft)' }}>
              Bouw een cursus met hoofdstukken, tekst, video en ingebedde oefeningen. Deel per
              hoofdstuk met je klas en volg live wie waar zit — inclusief leerdoelen en kijktijd.
            </p>
            <Link to="/cursussen" className="btn btn-sm btn-ghost">Naar de cursussen →</Link>
          </div>
          <div className="card card-pad">
            <div style={{ fontSize: '1.9rem' }} aria-hidden>📊</div>
            <h3>Maximale opvolgbaarheid</h3>
            <p style={{ color: 'var(--text-soft)' }}>
              Scores per leerdoel, distractor-analyse, nakijkcockpit en voortgang per sectie.
              Niet méér data, maar de juiste: signalen waar je les van morgen iets mee kan.
            </p>
            <Link to="/resultaten" className="btn btn-sm btn-ghost">Naar de resultaten →</Link>
          </div>
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
            { n: '1', icon: '✨', title: 'Maak (of laat maken)', text: 'Kies een widgettype en vul je inhoud in — of plak bronmateriaal in de AI-studio en kijk de voorzet na.' },
            { n: '2', icon: '📤', title: 'Deel', text: 'Geef je leerlingen de code van 6 tekens of stuur hen de deellink. Cursussen deel je zelfs per hoofdstuk.' },
            { n: '3', icon: '📊', title: 'Volg op', text: 'Scores per leerdoel, antwoorden per leerling, leesvoortgang per sectie. Beoordeel open vragen in de nakijkcockpit.' },
          ].map((s) => (
            <div key={s.n} className="card card-pad" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem' }} aria-hidden>{s.icon}</div>
              <h3>{s.n}. {s.title}</h3>
              <p style={{ color: 'var(--text-soft)', margin: 0 }}>{s.text}</p>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: 30, fontSize: '0.88rem' }}>
          💾 Alles wordt lokaal in je browser opgeslagen — geen account nodig. Alleen als jij de
          AI-assistent gebruikt, gaat je bronmateriaal naar de door jou gekozen AI-aanbieder.{' '}
          <Link to="/privacy">Lees hoe we met gegevens omgaan</Link>.
        </p>
      </section>
    </div>
  );
}
