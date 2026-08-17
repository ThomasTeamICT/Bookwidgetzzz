// Formulier-achtige uitgebreide vraagtypes: dropdown, rating, likert, upload.
// Zie contract.ts voor de vorm; de motor (quiz.tsx) rendert prompt, afbeelding,
// punten, uitleg en hints generiek — hier alleen het vraagspecifieke deel.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DropdownQuestion, ItemScore, LikertQuestion, QuestionType, RatingQuestion, UploadQuestion,
} from '../../lib/types';
import { clamp, uid } from '../../lib/utils';
import { CheckRow, Field } from '../../components/ui';
import type { AnswerProps, ExtraQType } from './contract';

// ── Gedeelde hulpjes ────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Simpele, stabiele hash (FNV-1a) — als seed voor het schudden per gat. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministisch schudden (mulberry32 + Fisher-Yates) — geen Math.random in render. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Volgt de viewportbreedte voor de responsieve likert-weergave. */
function useNarrow(maxPx = 640): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxPx}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxPx]);
  return narrow;
}

function formatBytes(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} kB`;
  return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// ── dropdown — keuzelijst in zin ────────────────────────────────────────────
// Antwoordvorm: Record<gatIndex, gekozen string>.

interface DropPart { type: 'text' | 'gap'; value: string; gapIndex?: number }

const DROP_RE = /\{([^{}]+)\}/g;

/** Splits de tekst in segmenten: tekst en gaten ({optie|optie|…}), in volgorde. */
function splitDropdownText(text: string): DropPart[] {
  const parts: DropPart[] = [];
  let last = 0;
  let gi = 0;
  let m: RegExpExecArray | null;
  DROP_RE.lastIndex = 0;
  while ((m = DROP_RE.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'gap', value: m[1], gapIndex: gi++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/** Opties per gat; de eerste optie is het juiste antwoord. */
function dropdownGaps(text: string): string[][] {
  return splitDropdownText(text)
    .filter((p) => p.type === 'gap')
    .map((p) => p.value.split('|').map((s) => s.trim()).filter(Boolean));
}

function gapOptionsShown(q: DropdownQuestion, gapIndex: number, options: string[]): string[] {
  if (!q.shuffle) return options;
  // stabiel per vraag: seed op q.id + gatindex, zodat het lijstje niet
  // herschudt bij elke toetsaanslag of render
  return seededShuffle(options, hashStr(`${q.id}:${gapIndex}`));
}

function DropdownEditor({ q, onChange }: { q: DropdownQuestion; onChange: (q: DropdownQuestion) => void }) {
  const parts = useMemo(() => splitDropdownText(q.text), [q.text]);
  const gaps = useMemo(() => dropdownGaps(q.text), [q.text]);
  return (
    <div>
      <Field
        label="Tekst met keuzelijstjes"
        hint="Zet elk gat tussen {accolades}, met de opties gescheiden door |. De eerste optie is het juiste antwoord, bv.: De zon komt op in het {oosten|westen|zuiden}."
      >
        <textarea className="textarea" rows={3} value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
      </Field>
      {q.text.trim() !== '' && (
        <p className="hint" style={{ marginTop: -8 }}>
          Keuzelijstjes gevonden: {gaps.length}
        </p>
      )}
      <CheckRow checked={q.shuffle} onChange={(shuffle) => onChange({ ...q, shuffle })} label="Afleiders door elkaar tonen" />
      {gaps.length > 0 && (
        <div className="callout" style={{ marginTop: 8 }}>
          <span aria-hidden>👀</span>
          <div>
            <strong>Voorbeeld voor de leerling:</strong>
            <p style={{ margin: '6px 0 0', lineHeight: 2.2 }}>
              {parts.map((p, i) => {
                if (p.type === 'text') return <span key={i}>{p.value}</span>;
                const options = p.value.split('|').map((s) => s.trim()).filter(Boolean);
                return (
                  <select
                    key={i}
                    className="input input-sm"
                    style={{ display: 'inline-block', width: 'auto', margin: '0 2px' }}
                    disabled
                    aria-label={`Voorbeeld keuzelijst ${(p.gapIndex ?? 0) + 1}`}
                    value=""
                  >
                    <option value="">— kies —</option>
                    {options.map((o, oi) => <option key={oi} value={o}>{o}</option>)}
                  </select>
                );
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownAnswer({ q, value, onChange, review }: AnswerProps<DropdownQuestion>) {
  const parts = useMemo(() => splitDropdownText(q.text), [q.text]);
  const val = isRecord(value) ? value : {};
  return (
    <p style={{ fontSize: '1.08rem', lineHeight: 2.4 }}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.value}</span>;
        const gi = p.gapIndex ?? 0;
        const options = p.value.split('|').map((s) => s.trim()).filter(Boolean);
        const correct = options[0] ?? '';
        const shown = gapOptionsShown(q, gi, options);
        const chosen = typeof val[gi] === 'string' ? (val[gi] as string) : '';
        const ok = review && chosen === correct;
        return (
          <span key={i} style={{ whiteSpace: 'nowrap' }}>
            <select
              className="input input-sm"
              style={{
                display: 'inline-block', width: 'auto', margin: '0 2px',
                ...(review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : {}),
              }}
              value={chosen}
              disabled={review}
              aria-label={`Keuzelijst ${gi + 1}`}
              onChange={(e) => onChange({ ...val, [gi]: e.target.value })}
            >
              <option value="">— kies —</option>
              {shown.map((o, oi) => <option key={oi} value={o}>{o}</option>)}
            </select>
            {review && (ok ? (
              <small style={{ color: 'var(--ok)', fontWeight: 700 }} aria-label="juist"> ✓</small>
            ) : (
              <small style={{ fontWeight: 700 }}>
                <span style={{ color: 'var(--err)' }} aria-label="onjuist"> ✗</span>
                <span style={{ color: 'var(--ok)' }}> ({correct})</span>
              </small>
            ))}
          </span>
        );
      })}
    </p>
  );
}

const dropdownType: ExtraQType<DropdownQuestion> = {
  type: 'dropdown',
  name: 'Keuzelijst in zin',
  icon: '📋',
  desc: 'Zin met uitklapbare keuzelijstjes',
  make: (base) => ({ ...base, type: 'dropdown', text: '', shuffle: true }),
  Editor: DropdownEditor,
  Answer: DropdownAnswer,
  grade: (q, answer): ItemScore => {
    const gaps = dropdownGaps(q.text);
    if (gaps.length === 0) return { earned: 0, max: 0, mode: 'auto' };
    const val = isRecord(answer) ? answer : {};
    let good = 0;
    gaps.forEach((options, i) => {
      if (options.length > 0 && val[i] === options[0]) good++;
    });
    const earned = Math.round((good / gaps.length) * q.points * 100) / 100;
    return { earned, max: q.points, mode: 'auto' };
  },
  tts: (q) => [q.text.replace(DROP_RE, ' … ')],
  summary: (q) => {
    const n = dropdownGaps(q.text).length;
    return n === 1 ? '1 keuzelijstje' : `${n} keuzelijstjes`;
  },
};

// ── rating — beoordeling met sterren ────────────────────────────────────────
// Antwoordvorm: number (1..scale). Mening/zelfinschatting: niet beoordeeld.

function RatingEditor({ q, onChange }: { q: RatingQuestion; onChange: (q: RatingQuestion) => void }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Aantal sterren" hint="3 tot 10">
          <input
            className="input input-sm" type="number" min={3} max={10} value={q.scale}
            onChange={(e) => onChange({ ...q, scale: clamp(parseInt(e.target.value, 10) || 5, 3, 10) })}
          />
        </Field>
        <Field label="Label links (optioneel)" hint="Bv. “helemaal niet”">
          <input
            className="input input-sm" value={q.labelLow ?? ''}
            onChange={(e) => onChange({ ...q, labelLow: e.target.value })}
          />
        </Field>
        <Field label="Label rechts (optioneel)" hint="Bv. “heel goed”">
          <input
            className="input input-sm" value={q.labelHigh ?? ''}
            onChange={(e) => onChange({ ...q, labelHigh: e.target.value })}
          />
        </Field>
      </div>
      <p className="hint">Een beoordeling is een mening — ze telt niet mee in de score (0 punten).</p>
    </div>
  );
}

function RatingAnswer({ q, value, onChange, review }: AnswerProps<RatingQuestion>) {
  const scale = clamp(Math.round(q.scale) || 5, 2, 10);
  const v = typeof value === 'number' ? clamp(Math.round(value), 0, scale) : 0;
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={`Beoordeling: kies 1 tot ${scale} sterren`}
        style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
      >
        {Array.from({ length: scale }, (_, i) => i + 1).map((n) => {
          const filled = n <= v;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={v === n}
              aria-label={`${n} van ${scale} sterren`}
              disabled={review}
              onClick={() => onChange(n)}
              style={{
                font: 'inherit', fontSize: '1.8rem', lineHeight: 1,
                background: 'none', border: 'none', padding: '2px 4px', borderRadius: 8,
                cursor: review ? 'default' : 'pointer',
                color: filled ? 'var(--warn)' : 'var(--text-faint)',
              }}
            >
              <span aria-hidden>{filled ? '★' : '☆'}</span>
            </button>
          );
        })}
      </div>
      {(q.labelLow?.trim() || q.labelHigh?.trim()) && (
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', gap: 12,
            maxWidth: scale * 40, marginTop: 2,
            fontSize: '0.85rem', color: 'var(--text-soft)',
          }}
        >
          <span>{q.labelLow}</span>
          <span style={{ textAlign: 'right' }}>{q.labelHigh}</span>
        </div>
      )}
      {review && (
        <p className="hint" style={{ marginTop: 8 }}>
          {v > 0 ? `Jouw beoordeling: ${v} van ${scale} sterren.` : '(geen beoordeling gegeven)'}
          {' '}Geen juist of fout — dit is jouw mening.
        </p>
      )}
    </div>
  );
}

const ratingType: ExtraQType<RatingQuestion> = {
  type: 'rating',
  name: 'Beoordeling (sterren)',
  icon: '⭐',
  desc: 'Mening of zelfinschatting, niet beoordeeld',
  make: (base) => ({ ...base, type: 'rating', points: 0, scale: 5 }),
  Editor: RatingEditor,
  Answer: RatingAnswer,
  grade: (): ItemScore => ({ earned: 0, max: 0, mode: 'auto' }),
  summary: (q) => `schaal van ${q.scale} sterren`,
};

// ── likert — stellingenmatrix ───────────────────────────────────────────────
// Antwoordvorm: Record<statementId, optionIndex>. Niet beoordeeld.

const LIKERT_PRESETS: { key: string; name: string; options: string[] }[] = [
  { key: 'agree5', name: '5-punts: helemaal oneens → helemaal eens', options: ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'] },
  { key: 'freq4', name: '4-punts: nooit → altijd', options: ['Nooit', 'Soms', 'Vaak', 'Altijd'] },
  { key: 'smiley3', name: '3-punts: smileys', options: ['🙁', '😐', '🙂'] },
];

function LikertEditor({ q, onChange }: { q: LikertQuestion; onChange: (q: LikertQuestion) => void }) {
  const matched = LIKERT_PRESETS.find(
    (p) => p.options.length === q.options.length && p.options.every((o, i) => o === q.options[i])
  );
  const [custom, setCustom] = useState(!matched);
  const [customText, setCustomText] = useState(q.options.join(', '));
  // vangnet: opties die bij geen enkele preset horen (bv. oudere data) → aangepast
  const showCustom = custom || !matched;
  return (
    <div>
      <Field label="Stellingen" hint="Elke stelling wordt op dezelfde schaal beoordeeld.">
        <div>
          {q.statements.map((st, i) => (
            <div className="option-row" key={st.id}>
              <input
                className="input input-sm" placeholder={`Stelling ${i + 1}`} value={st.text}
                aria-label={`Stelling ${i + 1}`}
                onChange={(e) => {
                  const statements = q.statements.slice();
                  statements[i] = { ...st, text: e.target.value };
                  onChange({ ...q, statements });
                }}
              />
              <button
                className="btn btn-quiet btn-icon btn-sm" aria-label="Stelling verwijderen"
                disabled={q.statements.length <= 1}
                onClick={() => onChange({ ...q, statements: q.statements.filter((_, j) => j !== i) })}
              >✕</button>
            </div>
          ))}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onChange({ ...q, statements: [...q.statements, { id: uid(), text: '' }] })}
          >
            + Stelling toevoegen
          </button>
        </div>
      </Field>
      <Field label="Schaal">
        <select
          className="select"
          value={showCustom ? 'custom' : matched!.key}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setCustom(true);
              setCustomText(q.options.join(', '));
            } else {
              const preset = LIKERT_PRESETS.find((p) => p.key === e.target.value)!;
              setCustom(false);
              onChange({ ...q, options: preset.options.slice() });
            }
          }}
        >
          {LIKERT_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          <option value="custom">Aangepast…</option>
        </select>
      </Field>
      {showCustom && (
        <Field label="Aangepaste schaal" hint="Opties gescheiden door komma's, van laag naar hoog (minstens 2).">
          <input
            className="input input-sm"
            value={customText}
            placeholder="Bv.: Nooit, Soms, Altijd"
            onChange={(e) => {
              setCustomText(e.target.value);
              const options = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
              if (options.length >= 2) onChange({ ...q, options });
            }}
          />
        </Field>
      )}
      <p className="hint">Stellingen peilen naar een mening — ze tellen niet mee in de score (0 punten).</p>
    </div>
  );
}

function LikertAnswer({ q, value, onChange, review }: AnswerProps<LikertQuestion>) {
  const narrow = useNarrow();
  const raw = isRecord(value) ? value : {};
  const chosenOf = (id: string): number | null => (typeof raw[id] === 'number' ? (raw[id] as number) : null);
  const set = (id: string, oi: number) => onChange({ ...raw, [id]: oi });
  const label = (st: { text: string }, i: number) => st.text.trim() || `Stelling ${i + 1}`;

  if (q.statements.length === 0 || q.options.length === 0) {
    return <p className="hint">(nog geen stellingen of schaalopties)</p>;
  }

  const note = review && (
    <p className="hint" style={{ marginTop: 8 }}>Geen juist of fout — dit is jouw mening.</p>
  );

  if (narrow) {
    // smalle schermen: per stelling een kaartje met radiochips
    return (
      <div>
        <div style={{ display: 'grid', gap: 10 }}>
          {q.statements.map((st, si) => (
            <div key={st.id} className="card" style={{ padding: '12px 14px' }}>
              <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{label(st, si)}</p>
              <div role="radiogroup" aria-label={label(st, si)} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {q.options.map((opt, oi) => {
                  const sel = chosenOf(st.id) === oi;
                  return (
                    <button
                      key={oi}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      className={`chip ${sel ? 'placed' : ''}`}
                      disabled={review}
                      style={{
                        padding: '4px 12px', fontSize: '0.88rem',
                        ...(review ? { cursor: 'default', ...(sel ? {} : { opacity: 0.45 }) } : {}),
                      }}
                      onClick={() => set(st.id, oi)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {note}
      </div>
    );
  }

  // brede schermen: matrix als tabel met kop- en rijkoppen
  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Stelling</th>
              {q.options.map((opt, oi) => (
                <th key={oi} scope="col" style={{ textAlign: 'center', whiteSpace: 'normal' }}>{opt}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.statements.map((st, si) => (
              <tr key={st.id} style={{ cursor: 'default' }}>
                <th
                  scope="row"
                  style={{
                    textAlign: 'left', textTransform: 'none', letterSpacing: 0,
                    fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)',
                    background: 'transparent', whiteSpace: 'normal',
                    padding: '11px 14px', borderBottom: '1px solid var(--line)',
                  }}
                >
                  {label(st, si)}
                </th>
                {q.options.map((opt, oi) => (
                  <td key={oi} style={{ textAlign: 'center' }}>
                    <input
                      type="radio"
                      name={`likert-${q.id}-${st.id}`}
                      checked={chosenOf(st.id) === oi}
                      disabled={review}
                      aria-label={`${label(st, si)}: ${opt}`}
                      style={{ width: 18, height: 18, accentColor: 'var(--player-accent, var(--brand))' }}
                      onChange={() => set(st.id, oi)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note}
    </div>
  );
}

const likertType: ExtraQType<LikertQuestion> = {
  type: 'likert',
  name: 'Stellingen (schaal)',
  icon: '📊',
  desc: 'Meerdere stellingen op één schaal',
  make: (base) => ({
    ...base,
    type: 'likert',
    points: 0,
    statements: [{ id: uid(), text: '' }, { id: uid(), text: '' }],
    options: LIKERT_PRESETS[0].options.slice(),
  }),
  Editor: LikertEditor,
  Answer: LikertAnswer,
  grade: (): ItemScore => ({ earned: 0, max: 0, mode: 'auto' }),
  tts: (q) => q.statements.map((s) => s.text).filter((t) => t.trim() !== ''),
  summary: (q) => `${q.statements.length} stellingen · ${q.options.length}-puntsschaal`,
};

// ── upload — bestand inleveren ──────────────────────────────────────────────
// Antwoordvorm: { name, size, dataUrl } (serialiseerbaar, past in localStorage).

interface UploadAnswerValue { name: string; size: number; dataUrl: string }

function isUploadAnswer(v: unknown): v is UploadAnswerValue {
  if (!isRecord(v)) return false;
  return typeof v.name === 'string' && typeof v.size === 'number'
    && typeof v.dataUrl === 'string' && v.dataUrl.startsWith('data:');
}

function UploadEditor({ q, onChange }: { q: UploadQuestion; onChange: (q: UploadQuestion) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Toegelaten bestandstypes (optioneel)" hint="Bv. “.pdf, .docx” — leeg = alle types.">
          <input
            className="input input-sm" value={q.accept ?? ''} placeholder=".pdf, .docx"
            onChange={(e) => onChange({ ...q, accept: e.target.value })}
          />
        </Field>
        <Field label="Maximale grootte (MB)" hint="1 tot 5">
          <input
            className="input input-sm" type="number" min={1} max={5} style={{ maxWidth: 100 }}
            value={q.maxMb}
            onChange={(e) => onChange({ ...q, maxMb: clamp(parseInt(e.target.value, 10) || 2, 1, 5) })}
          />
        </Field>
      </div>
      <div className="callout warn" role="note">
        <span aria-hidden>⚠️</span>
        <div>
          Ingeleverde bestanden belanden in de browseropslag op <strong>jouw</strong> toestel,
          en die opslag is beperkt. Hou de maximale grootte dus klein.
        </div>
      </div>
      <p className="hint">Ingeleverde bestanden kijk je zelf na bij de resultaten.</p>
    </div>
  );
}

function UploadAnswer({ q, value, onChange, review }: AnswerProps<UploadQuestion>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const file = isUploadAnswer(value) ? value : null;
  const maxMb = clamp(q.maxMb || 2, 1, 5);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) {
      setError(`Dit bestand is te groot (${formatBytes(f.size)}). Maximum: ${maxMb} MB.`);
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onerror = () => setError('Het bestand kon niet gelezen worden. Probeer opnieuw.');
    reader.onload = () => {
      // bewust een kaal object met alleen strings/getallen: blijft serialiseerbaar
      const answer: UploadAnswerValue = { name: f.name, size: f.size, dataUrl: String(reader.result) };
      onChange(answer);
    };
    reader.readAsDataURL(f);
  };

  if (review) {
    return (
      <div>
        {file ? (
          <>
            <a className="btn btn-sm btn-ghost" href={file.dataUrl} download={file.name}>
              📎 {file.name} ({formatBytes(file.size)}) — downloaden
            </a>
            <p className="hint" style={{ marginTop: 8 }}>✍️ Dit bestand wordt door je leerkracht beoordeeld.</p>
          </>
        ) : (
          <p className="hint">(geen bestand ingeleverd)</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={q.accept?.trim() ? q.accept : undefined}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {file ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-ok" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
            📎 {file.name} ({formatBytes(file.size)})
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => inputRef.current?.click()}>
            Vervangen
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => { onChange(undefined); setError(''); }}>
            Verwijderen
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => inputRef.current?.click()}>
          📎 Bestand kiezen
        </button>
      )}
      <p className="hint" style={{ marginTop: 6 }}>
        {q.accept?.trim() ? `Toegelaten: ${q.accept} · ` : ''}maximum {maxMb} MB
      </p>
      {error && <p role="alert" style={{ color: 'var(--err)', fontWeight: 600, marginTop: 6 }}>{error}</p>}
    </div>
  );
}

const uploadType: ExtraQType<UploadQuestion> = {
  type: 'upload',
  name: 'Bestand inleveren',
  icon: '📎',
  desc: 'Bestand uploaden, manueel beoordeeld',
  make: (base) => ({ ...base, type: 'upload', accept: '', maxMb: 2 }),
  Editor: UploadEditor,
  Answer: UploadAnswer,
  grade: (q, answer): ItemScore | null => {
    // geen (geldig) bestand → 0 op maximum; wel een bestand → manueel nakijken (pending)
    if (!isUploadAnswer(answer)) return { earned: 0, max: q.points, mode: 'auto' };
    return null;
  },
  summary: (q) => `max ${q.maxMb} MB`,
};

// ── Registratie ─────────────────────────────────────────────────────────────

export const FORM_QTYPES: Partial<Record<QuestionType, ExtraQType<any>>> = {
  dropdown: dropdownType,
  rating: ratingType,
  likert: likertType,
  upload: uploadType,
};
