// ── Leerstof: overzicht ─────────────────────────────────────────────────────
//
// Een apart onderdeel van de app, met een andere gebruiker dan de rest: hier
// houdt een ouder of leerling bij wát er voor de volgende toets gekend moet
// zijn. De volgorde is dus geen alfabet maar een agenda: de eerstvolgende
// toets staat bovenaan, met het aantal dagen erbij.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { StudyProgress, StudyTopic } from '../lib/studyTypes';
import {
  countdown, overallMastery, sortTopics, STATE_LABEL, studyState, usedLearners, usedSubjects,
} from '../lib/studyTypes';
import {
  adoptTopics, createTopic, deleteTopic, duplicateTopic, exportAllTopicsJson, exportTopicJson,
  getAllProgress, getTopics, importTopicsJson, saveTopic,
} from '../lib/study';
import { onStorageChange } from '../lib/storage';
import { downloadFile, formatDateShort } from '../lib/utils';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { STUDY_CSS } from '../components/study/studyStyles';

const VAK_EMOJI: { test: RegExp; emoji: string }[] = [
  { test: /wisk|reken|meetk/i, emoji: '📐' },
  { test: /neder|taal|frans|engels|duits|latijn/i, emoji: '🔤' },
  { test: /aardr/i, emoji: '🌍' },
  { test: /gesch/i, emoji: '🏛️' },
  { test: /bio|natuur|weten|fysic|chemie/i, emoji: '🔬' },
  { test: /techn|ict|inform/i, emoji: '⚙️' },
  { test: /sport|lo\b/i, emoji: '🤸' },
  { test: /muziek|kunst|beeld/i, emoji: '🎨' },
];

export function suggestEmoji(vak: string): string {
  return VAK_EMOJI.find((v) => v.test.test(vak))?.emoji ?? '📘';
}

