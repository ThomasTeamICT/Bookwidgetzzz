// ── Leerstof: invullen ──────────────────────────────────────────────────────
//
// Dit scherm wordt op een doordeweekse avond gebruikt, met het werkboek naast
// het toetsenbord. Daarom: alles op één pagina, lijstjes met "+ rij", en
// automatisch bewaren — geen bewaarknop die je kan vergeten.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  StudyFigureKind, StudyGoal, StudyNotation, StudyPhoto, StudyPitfall, StudyQuestion,
  StudySection, StudyTerm, StudyTopic,
} from '../lib/studyTypes';
import { FIGURE_LABEL, countdown } from '../lib/studyTypes';
import { getTopic, saveTopic } from '../lib/study';
import { fileToMediaUrl, uid } from '../lib/utils';
import { ConfirmModal, EmptyState, Field, useToast } from '../components/ui';
import { STUDY_CSS } from '../components/study/studyStyles';

const EMOJIS = ['📘', '📐', '🔤', '🌍', '🏛️', '🔬', '⚙️', '🎨', '🤸', '🎵', '💻', '🧪'];
const KLEUREN = ['#4f46e5', '#e2725b', '#16a34a', '#8b5cf6', '#d97706', '#0e9aa7', '#db2777'];

function moveItem<T>(arr: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  const [x] = copy.splice(i, 1);
  copy.splice(j, 0, x);
  return copy;
}

/** Kop van een lijstblok met knopjes om te verplaatsen en te verwijderen. */
function RijKnoppen({
  index, aantal, onMove, onDelete, label,
}: {
  index: number; aantal: number; onMove: (delta: number) => void; onDelete: () => void; label: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
      <button
        className="btn btn-sm btn-quiet btn-icon" onClick={() => onMove(-1)} disabled={index === 0}
        aria-label={`${label} omhoog`}
      >
        ↑
      </button>
      <button
        className="btn btn-sm btn-quiet btn-icon" onClick={() => onMove(1)} disabled={index === aantal - 1}
        aria-label={`${label} omlaag`}
      >
        ↓
      </button>
      <button className="btn btn-sm btn-quiet btn-icon" onClick={onDelete} aria-label={`${label} verwijderen`}>🗑</button>
    </div>
  );
}

