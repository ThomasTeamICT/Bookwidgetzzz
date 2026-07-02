import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GapQuestion, MatchQuestion, MCQuestion, MultiQuestion, NumberQuestion,
  OrderQuestion, Question, QuestionType, QuizConfig, ShortQuestion, SliderQuestion,
  TFQuestion, LongQuestion,
} from '../lib/types';
import { extractGaps, gradeQuestion, gradeQuiz, splitGapText } from '../lib/grading';
import { shuffled, uid } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';

// ── Vraagtype-metadata ──────────────────────────────────────────────────────

export const QUESTION_TYPES: { type: QuestionType; name: string; icon: string; desc: string }[] = [
  { type: 'mc', name: 'Meerkeuze', icon: '🔘', desc: 'Eén juist antwoord' },
  { type: 'multi', name: 'Meerdere antwoorden', icon: '☑️', desc: 'Meerdere juiste antwoorden' },
  { type: 'tf', name: 'Juist of onjuist', icon: '⚖️', desc: 'Stelling beoordelen' },
  { type: 'short', name: 'Kort antwoord', icon: '✏️', desc: 'Woord of korte zin typen' },
  { type: 'long', name: 'Open vraag', icon: '📝', desc: 'Lang antwoord, manueel beoordeeld' },
  { type: 'gap', name: 'Invuloefening', icon: '🧩', desc: 'Gaten in een tekst invullen' },
  { type: 'match', name: 'Koppelen', icon: '🔗', desc: 'Paren bij elkaar zoeken' },
  { type: 'order', name: 'Rangschikken', icon: '↕️', desc: 'Items in juiste volgorde slepen' },
  { type: 'number', name: 'Getal', icon: '🔢', desc: 'Numeriek antwoord met tolerantie' },
  { type: 'slider', name: 'Schuiver', icon: '🎚️', desc: 'Waarde op een schaal kiezen' },
  { type: 'info', name: 'Infoblok', icon: 'ℹ️', desc: 'Tekst of afbeelding zonder vraag' },
];

export function makeQuestion(type: QuestionType): Question {
  const base = { id: uid(), prompt: '', points: 1, explanation: '' };
  switch (type) {
    case 'mc': return { ...base, type, options: ['', ''], correctIndex: 0 };
    case 'multi': return { ...base, type, options: ['', '', ''], correctIndices: [] };
    case 'tf': return { ...base, type, answer: true };
    case 'short': return { ...base, type, accepted: [''], caseSensitive: false };
    case 'long': return { ...base, type, modelAnswer: '' };
    case 'gap': return { ...base, type, text: '' };
    case 'match': return { ...base, type, pairs: [{ left: '', right: '' }, { left: '', right: '' }] };
    case 'order': return { ...base, type, items: ['', '', ''] };
    case 'number': return { ...base, type, answer: 0, tolerance: 0 };
    case 'slider': return { ...base, type, min: 0, max: 100, step: 1, answer: 50, tolerance: 0 };
    case 'info': return { ...base, type, points: 0 };
  }
}

