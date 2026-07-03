import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GapQuestion, MatchQuestion, MCQuestion, MultiQuestion, NumberQuestion,
  OrderQuestion, Question, QuestionType, QuizConfig, ShortQuestion, SliderQuestion,
  TFQuestion, LongQuestion,
} from '../lib/types';
import { extractGaps, gradeQuestion, gradeQuiz, splitGapText } from '../lib/grading';
import { normalizeAnswer, shuffled, uid } from '../lib/utils';
import { Field, ImagePicker, Modal, useToast } from '../components/ui';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';
import { clearProgress, loadProgress, saveProgress } from '../lib/autosave';
import { getWidgets } from '../lib/storage';
import type { Widget } from '../lib/types';

// ── Voorlezen (tekst-naar-spraak) ───────────────────────────────────────────

function speakQuestion(q: Question) {
  if (typeof speechSynthesis === 'undefined') return;
  const parts: string[] = [];
  if (q.prompt) parts.push(q.prompt);
  if (q.type === 'gap') parts.push(q.text.replace(/\[([^\]]+)\]/g, ' … '));
  if (q.type === 'mc' || q.type === 'multi') {
    q.options.forEach((o, i) => parts.push(`Optie ${String.fromCharCode(65 + i)}: ${o}`));
  }
  if (q.type === 'tf') parts.push('Juist, of onjuist?');
  if (q.type === 'order') parts.push(...q.items);
  const u = new SpeechSynthesisUtterance(parts.join('. '));
  u.lang = 'nl-BE';
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ── Accenttekens voor taalvakken ────────────────────────────────────────────

const ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'ü', 'ñ'];

