import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Question, QuestionType, SourcePane, SplitWorksheetConfig } from '../lib/types';
import { gradeQuiz } from '../lib/grading';
import { shuffled, uid } from '../lib/utils';
import { CheckRow, Field, ImagePicker } from '../components/ui';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';
import { makeQuestion, QUESTION_TYPES, questionLabel, QuestionView } from './quiz';

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/** Vraagtypes die deze compacte editor zelf kan bewerken. */
const EDITABLE_TYPES: ReadonlySet<QuestionType> = new Set(['mc', 'tf', 'short', 'long']);

const SOURCE_KINDS: { kind: SourcePane['kind']; icon: string; label: string }[] = [
  { kind: 'text', icon: '📄', label: 'Tekst' },
  { kind: 'image', icon: '🖼️', label: 'Afbeelding' },
  { kind: 'video', icon: '🎬', label: 'Video' },
];

function sourceKindLabel(kind: SourcePane['kind']): string {
  return kind === 'text' ? 'Leestekst' : kind === 'image' ? 'Afbeelding' : 'Video';
}

/** YouTube-id uit een URL of los id halen. Geeft null als er niets herkend wordt. */
function extractYouTubeId(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Is het bronpaneel bruikbaar ingevuld? */
function sourceIsFilled(source: SourcePane | undefined): source is SourcePane {
  if (!source) return false;
  if (source.kind === 'text') return !!source.text?.trim();
  if (source.kind === 'image') return !!source.imageUrl;
  return !!source.videoUrl?.trim();
}

/** Heeft de leerling deze vraag beantwoord? (zelfde logica als de quiz) */
function isAnswered(q: Question, v: unknown): boolean {
  if (q.type === 'info') return true;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return q.type === 'order' ? true : v.some((x) => x !== null && x !== undefined && x !== '');
  return true;
}

/** Volgt of het venster smaller is dan maxWidth px (voor de gestapelde layout). */
function useIsNarrow(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return narrow;
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

function CompactQuestionEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  switch (q.type) {
    case 'mc':
      return (
        <div>
          {q.options.map((opt, i) => (
            <div className="option-row" key={i}>
              <input
                type="radio"
                checked={q.correctIndex === i}
                aria-label={`Antwoordoptie ${i + 1} is juist`}
                title="Markeer als juist antwoord"
                style={{ width: 18, height: 18, accentColor: 'var(--ok)' }}
                onChange={() => onChange({ ...q, correctIndex: i })}
              />
              <input
                className="input input-sm"
                value={opt}
                placeholder={`Antwoordoptie ${i + 1}`}
                onChange={(e) => {
                  const options = q.options.slice();
                  options[i] = e.target.value;
                  onChange({ ...q, options });
                }}
              />
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label="Optie verwijderen"
                disabled={q.options.length <= 2}
                onClick={() => {
                  const options = q.options.filter((_, j) => j !== i);
                  const correctIndex = q.correctIndex === i ? 0 : q.correctIndex > i ? q.correctIndex - 1 : q.correctIndex;
                  onChange({ ...q, options, correctIndex });
                }}
              >✕</button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...q, options: [...q.options, ''] })}>
            + Optie toevoegen
          </button>
          <p className="hint" style={{ marginTop: 6 }}>Vink het juiste antwoord aan.</p>
        </div>
      );
    case 'tf':
      return (
        <Field label="Juiste antwoord">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${q.answer ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...q, answer: true })}>Juist</button>
            <button className={`btn btn-sm ${!q.answer ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...q, answer: false })}>Onjuist</button>
          </div>
        </Field>
      );
    case 'short':
      return (
        <>
          <Field label="Juiste antwoorden" hint="Elk aanvaard antwoord op een eigen regel.">
            <textarea
              className="textarea"
              rows={2}
              value={q.accepted.join('\n')}
              onChange={(e) => onChange({ ...q, accepted: e.target.value.split('\n') })}
            />
          </Field>
          <CheckRow
            checked={q.caseSensitive}
            onChange={(caseSensitive) => onChange({ ...q, caseSensitive })}
            label="Hoofdlettergevoelig"
          />
        </>
      );
    case 'long':
      return (
        <Field label="Modelantwoord (alleen zichtbaar voor jou)" hint="Open vragen beoordeel je achteraf zelf bij de resultaten.">
          <textarea className="textarea" rows={3} value={q.modelAnswer ?? ''} onChange={(e) => onChange({ ...q, modelAnswer: e.target.value })} />
        </Field>
      );
    default: {
      const meta = QUESTION_TYPES.find((t) => t.type === q.type);
      return (
        <div className="callout warn" style={{ marginBottom: 0 }}>
          <span aria-hidden>🛠️</span>
          <div>
            Het vraagtype <strong>{meta?.name ?? q.type}</strong> kun je in het gesplitste werkblad niet bewerken.
            Voor de leerling werkt de vraag wél gewoon; bewerken doe je via een quiz-widget.
          </div>
        </div>
      );
    }
  }
}

export function SplitWorksheetEditor({ config, onChange }: EditorProps<SplitWorksheetConfig>) {
  const source: SourcePane = config.source ?? { kind: 'text' };
  const questions: Question[] = config.questions ?? [];
  const [addOpen, setAddOpen] = useState(false);

  const setSource = (s: SourcePane) => onChange({ ...config, source: s });
  const update = (i: number, q: Question) => {
    const next = questions.slice();
    next[i] = q;
    onChange({ ...config, questions: next });
  };

  const videoId = source.kind === 'video' ? extractYouTubeId(source.videoUrl ?? '') : null;

  return (
    <div>
      {/* ── Bronpaneel ── */}
      <div className="editor-item">
        <div className="editor-item-head">
          <span aria-hidden>📌</span>
          <strong style={{ fontSize: '0.9rem' }}>Bronpaneel</strong>
        </div>
        <div className="editor-item-body">
          <Field label="Soort bron">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SOURCE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  className={`btn btn-sm ${source.kind === k.kind ? 'btn-primary' : 'btn-ghost'}`}
                  aria-pressed={source.kind === k.kind}
                  onClick={() => setSource({ ...source, kind: k.kind })}
                >
                  <span aria-hidden>{k.icon}</span> {k.label}
                </button>
              ))}
            </div>
            <span className="hint">
              De leerling ziet de bron links naast de vragen. Op een smal scherm staat de bron bovenaan en is ze inklapbaar.
            </span>
          </Field>

          <Field label="Titel van de bron (optioneel)">
            <input
              className="input input-sm"
              value={source.title ?? ''}
              placeholder="bv. Fragment uit een dagboek"
              onChange={(e) => setSource({ ...source, title: e.target.value })}
            />
          </Field>

          {source.kind === 'text' && (
            <Field label="Brontekst" hint="Mag meerdere alinea's bevatten; witregels blijven behouden.">
              <textarea
                className="textarea"
                rows={8}
                value={source.text ?? ''}
                placeholder="Plak of typ hier de leestekst…"
                onChange={(e) => setSource({ ...source, text: e.target.value })}
              />
            </Field>
          )}

          {source.kind === 'image' && (
            <ImagePicker
              value={source.imageUrl}
              onChange={(imageUrl) => setSource({ ...source, imageUrl })}
              label="Bronafbeelding"
            />
          )}

          {source.kind === 'video' && (
            <Field label="Video-URL (YouTube)" hint="Plak een YouTube-link, bv. https://www.youtube.com/watch?v=… of https://youtu.be/…">
              <input
                className="input"
                type="url"
                value={source.videoUrl ?? ''}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => setSource({ ...source, videoUrl: e.target.value })}
              />
              {!!source.videoUrl?.trim() && (
                <span
                  className="hint"
                  role="status"
                  style={{ color: videoId ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}
                >
                  {videoId ? '✓ Video herkend — wordt privacyvriendelijk ingesloten.' : '⚠ Geen YouTube-video herkend in deze link.'}
                </span>
              )}
            </Field>
          )}
        </div>
      </div>

      {/* ── Vragen ── */}
      <h3 style={{ margin: '18px 0 10px' }}>Vragen bij de bron</h3>
      {questions.map((q, i) => (
        <div className="editor-item" key={q.id}>
          <ItemHeader
            index={i}
            label={questionLabel(q)}
            canUp={i > 0}
            canDown={i < questions.length - 1}
            onMoveUp={() => onChange({ ...config, questions: moveItem(questions, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, questions: moveItem(questions, i, i + 1) })}
            onDelete={() => onChange({ ...config, questions: questions.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const copy = JSON.parse(JSON.stringify(q)) as Question;
              copy.id = uid();
              const next = questions.slice();
              next.splice(i + 1, 0, copy);
              onChange({ ...config, questions: next });
            }}
          />
          <div className="editor-item-body">
            <Field label="Vraag">
              <textarea
                className="textarea"
                rows={2}
                value={q.prompt}
                placeholder="Typ hier je vraag over de bron…"
                onChange={(e) => update(i, { ...q, prompt: e.target.value })}
              />
            </Field>
            <CompactQuestionEditor q={q} onChange={(nq) => update(i, nq)} />
            {EDITABLE_TYPES.has(q.type) && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                  Extra: afbeelding, punten & feedback
                </summary>
                <div style={{ paddingTop: 10 }}>
                  <ImagePicker value={q.imageUrl} onChange={(imageUrl) => update(i, { ...q, imageUrl })} />
                  <Field label="Punten">
                    <input
                      className="input input-sm" type="number" min={0} step="0.5" value={q.points} style={{ maxWidth: 110 }}
                      onChange={(e) => update(i, { ...q, points: Math.max(0, parseFloat(e.target.value) || 0) })}
                    />
                  </Field>
                  <Field label="Uitleg bij feedback" hint="Wordt getoond nadat de leerling heeft ingediend (als feedback aanstaat).">
                    <textarea className="textarea" rows={2} value={q.explanation ?? ''} onChange={(e) => update(i, { ...q, explanation: e.target.value })} />
                  </Field>
                </div>
              </details>
            )}
          </div>
        </div>
      ))}

      {questions.length === 0 && (
        <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: '14px 0' }}>
          Nog geen vragen. Voeg je eerste vraag over de bron toe. 👇
        </p>
      )}

      <div style={{ position: 'relative' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen} aria-haspopup="menu">
          + Vraag toevoegen
        </button>
        {addOpen && (
          <div
            className="card"
            style={{
              position: 'absolute', zIndex: 30, marginTop: 8, padding: 8, width: 320,
              display: 'grid', gap: 2, boxShadow: 'var(--shadow-2)',
            }}
            role="menu"
          >
            {QUESTION_TYPES.filter((t) => EDITABLE_TYPES.has(t.type)).map((t) => (
              <button
                key={t.type}
                role="menuitem"
                className="btn btn-quiet"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => {
                  onChange({ ...config, questions: [...questions, makeQuestion(t.type)] });
                  setAddOpen(false);
                }}
              >
                <span aria-hidden>{t.icon}</span>
                <span style={{ textAlign: 'left' }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{t.name}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: 400 }}>{t.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Meer vraagtypes nodig (invullen, koppelen, rangschikken…)? Maak daarvoor een gewone quiz of een werkblad.
      </p>
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

function SourceContent({ source }: { source: SourcePane }) {
  if (source.kind === 'image' && source.imageUrl) {
    return (
      <img
        src={source.imageUrl}
        alt={source.title?.trim() || 'Bronafbeelding'}
        style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }}
      />
    );
  }
  if (source.kind === 'video' && source.videoUrl) {
    const id = extractYouTubeId(source.videoUrl);
    if (!id) {
      return (
        <div className="callout warn" style={{ marginBottom: 0 }}>
          <span aria-hidden>🎬</span>
          <div>
            Deze video kan niet ingesloten worden.{' '}
            <a href={source.videoUrl} target="_blank" rel="noreferrer">Open de video in een nieuw tabblad.</a>
          </div>
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={source.title?.trim() || 'Bronvideo'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{source.text}</div>;
}

function SourcePanel({
  source, narrow, open, onToggle,
}: {
  source: SourcePane;
  narrow: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  const title = source.title?.trim() || sourceKindLabel(source.kind);
  const showContent = !narrow || open;
  return (
    <section
      className="card"
      aria-label={`Bron: ${title}`}
      style={{ borderTop: '4px solid var(--player-accent, var(--brand))', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
        <span className="badge badge-brand">Bron</span>
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </strong>
        {narrow && (
          <button
            className="btn btn-quiet btn-sm"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={onToggle}
          >
            {open ? 'Inklappen ▲' : 'Tonen ▼'}
          </button>
        )}
      </div>
      {showContent && (
        <div id={contentId} style={{ padding: '0 18px 18px' }}>
          <SourceContent source={source} />
        </div>
      )}
    </section>
  );
}

export function SplitWorksheetPlayer({ widget, timeUp, onComplete }: PlayerProps<SplitWorksheetConfig>) {
  const questions = useMemo<Question[]>(() => {
    const all = widget.config.questions ?? [];
    return widget.settings.shuffle ? shuffled(all) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id]);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ReturnType<typeof gradeQuiz> | null>(null);
  const [sourceOpen, setSourceOpen] = useState(true);
  const submittedRef = useRef(false);
  const narrow = useIsNarrow(800);

  const source = widget.config.source ?? { kind: 'text' as const };
  const hasSource = sourceIsFilled(source);

  const gradable: Question[] = questions.filter((q) => q.type !== 'info');
  const answeredCount = gradable.filter((q) => isAnswered(q, answers[q.id])).length;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const res = gradeQuiz({ questions, layout: 'scroll' }, answers);
    setResult(res);
    onComplete({ answers, itemScores: res.itemScores, earned: res.earned, max: res.max, hasPending: res.hasPending });
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (timeUp && !submittedRef.current && questions.length > 0) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (questions.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Dit werkblad bevat nog geen vragen. Vraag je leerkracht om vragen toe te voegen.
      </p>
    );
  }

  // ── Klaar: resultaat + eventueel feedbackoverzicht ──
  if (result) {
    const review = widget.settings.showFeedback;
    return (
      <div>
        <ResultHero
          earned={result.earned}
          max={result.max}
          showScore={widget.settings.showScore}
          hasPending={result.hasPending}
        />
        {review && (
          <div style={{ marginTop: 22 }}>
            {hasSource && (
              <details className="card card-pad" style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                  📌 Bron opnieuw bekijken
                </summary>
                <div style={{ marginTop: 12 }}>
                  <SourceContent source={source} />
                </div>
              </details>
            )}
            <h2 style={{ textAlign: 'center' }}>Overzicht van je antwoorden</h2>
            {questions.map((q) => (
              <QuestionView
                key={q.id}
                q={q}
                index={gradable.indexOf(q)}
                total={gradable.length}
                value={answers[q.id]}
                onChange={() => {}}
                review
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Bezig: bron links (sticky) of bovenaan (inklapbaar), vragen ernaast/eronder ──
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: hasSource && !narrow ? 'minmax(280px, 5fr) minmax(0, 7fr)' : 'minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {hasSource && (
        <div
          style={
            narrow
              ? undefined
              : { position: 'sticky', top: 74, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }
          }
        >
          <SourcePanel
            source={source}
            narrow={narrow}
            open={sourceOpen}
            onToggle={() => setSourceOpen((v) => !v)}
          />
        </div>
      )}
      <div>
        {!hasSource && (
          <div className="callout" style={{ marginBottom: 16 }}>
            <span aria-hidden>ℹ️</span>
            <div>Er is nog geen bron ingesteld; je kunt de vragen gewoon beantwoorden.</div>
          </div>
        )}
        {questions.map((q) => (
          <QuestionView
            key={q.id}
            q={q}
            index={gradable.indexOf(q)}
            total={gradable.length}
            value={answers[q.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            review={false}
          />
        ))}
        <div className="player-nav">
          <span role="status" aria-live="polite" style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            {answeredCount} van {gradable.length} beantwoord
          </span>
          <button className="btn btn-primary btn-lg" onClick={submit}>Indienen ✓</button>
        </div>
      </div>
    </div>
  );
}
