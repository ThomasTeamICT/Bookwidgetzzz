// ── Leerstof: studeren ──────────────────────────────────────────────────────
//
// De pagina waar de leerling zit. Vier tabbladen, één doel: weten wat je nog
// niet kent. Overhoren gebeurt met zelfbeoordeling ("wist ik" / "nog niet") —
// bij wiskunde is een antwoord vaak een tekening of een redenering, en dan is
// een tekstvergelijking eerder een straf dan een controle. De foute vragen
// kan je meteen opnieuw doen; dat is de kern van het effect.

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { StudyProgress, StudyQuestion, StudyTerm, StudyTopic } from '../lib/studyTypes';
import {
  countdown, overallMastery, questionMastery, termMastery,
} from '../lib/studyTypes';
import { getProgress, getTopic, recordAnswer, recordSession, resetProgress, toggleGoal } from '../lib/study';
import { onStorageChange } from '../lib/storage';
import { renderMarkdown } from '../lib/markdown';
import { formatDateShort, shuffled } from '../lib/utils';
import { EmptyState, Modal, useToast } from '../components/ui';
import { StudyFigure } from '../components/study/StudyFigure';
import { STUDY_CSS } from '../components/study/studyStyles';

type Tab = 'samenvatting' | 'begrippen' | 'overhoren' | 'fotos';

const TABS: { id: Tab; label: string }[] = [
  { id: 'samenvatting', label: '📖 Samenvatting' },
  { id: 'begrippen', label: '🔤 Begrippen' },
  { id: 'overhoren', label: '✍️ Overhoren' },
  { id: 'fotos', label: '📸 Foto’s' },
];

