import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Widget } from '../../lib/types';
import type { Course, CourseBlock } from '../../lib/courseTypes';
import { allSections } from '../../lib/courseTypes';
import { exportCourseJson } from '../../lib/courses';
import {
  buildNewCoursePrompt, buildReworkPrompt, buildSectionPrompt,
  sanitizeAIBlocks, sanitizeAICourse,
} from '../../lib/aiCourse';
import { askAI, extractJson } from '../../lib/ai';
import { AIErrorBox, AIGate, AIReviewNote, AIWorkingBox } from '../aiCommon';
import { Field, Modal, useToast } from '../ui';
import { downloadFile, uid } from '../../lib/utils';
import { saveWidget } from '../../lib/storage';

type Mode = 'new' | 'rework' | 'section';

const TITLES: Record<Mode, string> = {
  new: '✨ Cursus bouwen met AI (vanuit leerplandoelen)',
  rework: '✨ Cursus herwerken met AI',
  section: '✨ Sectie vullen met AI',
};

interface PreviewState {
  course: Course;
  /** Uitgelijnd op de hoofdstukken; null = quiz voor dat hoofdstuk viel af. */
  quizzes: (Widget | null)[];
  blocks?: CourseBlock[];
  warnings: string[];
}

export function CourseAIModal({
  mode, course, sectionId, onClose, onResult,
}: {
  mode: Mode;
  course?: Course;
  sectionId?: string;
  onClose: () => void;
  onResult: (course: Course) => void;
}) {
  const toast = useToast();
  // invoer (mode 'new')
  const [subject, setSubject] = useState('');
  const [audience, setAudience] = useState('');
  const [goals, setGoals] = useState('');
  const [chapterCount, setChapterCount] = useState(0);
  const [extraWishes, setExtraWishes] = useState('');
  const [withQuizzes, setWithQuizzes] = useState(true);
  // invoer (mode 'rework' / 'section')
  const [wishes, setWishes] = useState('');
  const [source, setSource] = useState('');
  const [insertMode, setInsertMode] = useState<'append' | 'replace'>('append');

  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // Sluiten (Escape, backdrop, ✕) tijdens het genereren moet de aanvraag
  // ook echt afbreken — anders loopt een 32k-token-stream onzichtbaar door.
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const section = useMemo(
    () => (course && sectionId ? allSections(course).map((x) => x.section).find((s) => s.id === sectionId) : undefined),
    [course, sectionId]
  );

  const canGenerate =
    mode === 'new' ? goals.trim().length > 0
    : mode === 'rework' ? Boolean(course)
    : Boolean(course && section);

  const generate = async () => {
    setError('');
    setPreview(null);
    setStream('');
    setBusy(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      let acc = '';
      const onDelta = (t: string) => { acc += t; setStream(acc); };
      if (mode === 'new') {
        const p = buildNewCoursePrompt({ goals, audience, subject, extraWishes, chapterCount, withQuizzes });
        const full = await askAI({ ...p, task: 'cursus uit leerplandoelen', maxTokens: 32000, onDelta, signal: ctrl.signal });
        const res = sanitizeAICourse(extractJson(full));
        setPreview({ ...res, warnings: res.warnings });
      } else if (mode === 'rework' && course) {
        const p = buildReworkPrompt({ course, wishes });
        const full = await askAI({ ...p, task: 'cursus herwerken', maxTokens: 32000, onDelta, signal: ctrl.signal });
        const res = sanitizeAICourse(extractJson(full), { base: course });
        setPreview({ ...res, warnings: res.warnings });
      } else if (mode === 'section' && course && section) {
        const p = buildSectionPrompt({ course, section, wishes, source });
        const full = await askAI({ ...p, task: 'sectie-inhoud', maxTokens: 8000, onDelta, signal: ctrl.signal });
        const blocks = sanitizeAIBlocks(extractJson(full));
        if (blocks.length === 0) {
          setError('De AI leverde geen bruikbare blokken op. Probeer het opnieuw met een duidelijkere omschrijving.');
        } else {
          setPreview({ course, quizzes: [], blocks, warnings: [] });
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  };

  const apply = () => {
    if (!preview) return;
    if (mode === 'section' && course && section && preview.blocks) {
      const updated: Course = {
        ...course,
        chapters: course.chapters.map((ch) => ({
          ...ch,
          sections: ch.sections.map((se) =>
            se.id === section.id
              ? { ...se, blocks: insertMode === 'replace' ? preview.blocks! : [...se.blocks, ...preview.blocks!] }
              : se
          ),
        })),
      };
      onResult(updated);
      toast(`✨ ${preview.blocks.length} blok(ken) ${insertMode === 'replace' ? 'geplaatst' : 'toegevoegd'}`, 'ok');
      onClose();
      return;
    }
    // 'new' / 'rework': eerst quizzes bewaren en per hoofdstuk inbedden
    // (positioneel: quiz i hoort bij hoofdstuk i; null = afgekeurde quiz)
    const result: Course = JSON.parse(JSON.stringify(preview.course));
    preview.quizzes.forEach((quiz, i) => {
      if (!quiz) return;
      saveWidget(quiz);
      const chapter = result.chapters[Math.min(i, result.chapters.length - 1)];
      const lastSection = chapter?.sections[chapter.sections.length - 1];
      if (lastSection) {
        lastSection.blocks.push({ id: uid(), type: 'widget', widgetId: quiz.id, note: 'Oefenquiz bij dit hoofdstuk' });
      }
    });
    onResult(result);
    toast(mode === 'new' ? '✨ Cursus aangemaakt — kijk alles na' : '✨ Herwerking toegepast — kijk alles na', 'ok');
    onClose();
  };

  const secCount = (c: Course) => c.chapters.reduce((a, ch) => a + ch.sections.length, 0);

  return (
    <Modal title={TITLES[mode]} onClose={onClose} wide>
      <AIGate>
        {!busy && !preview && (
          <div style={{ display: 'grid', gap: 4 }}>
            {mode === 'new' && (
              <>
                <div style={{ display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="Vak / onderwerp">
                    <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="bv. Natuurwetenschappen — de waterkringloop" />
                  </Field>
                  <Field label="Doelgroep">
                    <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="bv. 1e graad A-stroom" />
                  </Field>
                </div>
                <Field
                  label="Leerplandoelen (verplicht)"
                  hint="Plak hier de doelen uit je leerplan (bv. ZILL, GO!, OVSG, eindtermen). Ze vormen het skelet: elke sectie wordt eraan gekoppeld."
                >
                  <textarea className="textarea" rows={7} value={goals} onChange={(e) => setGoals(e.target.value)}
                    placeholder={'bv.\n• De leerlingen kunnen de fasen van de waterkringloop benoemen en uitleggen.\n• De leerlingen kunnen verdamping en condensatie onderzoeken met een eenvoudige proef.'} />
                </Field>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label="Aantal hoofdstukken" hint="0 = AI kiest">
                    <input className="input input-sm" type="number" min={0} max={12} style={{ maxWidth: 100 }}
                      value={chapterCount} onChange={(e) => setChapterCount(Math.max(0, parseInt(e.target.value) || 0))} />
                  </Field>
                  <Field label="Extra wensen (optioneel)">
                    <input className="input" value={extraWishes} onChange={(e) => setExtraWishes(e.target.value)}
                      placeholder="bv. veel voorbeelden uit het dagelijks leven" />
                  </Field>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={withQuizzes} onChange={(e) => setWithQuizzes(e.target.checked)} />
                  <span>✅ Per hoofdstuk ook een oefenquiz maken (aparte widgets, automatisch ingebed in de cursus)</span>
                </label>
              </>
            )}
            {mode === 'rework' && course && (
              <>
                <p className="hint" style={{ margin: 0 }}>
                  Huidige cursus: <strong>{course.title}</strong> — {course.chapters.length} hoofdstuk(ken), {secCount(course)} secties.
                  Mediablokken (afbeeldingen, video's, oefeningen) blijven behouden; leesvoortgang blijft geldig voor secties die in essentie dezelfde blijven.
                </p>
                <Field label="Wat moet er anders?">
                  <textarea className="textarea" rows={4} value={wishes} onChange={(e) => setWishes(e.target.value)}
                    placeholder="bv. verdeel in kleinere secties, voeg leerdoelen en controlevragen toe, eenvoudiger taal voor 1e graad" />
                </Field>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ justifySelf: 'start' }}
                  onClick={() => downloadFile(`${course.title || 'cursus'} (backup).json`, exportCourseJson(course))}
                >
                  💾 Eerst back-up downloaden
                </button>
              </>
            )}
            {mode === 'section' && section && (
              <>
                <Field label="Wat moet er in deze sectie komen?">
                  <textarea className="textarea" rows={3} value={wishes} onChange={(e) => setWishes(e.target.value)}
                    placeholder={`bv. uitleg over "${section.title}" met een begrippenlijst en een check-jezelf-lijstje`} />
                </Field>
                <Field label="Bronmateriaal (optioneel)" hint="Plak je eigen cursustekst; de AI blijft er dan strikt bij.">
                  <textarea className="textarea" rows={5} value={source} onChange={(e) => setSource(e.target.value)} />
                </Field>
              </>
            )}
            {error && <AIErrorBox error={error} onRetry={generate} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
              <button className="btn btn-ai" disabled={!canGenerate} onClick={generate}>✨ Genereren</button>
            </div>
          </div>
        )}

        {busy && (
          <AIWorkingBox
            streamText={stream}
            label={mode === 'section' ? 'De AI schrijft de sectie…' : 'De AI bouwt de cursus… (dit kan een minuut duren)'}
            onCancel={() => ctrlRef.current?.abort()}
          />
        )}

        {!busy && preview && (
          <div style={{ display: 'grid', gap: 12 }}>
            <AIReviewNote />
            {preview.warnings.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--warn)', fontSize: '0.88rem' }}>
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {mode === 'section' && preview.blocks ? (
              <>
                <div className="card" style={{ padding: 14 }}>
                  <strong>{preview.blocks.length} blok(ken) voor "{section?.title}"</strong>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.9rem', color: 'var(--text-soft)' }}>
                    {preview.blocks.map((b) => (
                      <li key={b.id}>
                        <code>{b.type}</code>
                        {' — '}
                        {(b.type === 'heading' && b.text) ||
                          (b.type === 'text' && b.markdown.slice(0, 90)) ||
                          (b.type === 'callout' && `${b.kind}: ${b.text.slice(0, 80)}`) ||
                          (b.type === 'checklist' && `${b.items.length} items`) ||
                          (b.type === 'terms' && `${b.items.length} begrippen`) ||
                          (b.type === 'accordion' && `${b.items.length} onderdelen`) ||
                          ''}
                      </li>
                    ))}
                  </ul>
                </div>
                {section && section.blocks.length > 0 && (
                  <div role="radiogroup" aria-label="Plaatsing" style={{ display: 'flex', gap: 16 }}>
                    <label className="checkbox-row">
                      <input type="radio" name="insert" checked={insertMode === 'append'} onChange={() => setInsertMode('append')} />
                      <span>Achteraan toevoegen</span>
                    </label>
                    <label className="checkbox-row">
                      <input type="radio" name="insert" checked={insertMode === 'replace'} onChange={() => setInsertMode('replace')} />
                      <span>Bestaande blokken vervangen</span>
                    </label>
                  </div>
                )}
              </>
            ) : (
              <div className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '1.6rem' }} aria-hidden>{preview.course.coverEmoji}</span>
                  <div>
                    <strong>{preview.course.title}</strong>
                    {preview.course.subtitle && <div className="hint">{preview.course.subtitle}</div>}
                  </div>
                </div>
                {mode === 'rework' && course && (
                  <p className="hint" style={{ margin: '0 0 8px' }}>
                    {course.chapters.length} → {preview.course.chapters.length} hoofdstukken · {secCount(course)} → {secCount(preview.course)} secties.
                    Controleer het resultaat; via je back-upbestand kan je altijd terug.
                  </p>
                )}
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {preview.course.chapters.map((ch) => (
                    <li key={ch.id} style={{ marginBottom: 6 }}>
                      <strong>{ch.emoji} {ch.title}</strong>
                      <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                        {ch.sections.map((se) => (
                          <li key={se.id}>
                            {se.title} · {se.blocks.length} blok(ken)
                            {se.optional && <em> (verdieping)</em>}
                            {se.goals?.length ? <span> · 🎯 {se.goals.length} doel(en)</span> : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                {preview.quizzes.some(Boolean) && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
                    🧩 {preview.quizzes.filter(Boolean).length} oefenquiz(zen):{' '}
                    {preview.quizzes
                      .filter((q): q is Widget => q !== null)
                      .map((q) => `"${q.title}" (${(q.config as { questions: unknown[] }).questions.length} vragen)`)
                      .join(' · ')}
                  </p>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>← Aanpassen</button>
              <button className="btn btn-ghost" onClick={generate}>↺ Opnieuw genereren</button>
              <button className="btn btn-primary" onClick={apply}>
                {mode === 'new' ? '✔ Cursus aanmaken' : mode === 'rework' ? '✔ Herwerking toepassen' : '✔ Toepassen'}
              </button>
            </div>
          </div>
        )}
      </AIGate>
    </Modal>
  );
}
