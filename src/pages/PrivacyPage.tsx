import React, { useState } from 'react';
import { getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import { ConfirmModal, useToast } from '../components/ui';

/** Transparantiepagina: welke data staat waar, en hoe ruim je ze op (AVG). */
export function PrivacyPage() {
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);
  const [confirm, setConfirm] = useState<null | 'subs' | 'all'>(null);
  const toast = useToast();

  const widgets = getWidgets();
  const subs = getSubmissions();
  const names = new Set(subs.map((s) => s.studentName));

  const wipeSubmissions = () => {
    localStorage.removeItem('wf.submissions.v1');
    localStorage.removeItem('wf.attempts.v1');
    localStorage.removeItem('wf.live.v1');
    localStorage.removeItem('wf.courseprogress.v1');
    Object.keys(localStorage)
      .filter((k) => k.startsWith('wf.autosave.') || k.startsWith('wf.coursename.'))
      .forEach((k) => localStorage.removeItem(k));
    // storage-laag opnieuw laten emitten
    localStorage.setItem('wf.submissions.v1', '[]');
    toast('Alle leerlinggegevens gewist', 'ok');
  };

  const wipeAll = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('wf.'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('wf.prefs.v1', JSON.stringify({ theme: 'auto', teacherName: '', seeded: true }));
    toast('Alles gewist', 'ok');
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>🔒 Privacy &amp; gegevens</h1>
          <p className="sub">Transparant over wat deze app bewaart — en hoe je het opruimt.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => window.print()}>🖨 Afdrukken voor directie/ouders</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Waar staan de gegevens?</h3>
        <p>
          <strong>Alles staat uitsluitend in de browser van dit toestel</strong> (localStorage).
          Er is geen server, geen account en er wordt <strong>niets naar het internet verstuurd</strong>.
          Deellinks bevatten de oefening zelf (vragen en antwoorden), nooit leerlingresultaten —
          behalve wanneer een leerling bewust zijn <em>resultaatcode</em> of <em>voortgangscode</em> doorstuurt.
        </p>
        <h3>Wat wordt bewaard?</h3>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Widgets</strong> ({widgets.length}): jouw oefeningen, inclusief afbeeldingen.</li>
          <li><strong>Cursussen &amp; leesvoortgang</strong>: je cursusinhoud en, per leerling(naam), welke secties gelezen zijn en hoelang.</li>
          <li><strong>Inzendingen</strong> ({subs.length}, van {names.size} {names.size === 1 ? 'naam' : 'verschillende namen'}): naam, antwoorden, score, tijdstip en duur.</li>
          <li><strong>Tussentijds werk</strong>: automatisch opgeslagen antwoorden zodat leerlingen kunnen hervatten.</li>
          <li><strong>Voorkeuren</strong>: thema en weergave-instellingen.</li>
        </ul>
        <h3>En de AI-assistent?</h3>
        <p>
          De AI-functies zijn <strong>uit</strong> tot jij zelf een API-sleutel instelt. Gebruik je ze,
          dan vertrekt <strong>alleen wat jij intikt of plakt</strong> (bronmateriaal, leerplandoelen,
          vragen en — bij een feedbackvoorstel — het antwoord van een leerling <em>zonder naam</em>)
          rechtstreeks van je browser naar de door jou gekozen AI-aanbieder, onder diens voorwaarden.
          Stuur nooit namen of gevoelige leerlinggegevens mee. Je sleutel en het gebruikslogboek staan
          alleen op dit toestel — beheer ze bij de <a href="#/ai-instellingen">AI-instellingen</a>.
        </p>
        <h3>Tips voor dataminimalisatie</h3>
        <ul style={{ paddingLeft: 20 }}>
          <li>Een <strong>voornaam of klasnummer volstaat</strong> — vraag geen volledige namen als het niet hoeft.</li>
          <li>Wis inzendingen <strong>op het einde van het schooljaar</strong> of zodra je ze verwerkt hebt.</li>
          <li>CSV-exports met namen bevatten persoonsgegevens: bewaar ze volgens de afspraken van je school en mail ze niet onversleuteld door.</li>
          <li>Op een <strong>gedeeld klas­toestel</strong>: wis regelmatig de leerlinggegevens hieronder.</li>
        </ul>
      </div>

      <div className="card card-pad">
        <h3>🧹 Gegevens opruimen</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-danger" onClick={() => setConfirm('subs')} disabled={subs.length === 0}>
            Alle inzendingen &amp; leerlinggegevens wissen ({subs.length})
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm('all')}>
            Alles wissen (ook widgets)
          </button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Individuele inzendingen wis je bij de resultaten van elke widget (🗑 naast de rij).
        </p>
      </div>

      {confirm === 'subs' && (
        <ConfirmModal
          title="Alle leerlinggegevens wissen?"
          message={`${subs.length} inzendingen, pogingtellers en tussentijds opgeslagen werk worden definitief verwijderd. Je widgets blijven bestaan.`}
          onConfirm={wipeSubmissions}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'all' && (
        <ConfirmModal
          title="Alles wissen?"
          message="Alle widgets, mappen, inzendingen en instellingen op dit toestel worden definitief verwijderd. Exporteer eerst wat je wil bewaren."
          onConfirm={wipeAll}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