export function StudyTopicPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<StudyTopic | undefined>(() => (id ? getTopic(id) : undefined));
  const [progress, setProgress] = useState<StudyProgress | undefined>(() => (id ? getProgress(id) : undefined));
  const [tab, setTab] = useState<Tab>('samenvatting');

  useEffect(() => {
    if (!id) return;
    const herlaad = () => {
      setTopic(getTopic(id));
      setProgress(getProgress(id));
    };
    herlaad();
    return onStorageChange(herlaad);
  }, [id]);

  if (!topic) {
    return (
      <div className="page">
        <EmptyState icon="📖" title="Deze leerstof bestaat niet (meer)">
          <Link to="/leerstof" className="btn btn-primary">← Naar het overzicht</Link>
        </EmptyState>
      </div>
    );
  }

  const mastery = overallMastery(topic, progress);
  const cd = countdown(topic.toetsDatum);

  return (
    <div className="page" style={{ '--study-accent': topic.kleur } as React.CSSProperties}>
      <style>{STUDY_CSS}</style>

      <p style={{ marginBottom: 10 }}>
        <Link to="/leerstof" className="btn btn-sm btn-quiet">← Alle leerstof</Link>
      </p>

      <div className="study-head">
        <span style={{ fontSize: '2.2rem', lineHeight: 1 }} aria-hidden>{topic.emoji}</span>
        <div style={{ minWidth: 240, flex: 1 }}>
          <h1>{topic.titel}</h1>
          <p className="meta">
            {[topic.vak, topic.leerling].filter(Boolean).join(' · ')}
            {topic.bron ? ` · ${topic.bron}` : ''}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {cd ? (
              <span className={`study-chip study-chip-${cd.toon}`}>📅 Toets {cd.label}</span>
            ) : (
              <span className="study-chip">📅 Nog geen toetsdatum</span>
            )}
            <span className="study-chip">{mastery.percent}% gekend</span>
            {progress?.laatstGestudeerd && (
              <span className="study-chip">Laatst gestudeerd {formatDateShort(progress.laatstGestudeerd)}</span>
            )}
          </div>
        </div>
        <div className="study-head-side">
          <button className="btn btn-sm btn-ghost" onClick={() => window.print()}>🖨 Afdrukken</button>
          <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/leerstof/bewerk/${topic.id}`)}>✏️ Bewerken</button>
        </div>
      </div>

      <div className="study-tabs" role="tablist" aria-label="Onderdelen van deze leerstof">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id} type="button"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'samenvatting' && <Samenvatting topic={topic} progress={progress} />}
      {tab === 'begrippen' && <BegrippenTab topic={topic} progress={progress} />}
      {tab === 'overhoren' && <OverhoorTab topic={topic} progress={progress} />}
      {tab === 'fotos' && <FotoTab topic={topic} />}
    </div>
  );
}

// ── Samenvatting ────────────────────────────────────────────────────────────

function Samenvatting({ topic, progress }: { topic: StudyTopic; progress: StudyProgress | undefined }) {
  const afgevinkt = progress?.doelen ?? [];
  return (
    <>
      {topic.doelen.length > 0 && (
        <div className="card study-section">
          <h3>✅ Wat moet ik kennen?</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Vink af wat je echt kan uitleggen of tekenen — niet wat je al eens gelezen hebt.
          </p>
          {topic.doelen.map((doel) => (
            <label key={doel.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={afgevinkt.includes(doel.id)}
                onChange={(e) => toggleGoal(topic.id, doel.id, e.target.checked)}
              />
              <span>{doel.tekst}</span>
            </label>
          ))}
        </div>
      )}

      {topic.valkuilen.length > 0 && (
        <div className="card study-section">
          <h3>⚠️ Let op deze valkuilen</h3>
          {topic.valkuilen.map((v) => (
            <div key={v.id} className="study-pitfall">
              <span aria-hidden>⚠️</span>
              {/* Ook hier mag opmaak: een valkuil draait vaak om één woord (over, kleine, midden). */}
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(v.tekst) }} />
            </div>
          ))}
        </div>
      )}

      {topic.secties.map((sectie) => (
        <div key={sectie.id} className="card study-section">
          <h3>
            {sectie.titel}
            {sectie.todo && <span className="study-chip study-chip-dichtbij" style={{ marginLeft: 8 }}>nog aanvullen</span>}
          </h3>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(sectie.markdown) }} />
          {sectie.figuur && <StudyFigure kind={sectie.figuur} />}
        </div>
      ))}

      {topic.notaties.length > 0 && (
        <div className="card study-section">
          <h3>✍️ Notaties: zo lees en schrijf je het</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="study-notation">
              <thead>
                <tr><th>In symbolen</th><th>Lees je als</th></tr>
              </thead>
              <tbody>
                {topic.notaties.map((n) => (
                  <tr key={n.id}><td>{n.symbool}</td><td>{n.betekenis}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topic.notitie && (
        <div className="card study-section">
          <h3>🗒️ Notitie</h3>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(topic.notitie) }} />
        </div>
      )}

      {topic.secties.length === 0 && topic.doelen.length === 0 && (
        <EmptyState icon="📝" title="Nog niets ingevuld">
          <p>Voeg de samenvatting, begrippen en overhoorvragen toe in het bewerkscherm.</p>
          <Link to={`/leerstof/bewerk/${topic.id}`} className="btn btn-primary">✏️ Leerstof invullen</Link>
        </EmptyState>
      )}
    </>
  );
}

// ── Overhoren: gedeelde motor voor vragen én begrippen ──────────────────────

interface Kaart { id: string; voorkant: string; achterkant: string; extra?: string; bron?: string }

function OverhoorMotor({
  topicId, soort, kaarten, leegIcon, leegTitel, leegTekst, topicEditId,
}: {
  topicId: string;
  soort: 'vragen' | 'begrippen';
  kaarten: Kaart[];
  leegIcon: string;
  leegTitel: string;
  leegTekst: string;
  topicEditId: string;
}) {
  const toast = useToast();
  const [ronde, setRonde] = useState<Kaart[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [getoond, setGetoond] = useState(false);
  const [fout, setFout] = useState<Kaart[]>([]);
  const [goed, setGoed] = useState(0);
  const [klaar, setKlaar] = useState(false);

  const start = (lijst: Kaart[], schud = true) => {
    if (lijst.length === 0) return;
    setRonde(schud ? shuffled(lijst) : lijst);
    setIdx(0);
    setGetoond(false);
    setFout([]);
    setGoed(0);
    setKlaar(false);
  };

  const beoordeel = (juist: boolean) => {
    if (!ronde) return;
    const kaart = ronde[idx];
    recordAnswer(topicId, soort, kaart.id, juist);
    const nieuweFout = juist ? fout : [...fout, kaart];
    const nieuwGoed = goed + (juist ? 1 : 0);
    setFout(nieuweFout);
    setGoed(nieuwGoed);
    if (idx + 1 >= ronde.length) {
      recordSession(topicId, { at: Date.now(), soort, goed: nieuwGoed, totaal: ronde.length });
      setKlaar(true);
      return;
    }
    setIdx(idx + 1);
    setGetoond(false);
  };

  if (kaarten.length === 0) {
    return (
      <EmptyState icon={leegIcon} title={leegTitel}>
        <p>{leegTekst}</p>
        <Link to={`/leerstof/bewerk/${topicEditId}`} className="btn btn-primary">✏️ Toevoegen</Link>
      </EmptyState>
    );
  }

  if (klaar && ronde) {
    const percent = Math.round((goed / ronde.length) * 100);
    return (
      <div className="card study-section" style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.3rem' }}>
          {percent === 100 ? '🎉 Alles juist!' : percent >= 70 ? '👍 Goed bezig' : '💪 Nog even oefenen'}
        </h3>
        <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '4px 0 2px' }}>{goed} / {ronde.length}</p>
        <p className="hint">Je zei zelf dat je {goed} van de {ronde.length} wist.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          {fout.length > 0 && (
            <button className="btn btn-primary" onClick={() => start(fout)}>
              🔁 Alleen de {fout.length} foute opnieuw
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => start(kaarten)}>↻ Alles opnieuw</button>
          <button
            className="btn btn-quiet"
            onClick={() => { setRonde(null); toast('Voortgang bewaard', 'ok'); }}
          >
            Stoppen
          </button>
        </div>
      </div>
    );
  }

  if (!ronde) {
    return (
      <div className="card study-section" style={{ textAlign: 'center' }}>
        <h3>Klaar om te overhoren?</h3>
        <p className="hint">
          Je krijgt {kaarten.length} kaart{kaarten.length === 1 ? '' : 'en'} in willekeurige volgorde.
          Denk eerst zelf na, toon dan het antwoord en zeg eerlijk of je het wist.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => start(kaarten)}>▶️ Starten</button>
      </div>
    );
  }

  const kaart = ronde[idx];
  return (
    <>
      <div className="progressbar" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(idx / ronde.length) * 100}%` }} />
      </div>
      <div className="card study-quiz-card">
        <p className="hint" style={{ margin: 0 }}>
          {idx + 1} van {ronde.length}{kaart.bron ? ` · ${kaart.bron}` : ''}
        </p>
        <p className="study-quiz-prompt">{kaart.voorkant}</p>
        {getoond ? (
          <>
            <div className="study-quiz-answer">
              <strong>Antwoord</strong>
              {kaart.achterkant}
              {kaart.extra ? `\n\n${kaart.extra}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-danger" onClick={() => beoordeel(false)}>✗ Wist ik niet</button>
              <button className="btn btn-primary" onClick={() => beoordeel(true)}>✓ Wist ik</button>
            </div>
          </>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={() => setGetoond(true)}>Toon het antwoord</button>
        )}
      </div>
      <p style={{ textAlign: 'center', marginTop: 12 }}>
        <button className="btn btn-sm btn-quiet" onClick={() => setRonde(null)}>Stoppen</button>
      </p>
    </>
  );
}

// ── Begrippen ───────────────────────────────────────────────────────────────

function BegrippenTab({ topic, progress }: { topic: StudyTopic; progress: StudyProgress | undefined }) {
  const [modus, setModus] = useState<'lijst' | 'overhoren'>('lijst');
  const stand = termMastery(topic, progress);
  const kaarten = useMemo<Kaart[]>(
    () => topic.begrippen.map((b: StudyTerm) => ({ id: b.id, voorkant: b.term, achterkant: b.uitleg })),
    [topic.begrippen]
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <span className="study-chip">{stand.gekend} van {stand.totaal} gekend</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className={`btn btn-sm ${modus === 'lijst' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setModus('lijst')}
          >
            📋 Lijst
          </button>
          <button
            className={`btn btn-sm ${modus === 'overhoren' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setModus('overhoren')}
          >
            🃏 Flitskaarten
          </button>
        </div>
      </div>

      {modus === 'overhoren' ? (
        <OverhoorMotor
          topicId={topic.id}
          topicEditId={topic.id}
          soort="begrippen"
          kaarten={kaarten}
          leegIcon="🔤"
          leegTitel="Nog geen begrippen"
          leegTekst="Zet hier de woorden uit de wiskundetaal- of woordenlijst van het hoofdstuk."
        />
      ) : topic.begrippen.length === 0 ? (
        <EmptyState icon="🔤" title="Nog geen begrippen">
          <p>Zet hier de woorden die je moet kunnen uitleggen.</p>
          <Link to={`/leerstof/bewerk/${topic.id}`} className="btn btn-primary">✏️ Toevoegen</Link>
        </EmptyState>
      ) : (
        <div className="card study-section">
          <div style={{ overflowX: 'auto' }}>
            <table className="study-notation">
              <thead><tr><th>Begrip</th><th>Wat het betekent</th><th>Gekend</th></tr></thead>
              <tbody>
                {topic.begrippen.map((b) => {
                  const gekend = progress?.begrippen[b.id]?.gekend;
                  return (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'inherit' }}>{b.term}</td>
                      <td>{b.uitleg}</td>
                      <td>{gekend ? '✅' : progress?.begrippen[b.id] ? '🔁' : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Overhoorvragen ──────────────────────────────────────────────────────────

function OverhoorTab({ topic, progress }: { topic: StudyTopic; progress: StudyProgress | undefined }) {
  const toast = useToast();
  const stand = questionMastery(topic, progress);
  const kaarten = useMemo<Kaart[]>(
    () => topic.vragen.map((v: StudyQuestion) => ({
      id: v.id, voorkant: v.vraag, achterkant: v.antwoord, extra: v.uitleg, bron: v.bron,
    })),
    [topic.vragen]
  );
  const sessies = progress?.sessies.filter((s) => s.soort === 'vragen') ?? [];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <span className="study-chip">{stand.gekend} van {stand.totaal} gekend</span>
        {sessies.length > 0 && (
          <span className="study-chip">
            Vorige beurt: {sessies[0].goed}/{sessies[0].totaal}
          </span>
        )}
        {(progress?.laatstGestudeerd || sessies.length > 0) && (
          <button
            className="btn btn-sm btn-quiet"
            style={{ marginLeft: 'auto' }}
            onClick={() => { resetProgress(topic.id); toast('Voortgang gewist — je begint opnieuw', 'ok'); }}
          >
            ↺ Voortgang wissen
          </button>
        )}
      </div>

      <OverhoorMotor
        topicId={topic.id}
        topicEditId={topic.id}
        soort="vragen"
        kaarten={kaarten}
        leegIcon="✍️"
        leegTitel="Nog geen overhoorvragen"
        leegTekst="Voeg vragen toe met hun antwoord: dan kan je jezelf (of iemand anders je) overhoren."
      />

      {sessies.length > 1 && (
        <div className="card study-section" style={{ marginTop: 16 }}>
          <h3>📈 Vorige beurten</h3>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {sessies.slice(0, 8).map((s, i) => (
              <li key={`${s.at}-${i}`}>
                {formatDateShort(s.at)}: {s.goed}/{s.totaal} gekend
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ── Foto's ──────────────────────────────────────────────────────────────────

function FotoTab({ topic }: { topic: StudyTopic }) {
  const [groot, setGroot] = useState<string | null>(null);
  if (topic.fotos.length === 0) {
    return (
      <EmptyState icon="📸" title="Nog geen foto’s">
        <p>
          Voeg foto’s van de cursusbladzijden toe in het bewerkscherm. Ze blijven op dit toestel
          staan (browseropslag) en worden nergens naartoe gestuurd.
        </p>
        <Link to={`/leerstof/bewerk/${topic.id}`} className="btn btn-primary">📷 Foto’s toevoegen</Link>
      </EmptyState>
    );
  }
  return (
    <>
      <div className="study-photo-grid">
        {topic.fotos.map((foto, i) => (
          <figure key={foto.id} className="card study-photo">
            <button
              type="button"
              onClick={() => setGroot(foto.url)}
              style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in', display: 'block', width: '100%' }}
              aria-label={`Foto ${i + 1} vergroten${foto.bijschrift ? `: ${foto.bijschrift}` : ''}`}
            >
              <img src={foto.url} alt={foto.bijschrift || `Cursusbladzijde ${i + 1}`} />
            </button>
            {foto.bijschrift && <figcaption>{foto.bijschrift}</figcaption>}
          </figure>
        ))}
      </div>
      {groot && (
        <Modal title="Foto" onClose={() => setGroot(null)} wide>
          <img src={groot} alt="Vergrote cursusbladzijde" style={{ width: '100%', borderRadius: 8 }} />
        </Modal>
      )}
    </>
  );
}