export function StudyEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const origineel = useMemo(() => (id ? getTopic(id) : undefined), [id]);
  const [topic, setTopic] = useState<StudyTopic | undefined>(origineel);
  const [bewaarStand, setBewaarStand] = useState<'rust' | 'bezig' | 'bewaard'>('rust');
  const [wisFoto, setWisFoto] = useState<string | null>(null);
  const fotoInput = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const laatste = useRef<StudyTopic | undefined>(undefined);

  // Automatisch bewaren met een korte adempauze; bij het verlaten van de
  // pagina wordt de laatste stand alsnog weggeschreven.
  const plan = useCallback((next: StudyTopic) => {
    laatste.current = next;
    setBewaarStand('bezig');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (laatste.current) saveTopic(laatste.current);
      laatste.current = undefined;
      setBewaarStand('bewaard');
    }, 700);
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (laatste.current) saveTopic(laatste.current);
  }, []);

  const patch = useCallback((fn: (t: StudyTopic) => StudyTopic) => {
    setTopic((huidig) => {
      if (!huidig) return huidig;
      const next = fn(huidig);
      plan(next);
      return next;
    });
  }, [plan]);

  if (!topic) {
    return (
      <div className="page">
        <EmptyState icon="📖" title="Deze leerstof bestaat niet (meer)">
          <Link to="/leerstof" className="btn btn-primary">← Naar het overzicht</Link>
        </EmptyState>
      </div>
    );
  }

  // ── Lijsthulpjes ─────────────────────────────────────────────────────────
  const lijstPatch = <K extends 'doelen' | 'secties' | 'notaties' | 'begrippen' | 'valkuilen' | 'vragen' | 'fotos'>(
    sleutel: K,
    fn: (lijst: StudyTopic[K]) => StudyTopic[K]
  ) => patch((t) => ({ ...t, [sleutel]: fn(t[sleutel]) }) as StudyTopic);

  const voegFotos = async (files: FileList) => {
    const nieuwe: StudyPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      nieuwe.push({ id: uid(), url: await fileToMediaUrl(file), bijschrift: '' });
    }
    if (nieuwe.length === 0) {
      toast('Geen afbeeldingen gevonden in die selectie', 'err');
      return;
    }
    lijstPatch('fotos', (l) => [...l, ...nieuwe]);
    toast(`${nieuwe.length} foto${nieuwe.length === 1 ? '' : '’s'} toegevoegd`, 'ok');
  };

  const cd = countdown(topic.toetsDatum);

  return (
    <div className="page page-narrow" style={{ '--study-accent': topic.kleur } as React.CSSProperties}>
      <style>{STUDY_CSS}</style>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Link to="/leerstof" className="btn btn-sm btn-quiet">← Alle leerstof</Link>
        <span className="hint" aria-live="polite">
          {bewaarStand === 'bezig' ? 'Bewaren…' : bewaarStand === 'bewaard' ? '✓ Bewaard' : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={() => navigate(`/leerstof/${topic.id}`)}>
            📚 Studeerweergave
          </button>
        </div>
      </div>

      {/* ── Kop ─────────────────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <Field label="Titel">
          <input
            className="input" value={topic.titel}
            onChange={(e) => patch((t) => ({ ...t, titel: e.target.value }))}
            placeholder="bv. Transformaties van het vlak en symmetrie"
          />
        </Field>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Vak">
            <input className="input" value={topic.vak} onChange={(e) => patch((t) => ({ ...t, vak: e.target.value }))} />
          </Field>
          <Field label="Voor wie">
            <input className="input" value={topic.leerling} onChange={(e) => patch((t) => ({ ...t, leerling: e.target.value }))} />
          </Field>
          <Field label="Toetsdatum" hint={cd ? `Toets ${cd.label}.` : 'Nog niet ingevuld.'}>
            <input
              className="input" type="date" value={topic.toetsDatum ?? ''}
              onChange={(e) => patch((t) => ({ ...t, toetsDatum: e.target.value || undefined }))}
            />
          </Field>
        </div>
        <Field label="Bron" hint="Boek, module en bladzijden — handig om terug te vinden.">
          <input
            className="input" value={topic.bron ?? ''}
            onChange={(e) => patch((t) => ({ ...t, bron: e.target.value || undefined }))}
            placeholder="bv. NANDO 2 — Meetkunde, module 01, blz. 3-9"
          />
        </Field>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Icoon</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {EMOJIS.map((e) => (
                <button
                  key={e} className={`btn btn-sm ${topic.emoji === e ? 'btn-primary' : 'btn-quiet'}`}
                  onClick={() => patch((t) => ({ ...t, emoji: e }))} aria-label={`Icoon ${e}`}
                  aria-pressed={topic.emoji === e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Kleur</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {KLEUREN.map((k) => (
                <button
                  key={k}
                  onClick={() => patch((t) => ({ ...t, kleur: k }))}
                  aria-label={`Kleur ${k}`}
                  aria-pressed={topic.kleur === k}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', background: k, cursor: 'pointer',
                    border: topic.kleur === k ? '3px solid var(--text)' : '1px solid var(--line)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Doelen ──────────────────────────────────────────────────────── */}
      <Blok
        titel="✅ Wat moet ik kennen?"
        uitleg="Korte, afvinkbare doelen. Dit is meteen de checklist van de leerling."
        onAdd={() => lijstPatch('doelen', (l) => [...l, { id: uid(), tekst: '' } as StudyGoal])}
        addLabel="+ Doel"
      >
        {topic.doelen.map((doel, i) => (
          <div key={doel.id} className="study-editor-row">
            <input
              className="input" value={doel.tekst} placeholder="bv. De vier transformaties herkennen en benoemen"
              onChange={(e) => lijstPatch('doelen', (l) => l.map((d) => (d.id === doel.id ? { ...d, tekst: e.target.value } : d)))}
            />
            <RijKnoppen
              index={i} aantal={topic.doelen.length} label="Doel"
              onMove={(d) => lijstPatch('doelen', (l) => moveItem(l, i, d))}
              onDelete={() => lijstPatch('doelen', (l) => l.filter((x) => x.id !== doel.id))}
            />
          </div>
        ))}
      </Blok>

      {/* ── Samenvatting ────────────────────────────────────────────────── */}
      <Blok
        titel="📖 Samenvatting"
        uitleg="Eén blok per stukje theorie. Opmaak mag: **vet**, *cursief*, - lijstjes en ## tussenkoppen."
        onAdd={() => lijstPatch('secties', (l) => [...l, { id: uid(), titel: '', markdown: '' } as StudySection])}
        addLabel="+ Stuk theorie"
      >
        {topic.secties.map((sectie, i) => (
          <div key={sectie.id} className="study-editor-block">
            <div className="study-editor-row">
              <input
                className="input" value={sectie.titel} placeholder="Titel, bv. 1.2 Translatie over een vector"
                onChange={(e) => lijstPatch('secties', (l) => l.map((s) => (s.id === sectie.id ? { ...s, titel: e.target.value } : s)))}
              />
              <RijKnoppen
                index={i} aantal={topic.secties.length} label="Stuk theorie"
                onMove={(d) => lijstPatch('secties', (l) => moveItem(l, i, d))}
                onDelete={() => lijstPatch('secties', (l) => l.filter((x) => x.id !== sectie.id))}
              />
            </div>
            <textarea
              className="textarea" value={sectie.markdown} rows={5} placeholder="De theorie in je eigen woorden…"
              onChange={(e) => lijstPatch('secties', (l) => l.map((s) => (s.id === sectie.id ? { ...s, markdown: e.target.value } : s)))}
            />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <label style={{ fontSize: '0.86rem', color: 'var(--text-soft)', display: 'flex', gap: 6, alignItems: 'center' }}>
                Tekening:
                <select
                  className="select input-sm" value={sectie.figuur ?? ''}
                  onChange={(e) => lijstPatch('secties', (l) => l.map((s) => (
                    s.id === sectie.id ? { ...s, figuur: (e.target.value || undefined) as StudyFigureKind | undefined } : s
                  )))}
                >
                  <option value="">geen</option>
                  {(Object.keys(FIGURE_LABEL) as StudyFigureKind[]).map((k) => (
                    <option key={k} value={k}>{FIGURE_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row" style={{ margin: 0 }}>
                <input
                  type="checkbox" checked={sectie.todo === true}
                  onChange={(e) => lijstPatch('secties', (l) => l.map((s) => (s.id === sectie.id ? { ...s, todo: e.target.checked } : s)))}
                />
                <span>Nog aan te vullen</span>
              </label>
            </div>
          </div>
        ))}
      </Blok>

      {/* ── Notaties ────────────────────────────────────────────────────── */}
      <Blok
        titel="✍️ Notaties"
        uitleg="Symbool en hoe je het leest — precies wat op een toets gevraagd wordt."
        onAdd={() => lijstPatch('notaties', (l) => [...l, { id: uid(), symbool: '', betekenis: '' } as StudyNotation])}
        addLabel="+ Notatie"
      >
        {topic.notaties.map((n, i) => (
          <div key={n.id} className="study-editor-row">
            <input
              className="input" style={{ flex: '0 0 34%', fontFamily: 'Consolas, monospace' }} value={n.symbool}
              placeholder="s_a(A) = A′"
              onChange={(e) => lijstPatch('notaties', (l) => l.map((x) => (x.id === n.id ? { ...x, symbool: e.target.value } : x)))}
            />
            <input
              className="input" value={n.betekenis} placeholder="A′ is het beeld van A door spiegeling om de as a"
              onChange={(e) => lijstPatch('notaties', (l) => l.map((x) => (x.id === n.id ? { ...x, betekenis: e.target.value } : x)))}
            />
            <RijKnoppen
              index={i} aantal={topic.notaties.length} label="Notatie"
              onMove={(d) => lijstPatch('notaties', (l) => moveItem(l, i, d))}
              onDelete={() => lijstPatch('notaties', (l) => l.filter((x) => x.id !== n.id))}
            />
          </div>
        ))}
      </Blok>

      {/* ── Begrippen ───────────────────────────────────────────────────── */}
      <Blok
        titel="🔤 Begrippen"
        uitleg="De woordenlijst van het hoofdstuk. Deze worden ook als flitskaarten overhoord."
        onAdd={() => lijstPatch('begrippen', (l) => [...l, { id: uid(), term: '', uitleg: '' } as StudyTerm])}
        addLabel="+ Begrip"
      >
        {topic.begrippen.map((b, i) => (
          <div key={b.id} className="study-editor-row">
            <input
              className="input" style={{ flex: '0 0 30%' }} value={b.term} placeholder="dekpunt"
              onChange={(e) => lijstPatch('begrippen', (l) => l.map((x) => (x.id === b.id ? { ...x, term: e.target.value } : x)))}
            />
            <input
              className="input" value={b.uitleg} placeholder="een punt dat zichzelf als beeld heeft"
              onChange={(e) => lijstPatch('begrippen', (l) => l.map((x) => (x.id === b.id ? { ...x, uitleg: e.target.value } : x)))}
            />
            <RijKnoppen
              index={i} aantal={topic.begrippen.length} label="Begrip"
              onMove={(d) => lijstPatch('begrippen', (l) => moveItem(l, i, d))}
              onDelete={() => lijstPatch('begrippen', (l) => l.filter((x) => x.id !== b.id))}
            />
          </div>
        ))}
      </Blok>

      {/* ── Valkuilen ───────────────────────────────────────────────────── */}
      <Blok
        titel="⚠️ Valkuilen"
        uitleg="Fouten uit verbeterde oefeningen horen hier: net die komen terug op de toets. **Vet** mag."
        onAdd={() => lijstPatch('valkuilen', (l) => [...l, { id: uid(), tekst: '' } as StudyPitfall])}
        addLabel="+ Valkuil"
      >
        {topic.valkuilen.map((v, i) => (
          <div key={v.id} className="study-editor-row">
            <input
              className="input" value={v.tekst} placeholder="bv. Een negatieve hoek betekent wijzerzin."
              onChange={(e) => lijstPatch('valkuilen', (l) => l.map((x) => (x.id === v.id ? { ...x, tekst: e.target.value } : x)))}
            />
            <RijKnoppen
              index={i} aantal={topic.valkuilen.length} label="Valkuil"
              onMove={(d) => lijstPatch('valkuilen', (l) => moveItem(l, i, d))}
              onDelete={() => lijstPatch('valkuilen', (l) => l.filter((x) => x.id !== v.id))}
            />
          </div>
        ))}
      </Blok>

      {/* ── Vragen ──────────────────────────────────────────────────────── */}
      <Blok
        titel="✍️ Overhoorvragen"
        uitleg="Vraag en antwoord. De leerling beoordeelt zelf of hij het wist."
        onAdd={() => lijstPatch('vragen', (l) => [...l, { id: uid(), vraag: '', antwoord: '' } as StudyQuestion])}
        addLabel="+ Vraag"
      >
        {topic.vragen.map((v, i) => (
          <div key={v.id} className="study-editor-block">
            <div className="study-editor-row">
              <span className="hint" style={{ flex: 'none', paddingTop: 8, minWidth: 26 }}>{i + 1}.</span>
              <textarea
                className="textarea" style={{ minHeight: 52 }} rows={2} value={v.vraag} placeholder="De vraag…"
                onChange={(e) => lijstPatch('vragen', (l) => l.map((x) => (x.id === v.id ? { ...x, vraag: e.target.value } : x)))}
              />
              <RijKnoppen
                index={i} aantal={topic.vragen.length} label="Vraag"
                onMove={(d) => lijstPatch('vragen', (l) => moveItem(l, i, d))}
                onDelete={() => lijstPatch('vragen', (l) => l.filter((x) => x.id !== v.id))}
              />
            </div>
            <textarea
              className="textarea" style={{ minHeight: 52 }} rows={2} value={v.antwoord} placeholder="Het antwoord…"
              onChange={(e) => lijstPatch('vragen', (l) => l.map((x) => (x.id === v.id ? { ...x, antwoord: e.target.value } : x)))}
            />
            <div className="study-editor-row" style={{ marginTop: 8, marginBottom: 0 }}>
              <input
                className="input input-sm" value={v.uitleg ?? ''} placeholder="Extra uitleg of geheugensteun (optioneel)"
                onChange={(e) => lijstPatch('vragen', (l) => l.map((x) => (x.id === v.id ? { ...x, uitleg: e.target.value || undefined } : x)))}
              />
              <input
                className="input input-sm" style={{ flex: '0 0 30%' }} value={v.bron ?? ''} placeholder="bv. oef. 6a, blz. 9"
                onChange={(e) => lijstPatch('vragen', (l) => l.map((x) => (x.id === v.id ? { ...x, bron: e.target.value || undefined } : x)))}
              />
            </div>
          </div>
        ))}
      </Blok>

      {/* ── Foto's ──────────────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>📸 Foto’s van de cursus</h3>
        <p className="hint" style={{ marginTop: -4 }}>
          Handig voor tekeningen en oefeningen die je niet uittikt. De foto’s blijven in de
          browseropslag van dít toestel: ze worden niet verstuurd en staan niet in een deellink.
        </p>
        <button className="btn btn-ghost" onClick={() => fotoInput.current?.click()}>📷 Foto’s kiezen…</button>
        <input
          ref={fotoInput} type="file" accept="image/*" multiple hidden
          onChange={(e) => { const f = e.target.files; if (f && f.length) void voegFotos(f); e.target.value = ''; }}
        />
        {topic.fotos.length > 0 && (
          <div className="study-photo-grid" style={{ marginTop: 14 }}>
            {topic.fotos.map((foto, i) => (
              <div key={foto.id} className="card study-photo">
                <img src={foto.url} alt={foto.bijschrift || `Cursusbladzijde ${i + 1}`} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    className="input input-sm" value={foto.bijschrift ?? ''} placeholder="Bijschrift, bv. blz. 9"
                    onChange={(e) => lijstPatch('fotos', (l) => l.map((x) => (x.id === foto.id ? { ...x, bijschrift: e.target.value } : x)))}
                  />
                  <button className="btn btn-sm btn-quiet btn-icon" onClick={() => setWisFoto(foto.id)} aria-label="Foto verwijderen">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notitie ─────────────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 40 }}>
        <h3 style={{ marginTop: 0 }}>🗒️ Notitie</h3>
        <textarea
          className="textarea" rows={3} value={topic.notitie ?? ''}
          placeholder="Bv. wat de leerkracht zei over de toets, of wat nog moet gevraagd worden."
          onChange={(e) => patch((t) => ({ ...t, notitie: e.target.value || undefined }))}
        />
      </div>

      {wisFoto && (
        <ConfirmModal
          title="Foto verwijderen?"
          message="De foto wordt uit dit onderdeel én uit de browseropslag gehaald."
          onConfirm={() => { lijstPatch('fotos', (l) => l.filter((f) => f.id !== wisFoto)); toast('Foto verwijderd', 'ok'); }}
          onClose={() => setWisFoto(null)}
        />
      )}
    </div>
  );
}

function Blok({
  titel, uitleg, addLabel, onAdd, children,
}: {
  titel: string; uitleg: string; addLabel: string; onAdd: () => void; children: React.ReactNode;
}) {
  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{titel}</h3>
      <p className="hint" style={{ marginTop: -4 }}>{uitleg}</p>
      {children}
      <button className="btn btn-sm btn-ghost" onClick={onAdd} style={{ marginTop: 6 }}>{addLabel}</button>
    </div>
  );
}