export function questionLabel(q: Question): string {
  const meta = QUESTION_TYPES.find((t) => t.type === q.type)!;
  const text = q.type === 'gap' ? (q as GapQuestion).text : q.prompt;
  return `${meta.icon} ${meta.name}${text ? ' — ' + text.slice(0, 60) : ''}`;
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

function OptionListEditor({
  options, onChange, correct, correctMode, onCorrectChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
  correct: number | number[];
  correctMode: 'single' | 'multi';
  onCorrectChange: (v: number | number[]) => void;
}) {
  return (
    <div>
      {options.map((opt, i) => {
        const isCorrect = correctMode === 'single' ? correct === i : (correct as number[]).includes(i);
        return (
          <div className="option-row" key={i}>
            <input
              type={correctMode === 'single' ? 'radio' : 'checkbox'}
              checked={isCorrect}
              aria-label={`Antwoord ${i + 1} is juist`}
              title="Markeer als juist antwoord"
              style={{ width: 18, height: 18, accentColor: 'var(--ok)' }}
              onChange={(e) => {
                if (correctMode === 'single') onCorrectChange(i);
                else {
                  const cur = new Set(correct as number[]);
                  if (e.target.checked) cur.add(i); else cur.delete(i);
                  onCorrectChange([...cur].sort((a, b) => a - b));
                }
              }}
            />
            <input
              className="input input-sm"
              value={opt}
              placeholder={`Antwoordoptie ${i + 1}`}
              onChange={(e) => {
                const next = options.slice();
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <button
              className="btn btn-quiet btn-icon btn-sm"
              aria-label="Optie verwijderen"
              disabled={options.length <= 2}
              onClick={() => {
                const next = options.filter((_, j) => j !== i);
                onChange(next);
                if (correctMode === 'single') {
                  const c = correct as number;
                  onCorrectChange(c === i ? 0 : c > i ? c - 1 : c);
                } else {
                  onCorrectChange((correct as number[]).filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
                }
              }}
            >✕</button>
          </div>
        );
      })}
      <button className="btn btn-sm btn-ghost" onClick={() => onChange([...options, ''])}>+ Optie toevoegen</button>
      <p className="hint" style={{ marginTop: 6 }}>
        {correctMode === 'single' ? 'Vink het juiste antwoord aan.' : 'Vink alle juiste antwoorden aan.'}
      </p>
    </div>
  );
}

function QuestionBodyEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  switch (q.type) {
    case 'mc':
      return (
        <OptionListEditor
          options={q.options}
          onChange={(options) => onChange({ ...q, options })}
          correct={q.correctIndex}
          correctMode="single"
          onCorrectChange={(v) => onChange({ ...q, correctIndex: v as number })}
        />
      );
    case 'multi':
      return (
        <OptionListEditor
          options={q.options}
          onChange={(options) => onChange({ ...q, options })}
          correct={q.correctIndices}
          correctMode="multi"
          onCorrectChange={(v) => onChange({ ...q, correctIndices: v as number[] })}
        />
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
          <label className="checkbox-row">
            <input type="checkbox" checked={q.caseSensitive} onChange={(e) => onChange({ ...q, caseSensitive: e.target.checked })} />
            <span>Hoofdlettergevoelig</span>
          </label>
        </>
      );
    case 'long':
      return (
        <Field label="Modelantwoord (alleen zichtbaar voor jou)" hint="Open vragen beoordeel je achteraf zelf bij de resultaten.">
          <textarea className="textarea" rows={3} value={q.modelAnswer ?? ''} onChange={(e) => onChange({ ...q, modelAnswer: e.target.value })} />
        </Field>
      );
    case 'gap':
      return (
        <Field
          label="Tekst met gaten"
          hint="Zet de in te vullen woorden tussen [vierkante haken]. Alternatieven scheid je met |, bv.: De hoofdstad van België is [Brussel|Bruxelles]."
        >
          <textarea className="textarea" rows={3} value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
          {q.text && (
            <p className="hint">Gaten gevonden: {extractGaps(q.text).length}</p>
          )}
        </Field>
      );
    case 'match':
      return (
        <div>
          {q.pairs.map((p, i) => (
            <div className="option-row" key={i}>
              <input className="input input-sm" placeholder="Links" value={p.left}
                onChange={(e) => { const pairs = q.pairs.slice(); pairs[i] = { ...p, left: e.target.value }; onChange({ ...q, pairs }); }} />
              <span aria-hidden>↔</span>
              <input className="input input-sm" placeholder="Rechts (hoort bij links)" value={p.right}
                onChange={(e) => { const pairs = q.pairs.slice(); pairs[i] = { ...p, right: e.target.value }; onChange({ ...q, pairs }); }} />
              <button className="btn btn-quiet btn-icon btn-sm" aria-label="Paar verwijderen" disabled={q.pairs.length <= 2}
                onClick={() => onChange({ ...q, pairs: q.pairs.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...q, pairs: [...q.pairs, { left: '', right: '' }] })}>+ Paar toevoegen</button>
        </div>
      );
    case 'order':
      return (
        <div>
          <p className="hint" style={{ marginBottom: 8 }}>Zet de items hier in de <strong>juiste</strong> volgorde. De leerling krijgt ze geschud te zien.</p>
          {q.items.map((it, i) => (
            <div className="option-row" key={i}>
              <span className="badge">{i + 1}</span>
              <input className="input input-sm" value={it} placeholder={`Item ${i + 1}`}
                onChange={(e) => { const items = q.items.slice(); items[i] = e.target.value; onChange({ ...q, items }); }} />
              <button className="btn btn-quiet btn-icon btn-sm" aria-label="Item verwijderen" disabled={q.items.length <= 2}
                onClick={() => onChange({ ...q, items: q.items.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...q, items: [...q.items, ''] })}>+ Item toevoegen</button>
        </div>
      );
    case 'number':
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Juiste antwoord">
            <input className="input input-sm" type="number" value={q.answer} step="any"
              onChange={(e) => onChange({ ...q, answer: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Tolerantie (±)" hint="0 = exact">
            <input className="input input-sm" type="number" value={q.tolerance} min={0} step="any"
              onChange={(e) => onChange({ ...q, tolerance: Math.max(0, parseFloat(e.target.value) || 0) })} />
          </Field>
        </div>
      );
    case 'slider':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
          <Field label="Minimum"><input className="input input-sm" type="number" value={q.min} onChange={(e) => onChange({ ...q, min: parseFloat(e.target.value) || 0 })} /></Field>
          <Field label="Maximum"><input className="input input-sm" type="number" value={q.max} onChange={(e) => onChange({ ...q, max: parseFloat(e.target.value) || 0 })} /></Field>
          <Field label="Stap"><input className="input input-sm" type="number" value={q.step} min={0} step="any" onChange={(e) => onChange({ ...q, step: parseFloat(e.target.value) || 1 })} /></Field>
          <Field label="Juiste waarde"><input className="input input-sm" type="number" value={q.answer} onChange={(e) => onChange({ ...q, answer: parseFloat(e.target.value) || 0 })} /></Field>
          <Field label="Tolerantie (±)"><input className="input input-sm" type="number" value={q.tolerance} min={0} onChange={(e) => onChange({ ...q, tolerance: Math.max(0, parseFloat(e.target.value) || 0) })} /></Field>
        </div>
      );
    case 'info':
      return <p className="hint">Een infoblok toont alleen de tekst/afbeelding hierboven. Handig voor instructies of een leestekst.</p>;
  }
}

export function QuizEditor({ config, onChange }: EditorProps<QuizConfig>) {
  const [addOpen, setAddOpen] = useState(false);
  const qs = config.questions;

  const update = (i: number, q: Question) => {
    const questions = qs.slice();
    questions[i] = q;
    onChange({ ...config, questions });
  };

  return (
    <div>
      <div className="field">
        <label>Weergave voor de leerling</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${config.layout === 'single' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, layout: 'single' })}>
            Eén vraag per scherm
          </button>
          <button className={`btn btn-sm ${config.layout === 'scroll' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, layout: 'scroll' })}>
            Alles onder elkaar
          </button>
        </div>
      </div>

      {qs.map((q, i) => (
        <div className="editor-item" key={q.id}>
          <ItemHeader
            index={i}
            label={questionLabel(q)}
            canUp={i > 0}
            canDown={i < qs.length - 1}
            onMoveUp={() => onChange({ ...config, questions: moveItem(qs, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, questions: moveItem(qs, i, i + 1) })}
            onDelete={() => onChange({ ...config, questions: qs.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const copy = JSON.parse(JSON.stringify(q)) as Question;
              copy.id = uid();
              const questions = qs.slice();
              questions.splice(i + 1, 0, copy);
              onChange({ ...config, questions });
            }}
          />
          <div className="editor-item-body">
            <Field label={q.type === 'info' ? 'Tekst' : 'Vraag'}>
              <textarea
                className="textarea" rows={2}
                value={q.prompt}
                placeholder={q.type === 'info' ? 'Informatieve tekst…' : 'Typ hier je vraag…'}
                onChange={(e) => update(i, { ...q, prompt: e.target.value })}
              />
            </Field>
            <QuestionBodyEditor q={q} onChange={(nq) => update(i, nq)} />
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                Extra: afbeelding, punten & feedback
              </summary>
              <div style={{ paddingTop: 10 }}>
                <ImagePicker value={q.imageUrl} onChange={(imageUrl) => update(i, { ...q, imageUrl })} />
                {q.type !== 'info' && (
                  <Field label="Punten">
                    <input className="input input-sm" type="number" min={0} step="0.5" value={q.points} style={{ maxWidth: 110 }}
                      onChange={(e) => update(i, { ...q, points: Math.max(0, parseFloat(e.target.value) || 0) })} />
                  </Field>
                )}
                <Field label="Uitleg bij feedback" hint="Wordt getoond nadat de leerling heeft ingediend (als feedback aanstaat).">
                  <textarea className="textarea" rows={2} value={q.explanation ?? ''} onChange={(e) => update(i, { ...q, explanation: e.target.value })} />
                </Field>
              </div>
            </details>
          </div>
        </div>
      ))}

      {qs.length === 0 && (
        <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: '18px 0' }}>
          Nog geen vragen. Voeg je eerste vraag toe. 👇
        </p>
      )}

      <div style={{ position: 'relative' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
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
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.type}
                role="menuitem"
                className="btn btn-quiet"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => {
                  onChange({ ...config, questions: [...qs, makeQuestion(t.type)] });
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
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

type Answers = Record<string, unknown>;

function MCAnswer({ q, value, onChange, review }: { q: MCQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  return (
    <div role="radiogroup" aria-label="Antwoordopties">
      {q.options.map((opt, i) => {
        const sel = value === i;
        let cls = 'answer-option';
        if (review) {
          if (i === q.correctIndex) cls += ' correct';
          else if (sel) cls += ' incorrect';
        } else if (sel) cls += ' selected';
        return (
          <button key={i} type="button" role="radio" aria-checked={sel} className={cls} disabled={review} onClick={() => onChange(i)}>
            <span className="marker" aria-hidden>{String.fromCharCode(65 + i)}</span>
            <span>{opt}</span>
            {review && i === q.correctIndex && <span style={{ marginLeft: 'auto' }} aria-label="juist">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function MultiAnswer({ q, value, onChange, review }: { q: MultiQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const sel = Array.isArray(value) ? (value as number[]) : [];
  return (
    <div role="group" aria-label="Antwoordopties (meerdere mogelijk)">
      {q.options.map((opt, i) => {
        const isSel = sel.includes(i);
        const isCor = q.correctIndices.includes(i);
        let cls = 'answer-option';
        if (review) {
          if (isCor) cls += ' correct';
          else if (isSel) cls += ' incorrect';
        } else if (isSel) cls += ' selected';
        return (
          <button
            key={i} type="button" aria-pressed={isSel} className={cls} disabled={review}
            onClick={() => {
              const next = new Set(sel);
              if (next.has(i)) next.delete(i); else next.add(i);
              onChange([...next].sort((a, b) => a - b));
            }}
          >
            <span className="marker" aria-hidden style={{ borderRadius: 7 }}>{isSel ? '✓' : ''}</span>
            <span>{opt}</span>
            {review && isCor && <span style={{ marginLeft: 'auto' }} aria-label="juist">✓</span>}
          </button>
        );
      })}
      <p className="hint">Meerdere antwoorden mogelijk.</p>
    </div>
  );
}

function TFAnswer({ q, value, onChange, review }: { q: TFQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {[true, false].map((v) => {
        const sel = value === v;
        let cls = 'answer-option';
        if (review) {
          if (v === q.answer) cls += ' correct';
          else if (sel) cls += ' incorrect';
        } else if (sel) cls += ' selected';
        return (
          <button key={String(v)} type="button" className={cls} style={{ justifyContent: 'center' }} disabled={review} onClick={() => onChange(v)} aria-pressed={sel}>
            {v ? '✓ Juist' : '✗ Onjuist'}
          </button>
        );
      })}
    </div>
  );
}

function ShortAnswer({ q, value, onChange, review }: { q: ShortQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const ok = review && gradeQuestion(q, value).earned > 0;
  return (
    <div>
      <input
        className="input"
        style={review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : undefined}
        value={typeof value === 'string' ? value : ''}
        placeholder="Typ je antwoord…"
        disabled={review}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Je antwoord"
      />
      {review && !ok && (
        <p style={{ marginTop: 8, color: 'var(--ok)', fontWeight: 600 }}>Juist antwoord: {q.accepted.filter(Boolean).join(' / ')}</p>
      )}
    </div>
  );
}

function LongAnswer({ q, value, onChange, review }: { q: LongQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  return (
    <div>
      <textarea
        className="textarea" rows={5}
        value={typeof value === 'string' ? value : ''}
        placeholder="Typ je antwoord…"
        disabled={review}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Je antwoord"
      />
      {review && <p className="hint" style={{ marginTop: 6 }}>✍️ Deze open vraag wordt door je leerkracht beoordeeld.</p>}
    </div>
  );
}

function GapAnswer({ q, value, onChange, review }: { q: GapQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const parts = useMemo(() => splitGapText(q.text), [q.text]);
  const answers = Array.isArray(value) ? (value as string[]) : [];
  return (
    <p style={{ fontSize: '1.08rem', lineHeight: 2.2 }}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.value}</span>;
        const gi = p.gapIndex!;
        const given = answers[gi] ?? '';
        let cls = 'gap-input';
        if (review) {
          const options = p.value.split('|');
          const ok = options.some((o) => o.trim().toLocaleLowerCase('nl') === given.trim().toLocaleLowerCase('nl'));
          cls += ok ? ' correct' : ' incorrect';
        }
        return (
          <span key={i} style={{ whiteSpace: 'nowrap' }}>
            <input
              className={cls}
              value={given}
              size={Math.max(6, p.value.split('|')[0].length)}
              disabled={review}
              aria-label={`Invulveld ${gi + 1}`}
              onChange={(e) => {
                const next = answers.slice();
                next[gi] = e.target.value;
                onChange(next);
              }}
            />
            {review && (
              <small style={{ color: 'var(--ok)', fontWeight: 700 }}> ({p.value.split('|')[0]})</small>
            )}
          </span>
        );
      })}
    </p>
  );
}

function MatchAnswer({ q, value, onChange, review }: { q: MatchQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  // rechteropties in vaste, geschudde volgorde tonen
  const rightOrder = useMemo(() => shuffled(q.pairs.map((_, i) => i)), [q.id]);
  const chosen = Array.isArray(value) ? (value as (number | null)[]) : q.pairs.map(() => null);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {q.pairs.map((p, li) => {
        const val = chosen[li];
        const ok = review && val === li;
        return (
          <div key={li} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 650, flex: '1 1 160px' }}>{p.left}</span>
            <span aria-hidden>→</span>
            <select
              className="select"
              style={{ flex: '1 1 190px', maxWidth: 280, ...(review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : {}) }}
              value={val === null || val === undefined ? '' : String(val)}
              disabled={review}
              aria-label={`Koppel "${p.left}" aan`}
              onChange={(e) => {
                const next = chosen.slice();
                while (next.length < q.pairs.length) next.push(null);
                next[li] = e.target.value === '' ? null : Number(e.target.value);
                onChange(next);
              }}
            >
              <option value="">— kies —</option>
              {rightOrder.map((ri) => (
                <option key={ri} value={ri}>{q.pairs[ri].right}</option>
              ))}
            </select>
            {review && !ok && <small style={{ color: 'var(--ok)', fontWeight: 700 }}>✓ {p.right}</small>}
          </div>
        );
      })}
    </div>
  );
}

function OrderAnswer({ q, value, onChange, review }: { q: OrderQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  // value = array van originele indexen in getoonde volgorde
  const initial = useMemo(() => shuffled(q.items.map((_, i) => i)), [q.id]);
  const order = Array.isArray(value) && (value as number[]).length === q.items.length ? (value as number[]) : initial;

  useEffect(() => {
    if (!Array.isArray(value) || (value as number[]).length !== q.items.length) onChange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <div>
      {order.map((origIdx, pos) => {
        const ok = review && origIdx === pos;
        return (
          <div
            key={origIdx}
            className="order-item"
            style={review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)', background: ok ? 'var(--ok-soft)' : 'var(--err-soft)' } : undefined}
          >
            <span className="badge badge-brand">{pos + 1}</span>
            <span style={{ flex: 1 }}>{q.items[origIdx]}</span>
            {review ? (
              !ok && <small style={{ color: 'var(--text-soft)' }}>hoort op plaats {origIdx + 1}</small>
            ) : (
              <span className="updown">
                <button className="btn btn-quiet btn-icon btn-sm" aria-label="Omhoog" disabled={pos === 0} onClick={() => move(pos, pos - 1)}>↑</button>
                <button className="btn btn-quiet btn-icon btn-sm" aria-label="Omlaag" disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)}>↓</button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumberAnswer({ q, value, onChange, review }: { q: NumberQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const ok = review && gradeQuestion(q, value).earned > 0;
  return (
    <div>
      <input
        className="input" type="number" step="any" style={{ maxWidth: 220, ...(review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : {}) }}
        value={value === undefined || value === null ? '' : String(value)}
        disabled={review}
        aria-label="Numeriek antwoord"
        onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
      />
      {review && !ok && <p style={{ marginTop: 8, color: 'var(--ok)', fontWeight: 600 }}>Juist antwoord: {q.answer}{q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}</p>}
    </div>
  );
}

function SliderAnswer({ q, value, onChange, review }: { q: SliderQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const v = typeof value === 'number' ? value : (q.min + q.max) / 2;
  const ok = review && gradeQuestion(q, value).earned > 0;
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-soft)' }}>{q.min}</span>
        <input
          type="range" min={q.min} max={q.max} step={q.step || 1} value={v} disabled={review}
          style={{ flex: 1 }}
          aria-label="Waarde kiezen"
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span style={{ color: 'var(--text-soft)' }}>{q.max}</span>
        <output style={{ fontWeight: 800, minWidth: 52, textAlign: 'center', fontSize: '1.15rem', color: 'var(--player-accent, var(--brand))' }}>
          {typeof value === 'number' ? value : '—'}
        </output>
      </div>
      {review && <p style={{ marginTop: 8, color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>
        {ok ? '✓ Juist' : `Juiste waarde: ${q.answer}${q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}`}
      </p>}
    </div>
  );
}

export function QuestionView({
  q, index, total, value, onChange, review,
}: {
  q: Question; index: number; total: number;
  value: unknown; onChange: (v: unknown) => void; review: boolean;
}) {
  const score = review && q.type !== 'info' ? gradeQuestion(q, value) : null;
  return (
    <div className="card question-card">
      <div className="question-num">
        {q.type === 'info' ? 'Info' : `Vraag ${index + 1} van ${total}`}
        {q.type !== 'info' && <span className="badge">{q.points} {q.points === 1 ? 'punt' : 'punten'}</span>}
        {score && score.mode !== 'pending' && (
          <span className={`badge ${score.earned >= score.max ? 'badge-ok' : score.earned > 0 ? 'badge-warn' : 'badge-err'}`}>
            {score.earned}/{score.max}
          </span>
        )}
        {score?.mode === 'pending' && <span className="badge badge-warn">wordt beoordeeld</span>}
      </div>
      {q.prompt && <div className="question-prompt">{q.prompt}</div>}
      {q.imageUrl && <img className="question-image" src={q.imageUrl} alt="" />}
      {q.type === 'mc' && <MCAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'multi' && <MultiAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'tf' && <TFAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'short' && <ShortAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'long' && <LongAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'gap' && <GapAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'match' && <MatchAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'order' && <OrderAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'number' && <NumberAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'slider' && <SliderAnswer q={q} value={value} onChange={onChange} review={review} />}
      {review && q.explanation && (
        <div className="callout" style={{ marginTop: 14, marginBottom: 0 }}>
          <span aria-hidden>💡</span>
          <div><strong>Uitleg:</strong> {q.explanation}</div>
        </div>
      )}
    </div>
  );
}

function answered(q: Question, v: unknown): boolean {
  if (q.type === 'info') return true;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return q.type === 'order' ? true : v.some((x) => x !== null && x !== undefined && x !== '');
  return true;
}

export function QuizPlayer({ widget, preview, timeUp, onComplete }: PlayerProps<QuizConfig>) {
  const config = widget.config;
  const questions = useMemo(
    () => (widget.settings.shuffle ? shuffled(config.questions) : config.questions),
    [widget.id]
  );
  const [answers, setAnswers] = useState<Answers>({});
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'answering' | 'done'>('answering');
  const submittedRef = useRef(false);

  const gradable: Question[] = questions.filter((q) => q.type !== 'info');
  const answeredCount = gradable.filter((q) => answered(q, answers[q.id])).length;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const res = gradeQuiz({ ...config, questions }, answers);
    onComplete({ answers, itemScores: res.itemScores, earned: res.earned, max: res.max, hasPending: res.hasPending });
    setPhase('done');
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (timeUp && phase === 'answering') submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (questions.length === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Deze widget bevat nog geen vragen.</p>;
  }

  const review = phase === 'done' && widget.settings.showFeedback;

  if (phase === 'done') {
    const res = gradeQuiz({ ...config, questions }, answers);
    return (
      <div>
        <ResultHero earned={res.earned} max={res.max} showScore={widget.settings.showScore} hasPending={res.hasPending} />
        {review && (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ textAlign: 'center' }}>Overzicht van je antwoorden</h2>
            {questions.map((q, i) => (
              <QuestionView key={q.id} q={q} index={gradable.indexOf(q)} total={gradable.length} value={answers[q.id]} onChange={() => {}} review />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (config.layout === 'scroll') {
    return (
      <div>
        {questions.map((q, i) => (
          <QuestionView
            key={q.id} q={q}
            index={gradable.indexOf(q)} total={gradable.length}
            value={answers[q.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            review={false}
          />
        ))}
        <div className="player-nav">
          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            {answeredCount} van {gradable.length} beantwoord
          </span>
          <button className="btn btn-primary btn-lg" onClick={submit}>Indienen ✓</button>
        </div>
      </div>
    );
  }

  // één vraag per scherm
  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="progressbar" style={{ flex: 1 }} role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={questions.length} aria-label="Voortgang">
          <div style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>
        <span style={{ fontWeight: 700, color: 'var(--text-soft)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {idx + 1} / {questions.length}
        </span>
      </div>
      <QuestionView
        q={q} index={gradable.indexOf(q)} total={gradable.length}
        value={answers[q.id]}
        onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        review={false}
      />
      <div className="player-nav">
        <button className="btn btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          ← Vorige
        </button>
        {isLast ? (
          <button className="btn btn-primary btn-lg" onClick={submit}>Indienen ✓</button>
        ) : (
          <button className="btn btn-primary" onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}>
            Volgende →
          </button>
        )}
      </div>
    </div>
  );
}
