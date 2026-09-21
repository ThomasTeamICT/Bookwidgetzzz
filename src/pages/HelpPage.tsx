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
            q: '👥 Hoe werk ik met een klas op meerdere toestellen?',
            a: 'Maak bij Klassen een klas (plak je klaslijst) en geef opdrachten (een cursus of widget, met deadline). Deel dan de klaslink of de QR-code: op elk toestel opent die de leerlinghub, waar de leerling zijn naam kiest en zijn opdrachten ziet. Resultaten en leesvoortgang komen terug als code: de leerling toont de QR-code in de sectie Inleveren, jij scant ze op het Inleverpunt (of plakt de codes in bulk). Het klasoverzicht telt alles op per leerling, ook per leerplandoel.',
          },
          {
            q: '🎯 Hoe bouw ik een cursus die het leerplan dekt?',
            a: 'Maak eerst een leerplan bij Leerplannen: plak de doelen of lees de pdf in; de AI zet ze om in een doelenlijst met codes (officiële nummering blijft staan). Kies dan bij Cursussen "Blanco vanuit leerplan", vink de doelen aan en laat de AI-cursusbouwer een cursus maken waarin elk doel in een sectie zit. De dekkingsmatrix in de editor toont wat gedekt is; de knop "Vul de hiaten" schrijft secties voor wat nog ontbreekt.',
          },
          {
            q: '📄 Ik heb al cursusmateriaal in Word of pdf. Hoe krijg ik dat erin?',
            a: 'Ga naar Importeren (ook via de knop op de widgetpagina): sleep je .docx, pdf, markdown of tekst erin. Je ziet de tekst en kiest wat je ermee doet: een cursus laten bouwen met AI (optioneel gekoppeld aan een leerplan), oefeningen laten maken in de AI-studio, of zonder AI omzetten naar een cursus waarbij koppen hoofdstukken en secties worden. Daarna pas je alles aan in de editor en kan je het met de optimaliseer-knop vereenvoudigen, differentiëren of controlevragen laten toevoegen.',
          },
          {
            q: '📚 Mijn cursus is één pdf per hoofdstuk. Kan dat in één keer?',
            a: 'Ja. Kies bij Importeren alle pdf\'s tegelijk (in de goede volgorde), geef de cursus een titel en klik "Samenvoegen tot één cursus": elk bestand wordt een hoofdstuk. Uit een pdf haalt de app de titels (op lettergrootte), vet, opsommingen en vette labels als "Voorbeeld:" of "Oefening:" — die worden kadertjes — en een begrippenlijst wordt een termenblok. Alleen de afbeeldingen reizen niet mee: die voeg je daarna toe met een afbeeldingsblok. Wil je eerst zien hoe zoiets eruitziet? Klik bij Cursussen op "Voorbeeldcursus laden": een echte cursus natuurwetenschappen van 14 hoofdstukken die precies zo binnenkwam.',
          },
          {
            q: '🧹 De opslag zit vol — wat nu?',
            a: 'Afbeeldingen, audio en bijlagen staan sinds kort apart in de bestandsopslag van de browser (IndexedDB, honderden MB), dus die vullen de kleine tekstopslag niet meer. Zit ze toch vol, dan zijn oude inzendingen (met tekeningen en audio-antwoorden) meestal de boosdoener: wis ze via de privacypagina, of exporteer oude widgets naar een bestand en verwijder ze uit de app.',
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