export function StudyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [progress, setProgress] = useState<StudyProgress[]>([]);
  const [leerling, setLeerling] = useState<string>('alle');
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [verwijderen, setVerwijderen] = useState<StudyTopic | null>(null);
  const [toonArchief, setToonArchief] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const herlaad = () => {
    setTopics(getTopics());
    setProgress(getAllProgress());
  };

  useEffect(() => {
    // De voorbeeldleerstof staat in een eigen module: die hoeft alleen
    // opgehaald te worden door wie deze pagina echt opent.
    let levend = true;
    void import('../lib/studySeed').then((m) => {
      m.seedStudyIfEmpty();
      if (levend) herlaad();
    });
    herlaad();
    const off = onStorageChange(herlaad);
    return () => { levend = false; off(); };
  }, []);

  const leerlingen = useMemo(() => usedLearners(topics), [topics]);
  const zichtbaar = useMemo(() => {
    const gefilterd = topics.filter((t) => (leerling === 'alle' || t.leerling === leerling) && (toonArchief || !t.gearchiveerd));
    return sortTopics(gefilterd);
  }, [topics, leerling, toonArchief]);

  const standVan = (id: string) => progress.find((p) => p.topicId === id);
  const archiefAantal = topics.filter((t) => t.gearchiveerd).length;

  const importeer = async (f: File) => {
    const rows = importTopicsJson(await f.text());
    if (!rows) {
      toast('Dit is geen geldig leerstofbestand', 'err');
      return;
    }
    adoptTopics(rows);
    toast(`${rows.length} onderde${rows.length === 1 ? 'el' : 'len'} ingelezen`, 'ok');
  };

  return (
    <div className="page">
      <style>{STUDY_CSS}</style>
      <div className="page-head">
        <div>
          <h1>📖 Leerstof</h1>
          <p className="sub">
            Per toets bijhouden wat er gekend moet zijn: samenvatting, begrippen, valkuilen en overhoorvragen.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>📥 Inlezen</button>
          <input
            ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importeer(f); e.target.value = ''; }}
          />
          {topics.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => { void exportAllTopicsJson(topics).then((json) => downloadFile('leerstof-backup.json', json)); }}
              title="Alle leerstof als back-upbestand bewaren"
            >
              💾 Back-up
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setNieuwOpen(true)}>➕ Nieuw onderdeel</button>
        </div>
      </div>

      {leerlingen.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${leerling === 'alle' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLeerling('alle')}
          >
            Iedereen
          </button>
          {leerlingen.map((naam) => (
            <button
              key={naam}
              className={`btn btn-sm ${leerling === naam ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setLeerling(naam)}
            >
              {naam}
            </button>
          ))}
        </div>
      )}

      {zichtbaar.length === 0 ? (
        <EmptyState icon="📖" title={topics.length === 0 ? 'Nog geen leerstof' : 'Niets te zien met deze filter'}>
          <p>
            Maak een onderdeel per toets: titel, vak en datum volstaan om te starten.
            Daarna vul je aan wat er gekend moet zijn — en overhoor je jezelf.
          </p>
          <button className="btn btn-primary" onClick={() => setNieuwOpen(true)}>➕ Nieuw onderdeel</button>
        </EmptyState>
      ) : (
        <div className="study-grid">
          {zichtbaar.map((topic) => {
            const stand = standVan(topic.id);
            const mastery = overallMastery(topic, stand);
            const cd = countdown(topic.toetsDatum);
            const state = studyState(topic, stand);
            return (
              <div
                key={topic.id}
                className="card study-card"
                style={{ '--study-accent': topic.kleur } as React.CSSProperties}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }} aria-hidden>{topic.emoji}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3>{topic.titel}</h3>
                    <p className="bron">
                      {[topic.vak, topic.leerling].filter(Boolean).join(' · ')}
                      {topic.bron ? ` · ${topic.bron}` : ''}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {cd ? (
                    <span className={`study-chip study-chip-${cd.toon}`}>
                      📅 Toets {cd.label}
                    </span>
                  ) : (
                    <span className="study-chip">📅 Nog geen datum</span>
                  )}
                  <span className={`study-chip${state === 'klaar' ? ' study-chip-ok' : ''}`}>
                    {STATE_LABEL[state]}
                  </span>
                  {topic.gearchiveerd && <span className="study-chip study-chip-voorbij">Gearchiveerd</span>}
                </div>

                <div>
                  <div className="study-meter" role="img" aria-label={`${mastery.percent} procent gekend`}>
                    <div style={{ width: `${mastery.percent}%` }} />
                  </div>
                  <p className="bron" style={{ marginTop: 5 }}>
                    {mastery.gekend} van {mastery.totaal} onderdelen gekend ({mastery.percent}%) ·
                    {' '}bijgewerkt {formatDateShort(topic.updatedAt)}
                  </p>
                </div>

                <div className="study-card-actions">
                  <Link to={`/leerstof/${topic.id}`} className="btn btn-sm btn-primary">📚 Studeren</Link>
                  <Link to={`/leerstof/bewerk/${topic.id}`} className="btn btn-sm btn-ghost">✏️ Bewerken</Link>
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={() => { saveTopic(duplicateTopic(topic)); toast('Gedupliceerd', 'ok'); }}
                    title="Kopie maken (bv. om volgend jaar te hergebruiken)"
                  >
                    📄
                  </button>
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={() => { void exportTopicJson(topic).then((json) => downloadFile(`${topic.titel || 'leerstof'}.json`, json)); }}
                    title="Exporteren als bestand"
                  >
                    💾
                  </button>
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={() => { saveTopic({ ...topic, gearchiveerd: !topic.gearchiveerd }); }}
                    title={topic.gearchiveerd ? 'Terug in het overzicht zetten' : 'Archiveren (toets is geweest)'}
                  >
                    {topic.gearchiveerd ? '↩️' : '📦'}
                  </button>
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={() => setVerwijderen(topic)}
                    aria-label={`Leerstof "${topic.titel}" verwijderen`}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archiefAantal > 0 && (
        <p style={{ marginTop: 18 }}>
          <button className="btn btn-sm btn-quiet" onClick={() => setToonArchief((v) => !v)}>
            {toonArchief ? 'Archief verbergen' : `📦 Archief tonen (${archiefAantal})`}
          </button>
        </p>
      )}

      <div className="card card-pad" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Hoe werkt dit?</h3>
        <ol style={{ paddingLeft: 20, margin: 0, color: 'var(--text-soft)' }}>
          <li><strong>Maak een onderdeel</strong> per toets, met het vak en de datum.</li>
          <li><strong>Vul in wat gekend moet zijn</strong>: doelen, samenvatting, begrippen, valkuilen en overhoorvragen. Foto’s van cursusbladzijden kan je toevoegen; die blijven op dit toestel.</li>
          <li><strong>Studeer en overhoor</strong>: bij elke vraag zeg je eerlijk of je het wist. Het overzicht toont hoe ver het staat.</li>
        </ol>
      </div>

      {nieuwOpen && (
        <NieuwOnderdeelModal
          leerlingen={leerlingen}
          vakken={usedSubjects(topics)}
          onClose={() => setNieuwOpen(false)}
          onCreate={(velden) => {
            const topic = createTopic({ ...velden, emoji: suggestEmoji(velden.vak) });
            saveTopic(topic);
            navigate(`/leerstof/bewerk/${topic.id}`);
          }}
        />
      )}
      {verwijderen && (
        <ConfirmModal
          title="Leerstof verwijderen?"
          message={`"${verwijderen.titel}" en de studievoortgang worden definitief verwijderd. Exporteer het onderdeel eerst als je het wil bewaren.`}
          onConfirm={() => { deleteTopic(verwijderen.id); toast('Verwijderd', 'ok'); }}
          onClose={() => setVerwijderen(null)}
        />
      )}
    </div>
  );
}

interface NieuwVelden { titel: string; vak: string; leerling: string; toetsDatum?: string }

function NieuwOnderdeelModal({
  leerlingen, vakken, onClose, onCreate,
}: {
  leerlingen: string[];
  vakken: string[];
  onClose: () => void;
  onCreate: (velden: NieuwVelden) => void;
}) {
  const [titel, setTitel] = useState('');
  const [vak, setVak] = useState(vakken[0] ?? '');
  const [leerling, setLeerling] = useState(leerlingen[0] ?? '');
  const [datum, setDatum] = useState('');
  const geldig = titel.trim().length > 0;
  const maak = () => {
    if (!geldig) return;
    onCreate({
      titel: titel.trim(),
      vak: vak.trim(),
      leerling: leerling.trim(),
      toetsDatum: datum || undefined,
    });
  };
  return (
    <Modal
      title="Nieuw leerstofonderdeel"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!geldig} onClick={maak}>Aanmaken</button>
        </>
      }
    >
      <Field label="Titel" hint="Meestal de titel van het hoofdstuk of de module.">
        <input
          className="input" value={titel} autoFocus
          onChange={(e) => setTitel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') maak(); }}
          placeholder="bv. Transformaties van het vlak en symmetrie"
        />
      </Field>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Field label="Vak">
          <input
            className="input" value={vak} list="wf-vakken"
            onChange={(e) => setVak(e.target.value)}
            placeholder="bv. Wiskunde"
          />
        </Field>
        <Field label="Voor wie">
          <input
            className="input" value={leerling} list="wf-leerlingen"
            onChange={(e) => setLeerling(e.target.value)}
            placeholder="bv. Will"
          />
        </Field>
        <Field label="Toetsdatum" hint="Mag je later invullen.">
          <input className="input" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </Field>
      </div>
      <datalist id="wf-vakken">{vakken.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="wf-leerlingen">{leerlingen.map((v) => <option key={v} value={v} />)}</datalist>
    </Modal>
  );
}