function AccentBar({ onInsert }: { onInsert: (ch: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }} role="toolbar" aria-label="Speciale tekens invoegen">
      {ACCENTS.map((ch) => (
        <button
          key={ch}
          type="button"
          className="btn btn-quiet btn-sm"
          style={{ minWidth: 30, minHeight: 28, padding: '2px 6px', fontSize: '0.95rem' }}
          onClick={() => onInsert(ch)}
          aria-label={`Teken ${ch} invoegen`}
          tabIndex={-1}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

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
        <>
          <Field label="Modelantwoord (alleen zichtbaar voor jou)" hint="Open vragen beoordeel je achteraf zelf bij de resultaten.">
            <textarea className="textarea" rows={3} value={q.modelAnswer ?? ''} onChange={(e) => onChange({ ...q, modelAnswer: e.target.value })} />
          </Field>
          <Field
            label="Beoordelingsrubric (optioneel)"
            hint="Criteria met punten. De leerling ziet ze vóór het antwoorden (succescriteria), jij scoort er per criterium mee bij het verbeteren."
          >
            <div>
              {(q.rubric ?? []).map((r, ri) => (
                <div className="option-row" key={ri}>
                  <input className="input input-sm" placeholder={`Criterium ${ri + 1}, bv. "Gebruikt minstens 2 argumenten"`} value={r.criterion}
                    onChange={(e) => {
                      const rubric = (q.rubric ?? []).slice();
                      rubric[ri] = { ...r, criterion: e.target.value };
                      onChange({ ...q, rubric });
                    }} />
                  <input className="input input-sm" type="number" min={0} step={0.5} style={{ maxWidth: 80 }} value={r.points}
                    aria-label="Punten voor dit criterium"
                    onChange={(e) => {
                      const rubric = (q.rubric ?? []).slice();
                      rubric[ri] = { ...r, points: Math.max(0, parseFloat(e.target.value) || 0) };
                      onChange({ ...q, rubric });
                    }} />
                  <button className="btn btn-quiet btn-icon btn-sm" aria-label="Criterium verwijderen"
                    onClick={() => onChange({ ...q, rubric: (q.rubric ?? []).filter((_, j) => j !== ri) })}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm btn-ghost"
                onClick={() => onChange({ ...q, rubric: [...(q.rubric ?? []), { criterion: '', points: 1 }] })}>
                + Criterium toevoegen
              </button>
              {(q.rubric?.length ?? 0) > 0 && (
                <p className="hint" style={{ marginTop: 6 }}>
                  Som van de criteria: {(q.rubric ?? []).reduce((a, r) => a + r.points, 0)} punten
                  {(q.rubric ?? []).reduce((a, r) => a + r.points, 0) !== q.points && ` — pas eventueel de punten van de vraag (${q.points}) aan.`}
                </p>
              )}
            </div>
          </Field>
        </>
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

/** Bulk-import: "? vraag" / "* juiste optie" / "- foute optie" / "= juist kort antwoord". */
export function parseBulkQuestions(text: string): Question[] {
  const out: Question[] = [];
  let current: { prompt: string; correct: string[]; wrong: string[]; short: string[] } | null = null;
  const flush = () => {
    if (!current || !current.prompt.trim()) { current = null; return; }
    const base = { id: uid(), prompt: current.prompt.trim(), points: 1, explanation: '' };
    if (current.short.length > 0) {
      out.push({ ...base, type: 'short', accepted: current.short, caseSensitive: false });
    } else if (current.correct.length === 1) {
      const options = [...current.correct, ...current.wrong];
      out.push({ ...base, type: 'mc', options, correctIndex: 0 });
    } else if (current.correct.length > 1) {
      const options = [...current.correct, ...current.wrong];
      out.push({ ...base, type: 'multi', options, correctIndices: current.correct.map((_, i) => i) });
    } else {
      out.push({ ...base, type: 'long', modelAnswer: '' });
    }
    current = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('? ')) { flush(); current = { prompt: line.slice(2), correct: [], wrong: [], short: [] }; }
    else if (line.startsWith('* ') && current) current.correct.push(line.slice(2).trim());
    else if (line.startsWith('- ') && current) current.wrong.push(line.slice(2).trim());
    else if (line.startsWith('= ') && current) current.short.push(line.slice(2).trim());
    else if (line && current && current.correct.length === 0 && current.wrong.length === 0 && current.short.length === 0) {
      current.prompt += '\n' + line; // meerregelige vraag
    }
  }
  flush();
  return out;
}

const QUIZ_FAMILY_TYPES = new Set(['quiz', 'worksheet', 'exitticket']);

function QuestionBankModal({ onImport, onClose }: { onImport: (qs: Question[]) => void; onClose: () => void }) {
  const sources = getWidgets().filter((w) => QUIZ_FAMILY_TYPES.has(w.type) && (w.config as QuizConfig).questions?.length > 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openWidget, setOpenWidget] = useState<string | null>(sources[0]?.id ?? null);

  const allQuestions = new Map<string, { q: Question; widget: Widget }>();
  for (const w of sources) {
    for (const q of (w.config as QuizConfig).questions) allQuestions.set(`${w.id}:${q.id}`, { q, widget: w });
  }

  return (
    <Modal
      title="📚 Vragen importeren uit je andere widgets"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button
            className="btn btn-primary"
            disabled={selected.size === 0}
            onClick={() => {
              const imported = [...selected]
                .map((key) => allQuestions.get(key))
                .filter((x): x is { q: Question; widget: Widget } => !!x)
                .map(({ q }) => {
                  const copy = JSON.parse(JSON.stringify(q)) as Question;
                  copy.id = uid();
                  return copy;
                });
              onImport(imported);
              onClose();
            }}
          >
            {selected.size} {selected.size === 1 ? 'vraag' : 'vragen'} importeren
          </button>
        </>
      }
    >
      {sources.length === 0 ? (
        <p style={{ color: 'var(--text-soft)' }}>Je hebt nog geen andere quizzen, werkbladen of exit-tickets met vragen.</p>
      ) : (
        sources.map((w) => {
          const qs = (w.config as QuizConfig).questions;
          const isOpen = openWidget === w.id;
          return (
            <div key={w.id} style={{ marginBottom: 8 }}>
              <button
                className="btn btn-quiet"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                aria-expanded={isOpen}
                onClick={() => setOpenWidget(isOpen ? null : w.id)}
              >
                {isOpen ? '▾' : '▸'} <strong>{w.title}</strong>
                <span className="hint" style={{ marginLeft: 'auto' }}>{qs.length} vragen</span>
              </button>
              {isOpen && (
                <div style={{ paddingLeft: 14 }}>
                  {qs.map((q) => {
                    const key = `${w.id}:${q.id}`;
                    return (
                      <label className="checkbox-row" key={key} style={{ fontSize: '0.9rem' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(key); else next.delete(key);
                            setSelected(next);
                          }}
                        />
                        <span>{questionLabel(q)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </Modal>
  );
}

function BulkImportModal({ onImport, onClose }: { onImport: (qs: Question[]) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseBulkQuestions(text), [text]);
  return (
    <Modal
      title="📋 Vragen plakken (bulk-import)"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={parsed.length === 0}
            onClick={() => { onImport(parsed); onClose(); }}>
            {parsed.length} {parsed.length === 1 ? 'vraag' : 'vragen'} toevoegen
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 8 }}>
        Plak vragen als tekst — handig vanuit Word of een AI-hulpmiddel. Formaat:
        {' '}<code>?</code> vraag · <code>*</code> juiste optie · <code>-</code> foute optie · <code>=</code> juist kort antwoord.
        Zonder opties wordt het een open vraag.
      </p>
      <textarea
        className="textarea" rows={10}
        placeholder={'? Wat is de hoofdstad van Frankrijk?\n* Parijs\n- Lyon\n- Marseille\n\n? 12 x 12 =\n= 144'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ fontFamily: 'monospace' }}
      />
      <p className="hint" style={{ marginTop: 6 }} aria-live="polite">
        {parsed.length > 0
          ? `✓ ${parsed.length} ${parsed.length === 1 ? 'vraag' : 'vragen'} herkend: ${parsed.map((q) => QUESTION_TYPES.find((t) => t.type === q.type)?.name).join(', ')}`
          : 'Nog geen vragen herkend.'}
      </p>
    </Modal>
  );
}

export function QuizEditor({ config, onChange }: EditorProps<QuizConfig>) {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState<'bank' | 'bulk' | null>(null);
  const toast = useToast();
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
      <label className="checkbox-row" style={{ marginBottom: 4 }}>
        <input type="checkbox" checked={config.askConfidence ?? false} onChange={(e) => onChange({ ...config, askConfidence: e.target.checked })} />
        <span>Vraag per vraag hoe zeker de leerling is <span className="hint">(traint zelfinschatting; telt nooit mee voor punten)</span></span>
      </label>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Vragenpool</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="hint">Trek per leerling</span>
          <input
            className="input input-sm" type="number" min={0} max={config.questions.length} style={{ maxWidth: 80 }}
            value={config.drawCount ?? 0}
            aria-label="Aantal vragen per leerling (0 = alle vragen)"
            onChange={(e) => onChange({ ...config, drawCount: Math.max(0, Math.min(config.questions.length, parseInt(e.target.value) || 0)) })}
          />
          <span className="hint">willekeurige vragen (0 = alle {config.questions.length} vragen; iedereen een andere variant vermindert afkijken)</span>
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
                {q.type !== 'info' && (
                  <Field label="Hint voor de leerling (optioneel)" hint="De leerling kan de hint zelf openen tijdens het maken; hintgebruik zie je bij de resultaten.">
                    <input className="input input-sm" value={q.hint ?? ''} placeholder='bv. "Herlees de vraag: wat wordt precies gevraagd?"'
                      onChange={(e) => update(i, { ...q, hint: e.target.value })} />
                  </Field>
                )}
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

      <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
          + Vraag toevoegen
        </button>
        <button className="btn btn-ghost" onClick={() => setImportOpen('bank')}>
          📚 Uit vraagbank
        </button>
        <button className="btn btn-ghost" onClick={() => setImportOpen('bulk')}>
          📋 Tekst plakken
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

      {importOpen === 'bank' && (
        <QuestionBankModal
          onClose={() => setImportOpen(null)}
          onImport={(imported) => {
            onChange({ ...config, questions: [...qs, ...imported] });
            toast(`${imported.length} ${imported.length === 1 ? 'vraag' : 'vragen'} geïmporteerd`, 'ok');
          }}
        />
      )}
      {importOpen === 'bulk' && (
        <BulkImportModal
          onClose={() => setImportOpen(null)}
          onImport={(imported) => {
            onChange({ ...config, questions: [...qs, ...imported] });
            toast(`${imported.length} ${imported.length === 1 ? 'vraag' : 'vragen'} toegevoegd`, 'ok');
          }}
        />
      )}
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
      {!review && <AccentBar onInsert={(ch) => onChange((typeof value === 'string' ? value : '') + ch)} />}
      {review && !ok && (
        <p style={{ marginTop: 8, color: 'var(--ok)', fontWeight: 600 }}>Juist antwoord: {q.accepted.filter(Boolean).join(' / ')}</p>
      )}
    </div>
  );
}

function LongAnswer({ q, value, onChange, review }: { q: LongQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const rubric = (q.rubric ?? []).filter((r) => r.criterion.trim());
  return (
    <div>
      {rubric.length > 0 && (
        <div className="callout" style={{ marginBottom: 10 }}>
          <span aria-hidden>🎯</span>
          <div>
            <strong>Hier let je leerkracht op:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {rubric.map((r, i) => <li key={i}>{r.criterion} <span className="hint">({r.points} {r.points === 1 ? 'punt' : 'punten'})</span></li>)}
            </ul>
          </div>
        </div>
      )}
      <textarea
        className="textarea" rows={5}
        value={typeof value === 'string' ? value : ''}
        placeholder="Typ je antwoord…"
        disabled={review}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Je antwoord"
        spellCheck
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
          // zelfde normalisatie als de beoordeling, anders kleurt een juist antwoord rood
          const options = p.value.split('|');
          const ok = options.some((o) => normalizeAnswer(o) === normalizeAnswer(given));
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

const CONF_OPTIONS = [
  { key: 'zeker', label: '🎯 Zeker' },
  { key: 'twijfel', label: '🤔 Twijfel' },
  { key: 'gok', label: '🎲 Gok' },
] as const;
export type Confidence = (typeof CONF_OPTIONS)[number]['key'];

export function QuestionView({
  q, index, total, value, onChange, review,
  confidence, onConfidence, onHintUsed,
}: {
  q: Question; index: number; total: number;
  value: unknown; onChange: (v: unknown) => void; review: boolean;
  /** Zekerheidsgraad tonen/registreren (kalibratie). */
  confidence?: Confidence | null;
  onConfidence?: (c: Confidence) => void;
  onHintUsed?: () => void;
}) {
  const score = review && q.type !== 'info' ? gradeQuestion(q, value) : null;
  const [hintOpen, setHintOpen] = useState(false);
  return (
    <div className="card question-card">
      <div className="question-num">
        {q.type === 'info' ? 'Info' : `Vraag ${index + 1} van ${total}`}
        {q.type !== 'info' && <span className="badge">{q.points} {q.points === 1 ? 'punt' : 'punten'}</span>}
        <button
          type="button"
          className="btn btn-quiet btn-icon btn-sm"
          style={{ minHeight: 26, minWidth: 26, padding: 2 }}
          onClick={() => speakQuestion(q)}
          aria-label="Vraag voorlezen"
          title="Vraag voorlezen"
        >
          🔊
        </button>
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
      {!review && q.hint && q.type !== 'info' && (
        <div style={{ marginTop: 12 }}>
          {hintOpen ? (
            <div className="callout warn" style={{ marginBottom: 0 }}>
              <span aria-hidden>💡</span>
              <div><strong>Hint:</strong> {q.hint}</div>
            </div>
          ) : (
            <button
              type="button" className="btn btn-sm btn-quiet"
              onClick={() => { setHintOpen(true); onHintUsed?.(); }}
            >
              💡 Ik wil een hint
            </button>
          )}
        </div>
      )}
      {!review && onConfidence && q.type !== 'info' && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Hoe zeker ben je van je antwoord?">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}>Hoe zeker ben je?</span>
          {CONF_OPTIONS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip ${confidence === c.key ? 'placed' : ''}`}
              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
              aria-pressed={confidence === c.key}
              onClick={() => onConfidence(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
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

export function QuizPlayer({ widget, studentName, preview, timeUp, onComplete }: PlayerProps<QuizConfig>) {
  const config = widget.config;
  const baseQuestions = useMemo(() => {
    let qs = config.questions;
    // vragenpool: per leerling een willekeurige deelverzameling (infoblokken blijven staan)
    const draw = config.drawCount ?? 0;
    const gradableAll = qs.filter((q) => q.type !== 'info');
    if (draw > 0 && draw < gradableAll.length) {
      const chosen = new Set(shuffled(gradableAll).slice(0, draw).map((q) => q.id));
      qs = qs.filter((q) => q.type === 'info' || chosen.has(q.id));
    }
    return widget.settings.shuffle ? shuffled(qs) : qs;
  }, [widget.id]);
  // opslaan & hervatten: eerder werk van deze leerling op dit toestel terugzetten
  const restored = useMemo(
    () => (preview ? null : loadProgress(widget.id, studentName)),
    [widget.id, studentName]
  );
  // bewaarde vraagvolgorde herstellen zodat schudden/vragenpool stabiel hervat
  const restoredQuestions = useMemo(() => {
    if (!restored?.order) return null;
    const byId = new Map(config.questions.map((q) => [q.id, q]));
    const qs = restored.order.map((id) => byId.get(id)).filter((q): q is Question => !!q);
    // alleen bruikbaar als de opgeslagen volgorde nog volledig bij de widget past
    return qs.length > 0 && qs.length === restored.order.length ? qs : null;
  }, [restored, widget.id]);
  const [questions, setQuestions] = useState<Question[]>(restoredQuestions ?? baseQuestions);
  const [practice, setPractice] = useState(false);
  const [confs, setConfs] = useState<Record<string, Confidence>>({});
  const hintsRef = useRef<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Answers>(restored?.answers ?? {});
  const [idx, setIdx] = useState(() =>
    restored ? Math.min(Math.max(0, restored.idx), Math.max(0, (restoredQuestions ?? baseQuestions).length - 1)) : 0
  );
  const [phase, setPhase] = useState<'answering' | 'done'>('answering');
  const [showRestored, setShowRestored] = useState(!!restored && Object.keys(restored.answers).length > 0);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!preview && !practice && phase === 'answering') {
      saveProgress(widget.id, studentName, answers, idx, questions.map((q) => q.id));
    }
  }, [answers, idx, phase, practice]);

  const gradable: Question[] = questions.filter((q) => q.type !== 'info');
  const answeredCount = gradable.filter((q) => answered(q, answers[q.id])).length;

  const submit = () => {
    if (phase === 'done') return;
    if (!practice) {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const res = gradeQuiz({ ...config, questions }, answers);
      const meta: Record<string, unknown> = {};
      if (Object.keys(confs).length > 0) meta['_zekerheid'] = confs;
      if (hintsRef.current.size > 0) meta['_hints'] = [...hintsRef.current];
      onComplete({
        answers: { ...answers, ...meta },
        itemScores: res.itemScores, earned: res.earned, max: res.max, hasPending: res.hasPending,
      });
      if (!preview) clearProgress(widget.id, studentName);
    }
    setPhase('done');
    window.scrollTo({ top: 0 });
  };

  /** Nieuwe ronde met alleen de fout beantwoorde vragen (oefenmodus, wordt niet ingediend). */
  const practiceMistakes = () => {
    const wrong = questions.filter((q) => {
      if (q.type === 'info' || q.type === 'long') return false;
      const s = gradeQuestion(q, answers[q.id]);
      return s.earned < s.max;
    });
    if (wrong.length === 0) return;
    setQuestions(wrong);
    setAnswers({});
    setConfs({});
    setIdx(0);
    setPractice(true);
    setShowRestored(false);
    setPhase('answering');
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
    const wrongCount = questions.filter((q) => {
      if (q.type === 'info' || q.type === 'long') return false;
      const s = gradeQuestion(q, answers[q.id]);
      return s.earned < s.max;
    }).length;

    // kalibratiekwadranten: zekerheid × juistheid
    const quadrants = config.askConfidence
      ? (['zeker', 'twijfel', 'gok'] as Confidence[]).flatMap((c) => {
          const qsWithConf = gradable.filter((q) => (confs[q.id] ?? null) === c);
          return [
            { conf: c, ok: true, items: qsWithConf.filter((q) => { const s = gradeQuestion(q, answers[q.id]); return s.max > 0 && s.earned >= s.max; }) },
            { conf: c, ok: false, items: qsWithConf.filter((q) => { const s = gradeQuestion(q, answers[q.id]); return s.mode !== 'pending' && s.earned < s.max; }) },
          ];
        })
      : [];
    const misconcepties = quadrants.find((x) => x.conf === 'zeker' && !x.ok)?.items ?? [];
    const verborgenKennis = quadrants.filter((x) => (x.conf === 'twijfel' || x.conf === 'gok') && x.ok).flatMap((x) => x.items);

    return (
      <div>
        {practice && (
          <div className="callout" role="status">
            <span aria-hidden>🏋️</span>
            <div><strong>Oefenronde</strong> — dit resultaat wordt niet ingediend; je echte inzending is al bij je leerkracht.</div>
          </div>
        )}
        <ResultHero earned={res.earned} max={res.max} showScore={widget.settings.showScore} hasPending={res.hasPending}>
          {review && wrongCount > 0 && (
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={practiceMistakes}>
              🏋️ Oefen je {wrongCount} {wrongCount === 1 ? 'fout' : 'fouten'} opnieuw
            </button>
          )}
        </ResultHero>
        {config.askConfidence && review && (misconcepties.length > 0 || verborgenKennis.length > 0) && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h3>🧭 Jouw zelfinschatting</h3>
            {misconcepties.length > 0 && (
              <p style={{ marginBottom: 6 }}>
                <span className="badge badge-err">let op</span>{' '}
                Je was <strong>zeker</strong> maar antwoordde toch fout bij {misconcepties.length === 1 ? 'vraag' : 'vragen'}{' '}
                <strong>{misconcepties.map((q) => gradable.indexOf(q) + 1).join(', ')}</strong> — kijk die uitleg extra goed na.
              </p>
            )}
            {verborgenKennis.length > 0 && (
              <p style={{ marginBottom: 0 }}>
                <span className="badge badge-ok">goed nieuws</span>{' '}
                Bij {verborgenKennis.length === 1 ? 'vraag' : 'vragen'}{' '}
                <strong>{verborgenKennis.map((q) => gradable.indexOf(q) + 1).join(', ')}</strong> twijfelde of gokte je,
                maar je antwoord was juist — je kan meer dan je denkt!
              </p>
            )}
          </div>
        )}
        {review && (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ textAlign: 'center' }}>Overzicht van je antwoorden</h2>
            {questions.map((q) => (
              <QuestionView key={q.id} q={q} index={gradable.indexOf(q)} total={gradable.length} value={answers[q.id]} onChange={() => {}} review />
            ))}
          </div>
        )}
      </div>
    );
  }

  const restoredBanner = showRestored ? (
    <div className="callout" role="status" style={{ alignItems: 'center' }}>
      <span aria-hidden>💾</span>
      <div style={{ flex: 1 }}>Je eerdere antwoorden op dit toestel zijn teruggezet — je kan gewoon verdergaan.</div>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => {
          setAnswers({}); setIdx(0); setShowRestored(false); setQuestions(baseQuestions);
          if (!preview) clearProgress(widget.id, studentName);
        }}
      >
        🧹 Opnieuw beginnen
      </button>
    </div>
  ) : null;

  if (config.layout === 'scroll') {
    return (
      <div>
        {restoredBanner}
        {questions.map((q) => (
          <QuestionView
            key={q.id} q={q}
            index={gradable.indexOf(q)} total={gradable.length}
            value={answers[q.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            review={false}
            confidence={confs[q.id] ?? null}
            onConfidence={config.askConfidence ? (c) => setConfs((m) => ({ ...m, [q.id]: c })) : undefined}
            onHintUsed={() => hintsRef.current.add(q.id)}
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
      {restoredBanner}
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
        confidence={confs[q.id] ?? null}
        onConfidence={config.askConfidence ? (c) => setConfs((m) => ({ ...m, [q.id]: c })) : undefined}
        onHintUsed={() => hintsRef.current.add(q.id)}
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
