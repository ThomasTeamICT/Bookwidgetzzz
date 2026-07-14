import React from 'react';
import { Link } from 'react-router-dom';

/** Aan-de-slag-gids + veelgestelde vragen, in mensentaal. */
export function HelpPage() {
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>🧭 Aan de slag</h1>
          <p className="sub">In drie stappen van bronmateriaal naar een les die zichzelf opvolgt.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', marginBottom: 26 }}>
        {[
          {
            icon: '✨', title: '1. Maak',
            text: 'Plak een hoofdstuk of je leerplandoelen in de AI-studio en kijk de voorzet na — of bouw zelf vanaf nul met 38 widgettypes en de cursusbouwer.',
            links: [{ to: '/ai-studio', label: 'AI-studio' }, { to: '/nieuw', label: 'Zelf bouwen' }],
          },
          {
            icon: '📤', title: '2. Deel',
            text: 'In de klas volstaat de code van 6 tekens. Voor thuis is er de draagbare link: alles zit in de link zelf, dus er is geen account of installatie nodig.',
            links: [{ to: '/widgets', label: 'Mijn widgets' }, { to: '/cursussen', label: 'Cursussen' }],
          },
          {
            icon: '📊', title: '3. Volg op',
            text: 'Scores per leerdoel, distractor-analyse, nakijkcockpit voor open vragen en leesvoortgang per cursussectie — met AI-feedbacksuggesties waar dat helpt.',
            links: [{ to: '/resultaten', label: 'Resultaten' }],
          },
        ].map((s) => (
          <div key={s.title} className="card card-pad">
            <div style={{ fontSize: '1.9rem' }} aria-hidden>{s.icon}</div>
            <h3>{s.title}</h3>
            <p style={{ color: 'var(--text-soft)' }}>{s.text}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {s.links.map((l) => (
                <Link key={l.to} to={l.to} className="btn btn-sm btn-ghost">{l.label} →</Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ marginBottom: 12 }}>Veelgestelde vragen</h2>
      <div style={{ display: 'grid', gap: 8, marginBottom: 30 }}>
        {[
          {
            q: '💾 Waar staan mijn gegevens?',
            a: 'Alles staat lokaal in de browser van dit toestel — er is geen server en geen account. Dat betekent ook: een ander toestel of een andere browser ziet je widgets niet vanzelf. Exporteer belangrijke widgets of cursussen als bestand (back-up!) of deel ze via de draagbare link.',
          },
          {
            q: '✨ Wat kost de AI-assistent?',
            a: 'De app zelf is gratis; de AI werkt met jouw eigen API-sleutel bij Anthropic of OpenAI, en die aanbieder rekent per gebruikte token af (typisch enkele centen per generatie). Bij AI-instellingen zie je een logboek van elk gebruik. Zonder sleutel werkt de hele app gewoon — alleen de ✨-functies staan dan uit.',
          },
          {
            q: '🏠 Hoe krijg ik thuiswerk binnen?',
            a: 'Wie thuis via de draagbare link werkt, houdt resultaten op het eigen toestel. Daarvoor zijn er codes: na een oefening kopieert de leerling zijn resultaatcode, na (een stuk) cursus zijn voortgangscode. Die plak jij bij Resultaten of bij het voortgangsoverzicht — klaar. Handig via je leeromgeving of e-mail.',
          },
          {
            q: '🎓 Hebben leerlingen een account nodig?',
            a: 'Nee. Een voornaam volstaat (en zelfs dat kan je uitschakelen). Er wordt bewust zo weinig mogelijk gevraagd — zie de privacypagina voor het volledige plaatje, inclusief een printbare uitleg voor directie of ouders.',
          },
          {
            q: '🏫 Werkt dit in Smartschool of Moodle?',
            a: 'Ja: elke widget en cursus heeft in het deelvenster een insluitcode (iframe) die je in een pagina van je leeromgeving plakt. De gewone deellink werkt uiteraard ook overal waar je een link kwijt kan.',
          },
          {
            q: '👩‍🏫 Hoe deel ik met collega\'s?',
            a: 'Exporteer een widget of cursus als JSON-bestand, of deel een hele map in één keer als vakgroeppakket (dashboard → map → "Map delen"). Je collega importeert het bestand en heeft meteen alles, inclusief ingebedde oefeningen.',
          },
          {
            q: '↩️ Kan ik terug naar een vorige versie?',
            a: 'De app bewaart geen versiegeschiedenis; exporteer daarom vóór grote ingrepen (zoals een AI-herwerking) even een back-upbestand — de AI-herwerkmodal heeft daar een knop voor. Importeren zet de back-up terug (met bevestiging).',
          },
          {
            q: '🧹 De opslag zit vol — wat nu?',
            a: 'Grote afbeeldingen en audio-opnames zijn meestal de boosdoener. Verklein of verwijder ze, wis oude inzendingen via de privacypagina, of exporteer oude widgets naar een bestand en verwijder ze uit de app.',
          },
        ].map((item) => (
          <details key={item.q} className="card" style={{ padding: '12px 16px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{item.q}</summary>
            <p style={{ margin: '8px 0 0', color: 'var(--text-soft)' }}>{item.a}</p>
          </details>
        ))}
      </div>

      <div className="callout">
        <span aria-hidden>🔒</span>
        <div>
          Alles over gegevens, AVG en de opschoonknoppen vind je op de{' '}
          <Link to="/privacy">privacypagina</Link> — inclusief wat er precies gebeurt als je de
          AI-assistent gebruikt.
        </div>
      </div>
    </div>
  );
}
