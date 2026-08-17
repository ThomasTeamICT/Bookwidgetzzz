// Interactieve uitgebreide vraagtypes: marktext, sort, imagepoint, table.
// Alles werkt met tikken/klikken (geen sleep-verplichting); zie contract.ts.

import React, { useMemo, useState } from 'react';
import type {
  ImagePointQuestion, ItemScore, MarkTextQuestion, QuestionType, SortQuestion, TableQuestion,
} from '../../lib/types';
import type { AnswerProps, ExtraQType } from './contract';
import { CheckRow, Field, ImagePicker } from '../../components/ui';
import { clamp, normalizeAnswer, shuffled, uid } from '../../lib/utils';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Relatieve klikpositie in % op het aangeklikte element; null bij toetsenbordactivatie. */
function relPos(e: React.MouseEvent<HTMLElement>): { x: number; y: number } | null {
  if (e.detail === 0) return null; // Enter/spatie: geen muiscoördinaten
  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: round2(clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100)),
    y: round2(clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// marktext — Woorden markeren 🖍
// ═══════════════════════════════════════════════════════════════════════════

export interface MarkToken { text: string; correct: boolean }

/**
 * Tekst met [doelwoorden] omzetten naar klikbare tokens: splitsen op witruimte,
 * leestekens blijven aan het woord hangen, haken verdwijnen uit de weergave.
 * Een haakpaar over meerdere woorden markeert elk woord erin als doelwoord.
 * Ook gebruikt door Print- en ResultsPage — één tokenizer, dus altijd
 * dezelfde indexen als de speler.
 */
export function markTokens(text: string): MarkToken[] {
  const out: MarkToken[] = [];
  let cur = '';
  let curCorrect = false;
  let inBracket = false;
  const flush = () => {
    if (cur !== '') out.push({ text: cur, correct: curCorrect });
    cur = '';
    curCorrect = false;
  };
  for (const ch of text) {
    if (ch === '[') { inBracket = true; continue; }
    if (ch === ']') { inBracket = false; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    cur += ch;
    if (inBracket) curCorrect = true;
  }
  flush();
  return out;
}

function MarkTextEditor({ q, onChange }: { q: MarkTextQuestion; onChange: (q: MarkTextQuestion) => void }) {
  const targets = markTokens(q.text).filter((t) => t.correct).length;
  return (
    <div>
      <Field
        label="Tekst met doelwoorden"
        hint="Zet elk te markeren woord tussen [vierkante haken], bv.: De [zon] verwarmt het [water]."
      >
        <textarea className="textarea" rows={4} value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
      </Field>
      <p className="hint" aria-live="polite" style={{ marginTop: -4 }}>
        {targets} te markeren {targets === 1 ? 'woord' : 'woorden'}
      </p>
      <CheckRow
        checked={q.penalizeWrong}
        onChange={(penalizeWrong) => onChange({ ...q, penalizeWrong })}
        label="Puntenaftrek voor fout gemarkeerde woorden"
      />
      <p className="hint">
        De leerling ziet de tekst zonder haken en klikt woorden aan om ze te markeren.
        Zonder aftrek telt alleen het aantal juist gemarkeerde woorden.
      </p>
    </div>
  );
}

function MarkTextAnswer({ q, value, onChange, review }: AnswerProps<MarkTextQuestion>) {
  const tokens = useMemo(() => markTokens(q.text), [q.text]);
  const sel = Array.isArray(value) ? (value as number[]) : [];
  if (tokens.length === 0) return <p className="hint">⚠ Deze vraag heeft nog geen tekst.</p>;

  const toggle = (i: number) => {
    const next = new Set(sel);
    if (next.has(i)) next.delete(i); else next.add(i);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div>
      {!review && <p className="hint">Klik de juiste woorden aan; klik opnieuw om een markering weg te halen.</p>}
      <p role="group" aria-label="Woorden in de tekst" style={{ fontSize: '1.08rem', lineHeight: 2.2 }}>
        {tokens.map((t, i) => {
          const marked = sel.includes(i);
          const style: React.CSSProperties = {
            font: 'inherit', color: 'inherit', background: 'transparent',
            cursor: review ? 'default' : 'pointer',
            border: '2px solid transparent', borderRadius: 6, padding: '0 3px',
          };
          let suffix: string | null = null;
          let srState = '';
          if (review) {
            if (marked && t.correct) {
              style.background = 'var(--ok-soft)'; style.color = 'var(--ok)'; style.fontWeight = 700;
              suffix = '✓'; srState = 'juist gemarkeerd';
            } else if (marked) {
              style.background = 'var(--err-soft)'; style.color = 'var(--err)'; style.textDecoration = 'line-through';
              suffix = '✗'; srState = 'fout gemarkeerd';
            } else if (t.correct) {
              style.border = '2px dotted var(--warn)';
              srState = 'gemist doelwoord';
            }
          } else if (marked) {
            // gemarkeerd = gele achtergrond én onderstreping (niet alleen kleur)
            style.background = 'var(--warn-soft)';
            style.textDecoration = 'underline 2.5px var(--warn)';
            style.textUnderlineOffset = 3;
          }
          return (
            <React.Fragment key={i}>
              {i > 0 && ' '}
              <button
                type="button"
                disabled={review}
                aria-pressed={marked}
                aria-label={srState ? `${t.text} — ${srState}` : undefined}
                style={style}
                onClick={() => toggle(i)}
              >
                {t.text}{suffix && <span aria-hidden> {suffix}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </p>
    </div>
  );
}

function gradeMarkText(q: MarkTextQuestion, answer: unknown): ItemScore {
  const tokens = markTokens(q.text);
  const max = q.points;
  const total = tokens.filter((t) => t.correct).length;
  if (total === 0) return { earned: 0, max, mode: 'auto' };
  const sel = Array.isArray(answer)
    ? [...new Set((answer as unknown[]).filter((i): i is number =>
        typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < tokens.length))]
    : [];
  const good = sel.filter((i) => tokens[i].correct).length;
  const bad = sel.length - good;
  const frac = Math.max(0, (good - (q.penalizeWrong ? bad : 0)) / total);
  return { earned: round2(frac * max), max, mode: 'auto' };
}

const marktext: ExtraQType<MarkTextQuestion> = {
  type: 'marktext',
  name: 'Woorden markeren',
  icon: '🖍',
  desc: 'Juiste woorden in een tekst aanklikken',
  make: (base) => ({ ...base, type: 'marktext', text: '', penalizeWrong: false }),
  Editor: MarkTextEditor,
  Answer: MarkTextAnswer,
  grade: gradeMarkText,
  tts: (q) => [q.text.replace(/[[\]]/g, '')],
  summary: (q) => {
    const n = markTokens(q.text).filter((t) => t.correct).length;
    return `${n} ${n === 1 ? 'doelwoord' : 'doelwoorden'}`;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// sort — Sorteren in categorieën 🗂️
// ═══════════════════════════════════════════════════════════════════════════

function SortEditor({ q, onChange }: { q: SortQuestion; onChange: (q: SortQuestion) => void }) {
  return (
    <div>
      <Field label="Categorieën" hint="Bij het verwijderen van een categorie verhuizen haar items naar de eerste.">
        <div>
          {q.categories.map((c, ci) => (
            <div className="option-row" key={c.id}>
              <input
                className="input input-sm"
                placeholder={`Categorie ${ci + 1}`}
                value={c.name}
                onChange={(e) => {
                  const categories = q.categories.slice();
                  categories[ci] = { ...c, name: e.target.value };
                  onChange({ ...q, categories });
                }}
              />
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Categorie ${ci + 1} verwijderen`}
                disabled={q.categories.length <= 2}
                onClick={() => {
                  const rest = q.categories.filter((_, j) => j !== ci);
                  const eerste = rest[0];
                  onChange({
                    ...q,
                    categories: rest,
                    items: q.items.map((it) => (it.categoryId === c.id ? { ...it, categoryId: eerste.id } : it)),
                  });
                }}
              >✕</button>
            </div>
          ))}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onChange({ ...q, categories: [...q.categories, { id: uid(), name: '' }] })}
          >+ Categorie toevoegen</button>
        </div>
      </Field>
      <Field label="Items" hint="Kies per item de juiste categorie. De leerling krijgt de items geschud te zien.">
        <div>
          {q.items.map((it, ii) => (
            <div className="option-row" key={it.id}>
              <input
                className="input input-sm"
                placeholder={`Item ${ii + 1}`}
                value={it.text}
                onChange={(e) => {
                  const items = q.items.slice();
                  items[ii] = { ...it, text: e.target.value };
                  onChange({ ...q, items });
                }}
              />
              <select
                className="select"
                style={{ maxWidth: 210 }}
                value={it.categoryId}
                aria-label={`Juiste categorie voor item ${ii + 1}`}
                onChange={(e) => {
                  const items = q.items.slice();
                  items[ii] = { ...it, categoryId: e.target.value };
                  onChange({ ...q, items });
                }}
              >
                {q.categories.map((c, ci) => (
                  <option key={c.id} value={c.id}>{c.name || `Categorie ${ci + 1}`}</option>
                ))}
              </select>
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Item ${ii + 1} verwijderen`}
                onClick={() => onChange({ ...q, items: q.items.filter((_, j) => j !== ii) })}
              >✕</button>
            </div>
          ))}
          <button
            className="btn btn-sm btn-ghost"
            disabled={q.categories.length === 0}
            onClick={() => onChange({ ...q, items: [...q.items, { id: uid(), text: '', categoryId: q.categories[0].id }] })}
          >+ Item toevoegen</button>
        </div>
      </Field>
    </div>
  );
}

function SortAnswer({ q, value, onChange, review }: AnswerProps<SortQuestion>) {
  const placed = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, string>;
  const [selected, setSelected] = useState<string | null>(null);
  const order = useMemo(() => shuffled(q.items.map((it) => it.id)), [q.id]);
  const byId = useMemo(() => new Map(q.items.map((it) => [it.id, it] as const)), [q.items]);
  const validCat = useMemo(() => new Set(q.categories.map((c) => c.id)), [q.categories]);

  const catLabel = (id: string): string => {
    const ci = q.categories.findIndex((c) => c.id === id);
    return ci < 0 ? '—' : (q.categories[ci].name || `Categorie ${ci + 1}`);
  };
  /** Geldige plaatsing van een item, of null als (nog) niet geplaatst. */
  const placedCat = (itemId: string): string | null => {
    const c = placed[itemId] as string | undefined;
    return c && validCat.has(c) ? c : null;
  };

  if (review) {
    const loose = q.items.filter((it) => placedCat(it.id) === null);
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {q.categories.map((cat, ci) => (
          <div
            key={cat.id}
            style={{ flex: '1 1 190px', minWidth: 160, border: '2px solid var(--line)', borderRadius: 12, padding: 10 }}
          >
            <strong style={{ display: 'block', marginBottom: 8 }}>{cat.name || `Categorie ${ci + 1}`}</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 30 }}>
              {q.items.filter((it) => placedCat(it.id) === cat.id).map((it) => {
                const ok = it.categoryId === cat.id;
                return (
                  <span
                    key={it.id}
                    className="chip"
                    style={{
                      cursor: 'default',
                      borderColor: ok ? 'var(--ok)' : 'var(--err)',
                      background: ok ? 'var(--ok-soft)' : 'var(--err-soft)',
                    }}
                  >
                    <span aria-hidden>{ok ? '✓' : '✗'}</span> {it.text}
                    {!ok && <small style={{ color: 'var(--text-soft)' }}> → {catLabel(it.categoryId)}</small>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        {loose.length > 0 && (
          <div style={{ flexBasis: '100%' }}>
            <p style={{ color: 'var(--err)', fontWeight: 700, margin: '4px 0 6px' }}>✗ Niet geplaatst:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {loose.map((it) => (
                <span key={it.id} className="chip" style={{ cursor: 'default', borderColor: 'var(--err)', background: 'var(--err-soft)' }}>
                  {it.text} <small style={{ color: 'var(--text-soft)' }}>→ {catLabel(it.categoryId)}</small>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const unplaced = order
    .map((id) => byId.get(id))
    .filter((it): it is SortQuestion['items'][number] => !!it && placedCat(it.id) === null);
  const selectedItem = selected ? byId.get(selected) : undefined;

  return (
    <div>
      <p className="hint">
        Klik een item en daarna de categorie waar het bij hoort. Klik een geplaatst item aan om het terug te nemen.
      </p>
      <div
        role="group"
        aria-label="Nog te plaatsen items"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, minHeight: 34, alignItems: 'center' }}
      >
        {unplaced.length === 0 && <span className="hint">Alles geplaatst.</span>}
        {unplaced.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`chip ${selected === it.id ? 'placed' : ''}`}
            aria-pressed={selected === it.id}
            onClick={() => setSelected(selected === it.id ? null : it.id)}
          >
            {it.text}
          </button>
        ))}
      </div>
      <p className="hint" aria-live="polite" style={{ minHeight: '1.2em', margin: '0 0 8px' }}>
        {selectedItem ? `"${selectedItem.text}" geselecteerd — klik nu een categorie.` : ''}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {q.categories.map((cat, ci) => {
          const name = cat.name || `Categorie ${ci + 1}`;
          const inBox = q.items.filter((it) => placedCat(it.id) === cat.id);
          return (
            <div
              key={cat.id}
              style={{ flex: '1 1 190px', minWidth: 160, border: '2px solid var(--line)', borderRadius: 12, padding: 10 }}
            >
              <button
                type="button"
                className={`btn btn-sm ${selectedItem ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                disabled={!selectedItem}
                aria-label={selectedItem ? `Plaats "${selectedItem.text}" in ${name}` : name}
                onClick={() => {
                  if (!selected) return;
                  onChange({ ...placed, [selected]: cat.id });
                  setSelected(null);
                }}
              >
                {name}{selectedItem ? ' ⬇' : ''}
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 30 }}>
                {inBox.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="chip placed"
                    aria-label={`"${it.text}" terugnemen uit ${name}`}
                    onClick={() => {
                      const next = { ...placed };
                      delete next[it.id];
                      onChange(next);
                      setSelected(it.id); // meteen klaar om opnieuw te plaatsen
                    }}
                  >
                    {it.text} <span aria-hidden>✕</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function gradeSort(q: SortQuestion, answer: unknown): ItemScore {
  const max = q.points;
  const n = q.items.length;
  if (n === 0) return { earned: 0, max, mode: 'auto' };
  const placed = (answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {}) as Record<string, string>;
  let good = 0;
  for (const it of q.items) if (placed[it.id] === it.categoryId) good++; // onbeplaatst = fout
  return { earned: round2((good / n) * max), max, mode: 'auto' };
}

const sort: ExtraQType<SortQuestion> = {
  type: 'sort',
  name: 'Sorteren in categorieën',
  icon: '🗂️',
  desc: 'Items in de juiste categorie plaatsen',
  make: (base) => ({
    ...base,
    type: 'sort',
    categories: [{ id: uid(), name: '' }, { id: uid(), name: '' }],
    items: [],
  }),
  Editor: SortEditor,
  Answer: SortAnswer,
  grade: gradeSort,
  tts: (q) => {
    const out: string[] = [];
    const cats = q.categories.map((c) => c.name).filter((s) => s.trim());
    const items = q.items.map((it) => it.text).filter((s) => s.trim());
    if (cats.length) out.push('Categorieën: ' + cats.join(', '));
    if (items.length) out.push('Items: ' + items.join(', '));
    return out;
  },
  summary: (q) =>
    `${q.categories.length} ${q.categories.length === 1 ? 'categorie' : 'categorieën'} · ` +
    `${q.items.length} ${q.items.length === 1 ? 'item' : 'items'}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// imagepoint — Aanduiden op afbeelding 📍
// ═══════════════════════════════════════════════════════════════════════════

type PointMarker = { x: number; y: number };

/** Cirkelzone als overlay (x/y/r in % van de afbeeldingsbreedte). */
function ZoneCircle({
  x, y, r, color, dashed, fill, children,
}: {
  x: number; y: number; r: number; color: string; dashed?: boolean; fill?: boolean; children?: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        width: `${r * 2}%`, aspectRatio: '1',
        transform: 'translate(-50%, -50%)', borderRadius: '50%',
        border: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}`,
        background: fill ? `color-mix(in srgb, ${color} 22%, transparent)` : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontWeight: 800, fontSize: '0.82rem', textAlign: 'center', overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {children}
    </span>
  );
}

/** Genummerde stip voor een klik van de leerling. */
function MarkerDot({ x, y, n, color }: { x: number; y: number; n: number; color: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
        width: 26, height: 26, borderRadius: '50%',
        background: color, color: '#fff', border: '2px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: '0.8rem', pointerEvents: 'none',
      }}
    >
      {n}
    </span>
  );
}

/**
 * Gulzige koppeling: elke marker (in klikvolgorde) claimt de dichtstbijzijnde
 * nog vrije zone binnen haar straal. Eén marker per zone.
 */
function matchMarkers(targets: ImagePointQuestion['targets'], markers: PointMarker[]) {
  const claimed = new Map<string, number>(); // zone-id → markerindex
  const markerHit: (string | null)[] = markers.map(() => null);
  markers.forEach((m, mi) => {
    let best: { id: string; d: number } | null = null;
    for (const t of targets) {
      if (claimed.has(t.id)) continue;
      const d = Math.hypot(m.x - t.x, m.y - t.y);
      if (d <= t.r && (!best || d < best.d)) best = { id: t.id, d };
    }
    if (best) {
      claimed.set(best.id, mi);
      markerHit[mi] = best.id;
    }
  });
  return { claimed, markerHit };
}

function zoneLabel(t: ImagePointQuestion['targets'][number], i: number): string {
  return t.label?.trim() || `Zone ${i + 1}`;
}

function ImagePointEditor({ q, onChange }: { q: ImagePointQuestion; onChange: (q: ImagePointQuestion) => void }) {
  /** Zones vervangen; maxClicks volgt automatisch het aantal zones. */
  const setTargets = (targets: ImagePointQuestion['targets']) =>
    onChange({ ...q, targets, maxClicks: Math.max(1, targets.length) });

  return (
    <div>
      <ImagePicker value={q.image || undefined} onChange={(url) => onChange({ ...q, image: url ?? '' })} />
      {!q.image && <p className="hint">Kies eerst een afbeelding; daarna klik je er zones op aan.</p>}
      {q.image && (
        <>
          <p className="hint">
            Klik op de afbeelding om een zone toe te voegen (met het toetsenbord komt de zone in het midden).
          </p>
          <button
            type="button"
            aria-label="Zone toevoegen op de afbeelding"
            style={{
              display: 'block', width: '100%', padding: 0, background: 'none',
              border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden',
              cursor: 'crosshair', position: 'relative',
            }}
            onClick={(e) => {
              const p = relPos(e) ?? { x: 50, y: 50 };
              setTargets([...q.targets, { id: uid(), x: p.x, y: p.y, r: 8 }]);
            }}
          >
            <img src={q.image} alt="" style={{ display: 'block', width: '100%' }} />
            {q.targets.map((t, i) => (
              <ZoneCircle key={t.id} x={t.x} y={t.y} r={t.r} color="var(--brand)" fill>{i + 1}</ZoneCircle>
            ))}
          </button>
          <div style={{ marginTop: 8 }}>
            {q.targets.map((t, i) => (
              <div className="option-row" key={t.id}>
                <span className="badge badge-brand">{i + 1}</span>
                <input
                  className="input input-sm"
                  placeholder="Label (optioneel)"
                  value={t.label ?? ''}
                  aria-label={`Label van zone ${i + 1}`}
                  onChange={(e) => {
                    const targets = q.targets.slice();
                    targets[i] = { ...t, label: e.target.value };
                    onChange({ ...q, targets });
                  }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>
                  straal
                  <input
                    type="range" min={3} max={25} step={1} value={t.r}
                    aria-label={`Straal van zone ${i + 1} in procent`}
                    onChange={(e) => {
                      const targets = q.targets.slice();
                      targets[i] = { ...t, r: clamp(parseInt(e.target.value) || 8, 3, 25) };
                      onChange({ ...q, targets });
                    }}
                  />
                  {t.r}%
                </label>
                <button
                  className="btn btn-quiet btn-icon btn-sm"
                  aria-label={`Zone ${i + 1} verwijderen`}
                  onClick={() => setTargets(q.targets.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}
          </div>
          <Field label="Maximaal aantal klikken" hint="Wordt automatisch gelijkgezet aan het aantal zones; pas het aan als je meer of minder klikken wil toestaan.">
            <input
              className="input input-sm" type="number" min={1} max={20} style={{ maxWidth: 110 }}
              value={q.maxClicks}
              onChange={(e) => onChange({ ...q, maxClicks: clamp(parseInt(e.target.value) || 1, 1, 20) })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

function ImagePointAnswer({ q, value, onChange, review }: AnswerProps<ImagePointQuestion>) {
  const [status, setStatus] = useState('');
  const markers: PointMarker[] = Array.isArray(value)
    ? (value as unknown[]).filter((m): m is PointMarker =>
        !!m && typeof m === 'object' && typeof (m as PointMarker).x === 'number' && typeof (m as PointMarker).y === 'number')
    : [];
  const maxClicks = Math.max(1, q.maxClicks || q.targets.length || 1);

  if (!q.image) return <p className="hint">⚠ Deze vraag heeft nog geen afbeelding.</p>;

  if (review) {
    const { claimed, markerHit } = matchMarkers(q.targets, markers);
    return (
      <div>
        <div style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <img src={q.image} alt="" style={{ display: 'block', width: '100%' }} />
          {q.targets.map((t, i) => (
            claimed.has(t.id)
              ? <ZoneCircle key={t.id} x={t.x} y={t.y} r={t.r} color="var(--ok)" />
              : <ZoneCircle key={t.id} x={t.x} y={t.y} r={t.r} color="var(--err)" dashed>{zoneLabel(t, i)}</ZoneCircle>
          ))}
          {markers.map((m, i) => (
            <MarkerDot key={i} x={m.x} y={m.y} n={i + 1} color={markerHit[i] ? 'var(--ok)' : 'var(--err)'} />
          ))}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
          {markers.map((m, i) => {
            const hitId = markerHit[i];
            const ti = hitId ? q.targets.findIndex((t) => t.id === hitId) : -1;
            return (
              <li key={i} style={{ color: hitId ? 'var(--ok)' : 'var(--err)', fontWeight: 600, fontSize: '0.9rem' }}>
                {hitId ? `✓ Markering ${i + 1}: in ${zoneLabel(q.targets[ti], ti)}` : `✗ Markering ${i + 1}: buiten de zones`}
              </li>
            );
          })}
          {markers.length === 0 && <li className="hint">Geen markeringen gezet.</li>}
          {q.targets.filter((t) => !claimed.has(t.id)).map((t) => {
            const ti = q.targets.findIndex((x) => x.id === t.id);
            return (
              <li key={t.id} style={{ color: 'var(--err)', fontWeight: 600, fontSize: '0.9rem' }}>
                ✗ Gemist: {zoneLabel(t, ti)} (gestippelde cirkel)
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="hint">
        Klik op de afbeelding om een markering te zetten (maximaal {maxClicks}; daarna vervangt een nieuwe klik de oudste).
      </p>
      <button
        type="button"
        aria-label={`Markering zetten op de afbeelding (${markers.length} van ${maxClicks} gezet)`}
        style={{
          display: 'block', width: '100%', padding: 0, background: 'none',
          border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden',
          cursor: 'crosshair', position: 'relative',
        }}
        onClick={(e) => {
          const p = relPos(e) ?? { x: 50, y: 50 };
          let next = [...markers, p];
          if (next.length > maxClicks) {
            next = next.slice(next.length - maxClicks); // oudste vervalt
            setStatus(`Maximum van ${maxClicks} bereikt: de oudste markering is vervangen.`);
          } else {
            setStatus(`Markering ${next.length} geplaatst.`);
          }
          onChange(next);
        }}
      >
        <img src={q.image} alt="" style={{ display: 'block', width: '100%' }} />
        {markers.map((m, i) => (
          <MarkerDot key={i} x={m.x} y={m.y} n={i + 1} color="var(--player-accent, var(--brand))" />
        ))}
      </button>
      <div style={{ marginTop: 8 }}>
        <strong style={{ fontSize: '0.9rem' }}>Jouw markeringen</strong>
        {markers.length === 0 ? (
          <p className="hint" style={{ margin: '4px 0 0' }}>Nog geen markeringen.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 4 }}>
            {markers.map((m, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-brand">{i + 1}</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                  x {Math.round(m.x)}%, y {Math.round(m.y)}%
                </span>
                <button
                  className="btn btn-quiet btn-icon btn-sm"
                  aria-label={`Markering ${i + 1} verwijderen`}
                  onClick={() => {
                    onChange(markers.filter((_, j) => j !== i));
                    setStatus(`Markering ${i + 1} verwijderd.`);
                  }}
                >✕</button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint" aria-live="polite" style={{ minHeight: '1.2em', margin: '6px 0 0' }}>{status}</p>
      </div>
    </div>
  );
}

function gradeImagePoint(q: ImagePointQuestion, answer: unknown): ItemScore {
  const max = q.points;
  const n = q.targets.length;
  if (n === 0) return { earned: 0, max, mode: 'auto' };
  const markers: PointMarker[] = Array.isArray(answer)
    ? (answer as unknown[]).filter((m): m is PointMarker =>
        !!m && typeof m === 'object' && typeof (m as PointMarker).x === 'number' && typeof (m as PointMarker).y === 'number')
    : [];
  const { claimed } = matchMarkers(q.targets, markers);
  return { earned: round2((claimed.size / n) * max), max, mode: 'auto' };
}

const imagepoint: ExtraQType<ImagePointQuestion> = {
  type: 'imagepoint',
  name: 'Aanduiden op afbeelding',
  icon: '📍',
  desc: 'De juiste plek(ken) op een afbeelding aanklikken',
  make: (base) => ({ ...base, type: 'imagepoint', image: '', targets: [], maxClicks: 1 }),
  Editor: ImagePointEditor,
  Answer: ImagePointAnswer,
  grade: gradeImagePoint,
  summary: (q) => `${q.targets.length} ${q.targets.length === 1 ? 'zone' : 'zones'}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// table — Invultabel 🧮
// ═══════════════════════════════════════════════════════════════════════════

type TableRow = TableQuestion['rows'][number];

/** Rij-arrays op kolomlengte brengen (nieuwe kolommen = vaste lege cellen). */
function padRow(row: TableRow, n: number): TableRow {
  const cells = row.cells.slice();
  const answers = row.answers.slice();
  while (cells.length < n) cells.push('');
  while (answers.length < n) answers.push(null);
  return { ...row, cells, answers };
}

function countInputCells(q: TableQuestion): number {
  return q.rows.reduce((acc, r) => acc + r.answers.filter((a) => a !== null && a !== undefined).length, 0);
}

const tdEditStyle: React.CSSProperties = { padding: 2, verticalAlign: 'top' };

function TableEditor({ q, onChange }: { q: TableQuestion; onChange: (q: TableQuestion) => void }) {
  const inputCells = countInputCells(q);

  const updateRow = (ri: number, next: TableRow) => {
    const rows = q.rows.slice();
    rows[ri] = next;
    onChange({ ...q, rows });
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
          <thead>
            <tr>
              {q.columns.map((col, ci) => (
                <th key={ci} style={{ ...tdEditStyle, minWidth: 150 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      className="input input-sm"
                      style={{ fontWeight: 700 }}
                      placeholder={`Kolom ${ci + 1}`}
                      value={col}
                      aria-label={`Kolomkop ${ci + 1}`}
                      onChange={(e) => {
                        const columns = q.columns.slice();
                        columns[ci] = e.target.value;
                        onChange({ ...q, columns });
                      }}
                    />
                    <button
                      className="btn btn-quiet btn-icon btn-sm"
                      aria-label={`Kolom ${ci + 1} verwijderen`}
                      disabled={q.columns.length <= 1}
                      onClick={() => onChange({
                        ...q,
                        columns: q.columns.filter((_, j) => j !== ci),
                        rows: q.rows.map((r) => {
                          const p = padRow(r, q.columns.length);
                          return { ...p, cells: p.cells.filter((_, j) => j !== ci), answers: p.answers.filter((_, j) => j !== ci) };
                        }),
                      })}
                    >✕</button>
                  </div>
                </th>
              ))}
              <th style={tdEditStyle}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => onChange({
                    ...q,
                    columns: [...q.columns, ''],
                    rows: q.rows.map((r) => padRow(r, q.columns.length + 1)),
                  })}
                >+ Kolom</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.rows.map((row, ri) => (
              <tr key={row.id}>
                {q.columns.map((_, ci) => {
                  const fixed = (row.answers[ci] ?? null) === null;
                  const text = fixed ? (row.cells[ci] ?? '') : (row.answers[ci] ?? '');
                  return (
                    <td key={ci} style={tdEditStyle}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          className="input input-sm"
                          style={fixed ? undefined : { borderStyle: 'dashed', borderColor: 'var(--brand)' }}
                          value={text}
                          placeholder={fixed ? 'vaste tekst' : 'juiste antwoord'}
                          aria-label={`Rij ${ri + 1}, kolom ${ci + 1}${fixed ? ' (vaste tekst)' : ' (invulcel: juiste antwoord)'}`}
                          onChange={(e) => {
                            const r = padRow(row, q.columns.length);
                            if (fixed) r.cells[ci] = e.target.value;
                            else { r.answers[ci] = e.target.value; r.cells[ci] = ''; }
                            updateRow(ri, r);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-quiet btn-icon btn-sm"
                          aria-pressed={!fixed}
                          aria-label={`Rij ${ri + 1}, kolom ${ci + 1}: ${fixed ? 'vaste tekst — maak er een invulcel van' : 'invulcel — maak er vaste tekst van'}`}
                          title={fixed ? 'Vaste tekst (klik om er een invulcel van te maken)' : 'Invulcel (klik om er vaste tekst van te maken)'}
                          onClick={() => {
                            const r = padRow(row, q.columns.length);
                            if (fixed) { r.answers[ci] = r.cells[ci] ?? ''; r.cells[ci] = ''; }
                            else { r.cells[ci] = r.answers[ci] ?? ''; r.answers[ci] = null; }
                            updateRow(ri, r);
                          }}
                        >
                          {fixed ? '🔒' : '✏️'}
                        </button>
                      </div>
                    </td>
                  );
                })}
                <td style={tdEditStyle}>
                  <button
                    className="btn btn-quiet btn-icon btn-sm"
                    aria-label={`Rij ${ri + 1} verwijderen`}
                    onClick={() => onChange({ ...q, rows: q.rows.filter((_, j) => j !== ri) })}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="btn btn-sm btn-ghost"
        style={{ marginTop: 4 }}
        onClick={() => onChange({
          ...q,
          rows: [...q.rows, { id: uid(), cells: q.columns.map(() => ''), answers: q.columns.map(() => null) }],
        })}
      >+ Rij toevoegen</button>
      <CheckRow
        checked={q.caseSensitive}
        onChange={(caseSensitive) => onChange({ ...q, caseSensitive })}
        label="Hoofdlettergevoelig"
      />
      {q.rows.length > 0 && inputCells === 0 && (
        <p className="hint" style={{ color: 'var(--warn)', fontWeight: 700 }}>
          ⚠ Er is nog geen enkele invulcel — klik bij een cel op 🔒 om er een invulcel (✏️) van te maken.
        </p>
      )}
      <p className="hint">
        🔒 = vaste tekst (staat er al voor de leerling) · ✏️ = invulcel: de getypte tekst wordt het juiste antwoord.
        Invulcellen herken je aan de gestreepte rand.
      </p>
    </div>
  );
}

const thAnswerStyle: React.CSSProperties = {
  border: '1px solid var(--line)', padding: '8px 10px', textAlign: 'left',
  background: 'var(--bg-sunken)', fontSize: '0.88rem',
};
const tdAnswerStyle: React.CSSProperties = {
  border: '1px solid var(--line)', padding: '8px 10px', textAlign: 'left', verticalAlign: 'top',
};

function TableAnswer({ q, value, onChange, review }: AnswerProps<TableQuestion>) {
  const given = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as
    Record<string, Record<number, string>>;
  if (q.columns.length === 0 || q.rows.length === 0) return <p className="hint">⚠ Deze tabel heeft nog geen inhoud.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: q.columns.length * 130 }}>
        <thead>
          <tr>
            {q.columns.map((c, ci) => <th key={ci} scope="col" style={thAnswerStyle}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {q.rows.map((row, ri) => (
            <tr key={row.id}>
              {q.columns.map((_, ci) => {
                const ans = row.answers[ci] ?? null;
                if (ans === null) return <td key={ci} style={tdAnswerStyle}>{row.cells[ci] ?? ''}</td>;
                const v = given[row.id]?.[ci] ?? '';
                const ok = normalizeAnswer(v, q.caseSensitive) === normalizeAnswer(ans, q.caseSensitive);
                return (
                  <td key={ci} style={tdAnswerStyle}>
                    <input
                      className="input input-sm"
                      style={{
                        minWidth: 100,
                        ...(review
                          ? { borderColor: ok ? 'var(--ok)' : 'var(--err)', color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }
                          : { borderStyle: 'dashed' }),
                      }}
                      value={v}
                      disabled={review}
                      aria-label={`Rij ${ri + 1}, kolom ${q.columns[ci]?.trim() || ci + 1}`}
                      onChange={(e) => onChange({
                        ...given,
                        [row.id]: { ...(given[row.id] ?? {}), [ci]: e.target.value },
                      })}
                    />
                    {review && (
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: 3, color: ok ? 'var(--ok)' : 'var(--err)' }}>
                        {ok ? '✓ juist' : <>✗ <span style={{ color: 'var(--ok)' }}>juist: {ans}</span></>}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function gradeTable(q: TableQuestion, answer: unknown): ItemScore {
  const max = q.points;
  const cells: { rowId: string; ci: number; ans: string }[] = [];
  for (const r of q.rows) {
    r.answers.forEach((a, ci) => {
      if (a !== null && a !== undefined) cells.push({ rowId: r.id, ci, ans: a });
    });
  }
  if (cells.length === 0) return { earned: 0, max, mode: 'auto' };
  const given = (answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {}) as
    Record<string, Record<number, string>>;
  let good = 0;
  for (const c of cells) {
    const v = given[c.rowId]?.[c.ci];
    // "Brussel|Bruxelles" = alternatieven; elk ervan telt als juist.
    const alts = c.ans.split('|').map((s) => normalizeAnswer(s.trim(), q.caseSensitive)).filter(Boolean);
    if (typeof v === 'string' && alts.includes(normalizeAnswer(v, q.caseSensitive))) good++;
  }
  return { earned: round2((good / cells.length) * max), max, mode: 'auto' };
}

const table: ExtraQType<TableQuestion> = {
  type: 'table',
  name: 'Invultabel',
  icon: '🧮',
  desc: 'Ontbrekende cellen in een tabel invullen',
  make: (base) => ({ ...base, type: 'table', columns: ['', ''], rows: [], caseSensitive: false }),
  Editor: TableEditor,
  Answer: TableAnswer,
  grade: gradeTable,
  tts: (q) => {
    const out: string[] = [];
    const koppen = q.columns.filter((c) => c.trim());
    if (koppen.length) out.push('Kolommen: ' + koppen.join(', '));
    const vast = q.rows.flatMap((r) => r.cells.filter((c, i) => (r.answers[i] ?? null) === null && c.trim()));
    if (vast.length) out.push(...vast);
    return out;
  },
  summary: (q) =>
    `${q.rows.length} ${q.rows.length === 1 ? 'rij' : 'rijen'} × ` +
    `${q.columns.length} ${q.columns.length === 1 ? 'kolom' : 'kolommen'} · ` +
    `${countInputCells(q)} invulcellen`,
};

// ═══════════════════════════════════════════════════════════════════════════

export const INTERACT_QTYPES: Partial<Record<QuestionType, ExtraQType<any>>> = {
  marktext, sort, imagepoint, table,
};
