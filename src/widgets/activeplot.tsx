import React, { useEffect, useMemo, useState } from 'react';
import type { ActivePlotConfig, PlotParam } from '../lib/types';
import { clamp, uid } from '../lib/utils';
import { Field } from '../components/ui';
import { EditorProps, ItemHeader, moveItem, PlayerProps } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// Veilige expressie-parser (recursive descent, GEEN eval/Function)
//
// Grammatica (hoog → laag bindend):
//   ^          machtsverheffing, RECHTS-associatief, bindt sterker dan unaire min
//   unaire -   (en unaire +)
//   * /        links-associatief
//   + -        links-associatief
//
//   expr   := term  (('+' | '-') term)*
//   term   := unary (('*' | '/') unary)*
//   unary  := ('-' | '+') unary | power
//   power  := atom ('^' unary)?          ← exponent via unary ⇒ rechts-assoc.
//   atom   := getal | ident | functie '(' expr ')' | '(' expr ')'
//
// Zelftest (alle uitkomsten handmatig geverifieerd):
//   "1+2*3"                       → 7          (* boven +)
//   "(1+2)*3"                     → 9
//   "6-3-2"                       → 1          (- links-associatief)
//   "6/3/2"                       → 1          (/ links-associatief)
//   "2^3^2"                       → 512        (rechts-assoc.: 2^(3^2))
//   "-2^2"                        → -4         (^ bindt sterker dan unaire min)
//   "(-2)^2"                      → 4
//   "2^-3"                        → 0.125      (unaire min in exponent mag)
//   "--4"                         → 4
//   "2*-3"                        → -6
//   "sin(pi/2)"                   → 1
//   "cos(0)"                      → 1
//   "sqrt(9)"                     → 3
//   "abs(-5)"                     → 5
//   "log(100)"                    → 2          (log = logaritme grondtal 10)
//   "ln(e)"                       → 1          (ln = natuurlijke logaritme)
//   "exp(1)"                      → 2.71828…   (= e)
//   "a*x^2+b"  met x=2,a=3,b=1    → 13
//   "1,5+1"                       → 2.5        (komma als decimaalteken toegelaten)
//   "1/x"      met x=0            → Infinity   (wordt bij het tekenen overgeslagen)
//   "sqrt(x)"  met x=-4           → NaN        (wordt bij het tekenen overgeslagen)
//   "2x"                          → fout: gebruik * voor vermenigvuldiging
//   "x+"                          → fout: onverwacht einde
//   "sin x"                       → fout: haakjes verplicht na functienaam
//   "foo(x)"                      → fout: onbekende functie
//   "x + ?"                       → fout: onbekend teken
// ─────────────────────────────────────────────────────────────────────────────

type Params = Record<string, number>;
export type PlotEvalFn = (x: number, params: Params) => number;

export type ParseResult =
  | { ok: true; fn: PlotEvalFn; variables: string[] }
  | { ok: false; error: string };

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Namen die niet als parameternaam gebruikt mogen worden. */
const RESERVED = new Set(['x', ...Object.keys(CONSTANTS), ...Object.keys(FUNCTIONS)]);

class ExprError extends Error {}

interface Tok {
  kind: 'num' | 'ident' | 'sym';
  text: string;
  pos: number;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (/\s/.test(c)) { i++; continue; }
    // getal: cijfers met optioneel één decimaalteken ('.' of ','), ook ".5"
    if (/[0-9]/.test(c) || ((c === '.' || c === ',') && /[0-9]/.test(src.charAt(i + 1)))) {
      let j = i;
      let seenDot = false;
      while (j < src.length) {
        const d = src.charAt(j);
        if (/[0-9]/.test(d)) { j++; continue; }
        if ((d === '.' || d === ',') && !seenDot) { seenDot = true; j++; continue; }
        break;
      }
      toks.push({ kind: 'num', text: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // identifier: één of meer letters (functies, pi, e, x, parameternamen)
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src.charAt(j))) j++;
      toks.push({ kind: 'ident', text: src.slice(i, j).toLowerCase(), pos: i });
      i = j;
      continue;
    }
    if ('+-*/^()'.includes(c)) { toks.push({ kind: 'sym', text: c, pos: i }); i++; continue; }
    // vriendelijke aliassen voor tekens van toetsenbord/kopieerwerk
    if (c === '×' || c === '·') { toks.push({ kind: 'sym', text: '*', pos: i }); i++; continue; }
    if (c === '÷' || c === ':') { toks.push({ kind: 'sym', text: '/', pos: i }); i++; continue; }
    if (c === '−' || c === '–') { toks.push({ kind: 'sym', text: '-', pos: i }); i++; continue; }
    throw new ExprError(`Onbekend teken '${c}' op positie ${i + 1}.`);
  }
  return toks;
}

function compile(src: string): { fn: PlotEvalFn; variables: string[] } {
  const toks = tokenize(src);
  if (toks.length === 0) throw new ExprError('Typ eerst een uitdrukking, bv. a*x^2 + b.');
  let p = 0;
  const vars = new Set<string>();

  const peek = (): Tok | undefined => toks[p];
  const isSym = (s: string): boolean => {
    const t = toks[p];
    return t !== undefined && t.kind === 'sym' && t.text === s;
  };
  const expectClose = (): void => {
    if (!isSym(')')) {
      const t = peek();
      throw new ExprError(t
        ? `Sluithaakje ')' verwacht op positie ${t.pos + 1}, maar '${t.text}' gevonden.`
        : `Er ontbreekt een sluithaakje ')'.`);
    }
    p++;
  };

  function parseExpr(): PlotEvalFn {
    let left = parseTerm();
    while (isSym('+') || isSym('-')) {
      const op = toks[p++].text;
      const l = left;
      const r = parseTerm();
      left = op === '+'
        ? (x, ps) => l(x, ps) + r(x, ps)
        : (x, ps) => l(x, ps) - r(x, ps);
    }
    return left;
  }

  function parseTerm(): PlotEvalFn {
    let left = parseUnary();
    while (isSym('*') || isSym('/')) {
      const op = toks[p++].text;
      const l = left;
      const r = parseUnary();
      left = op === '*'
        ? (x, ps) => l(x, ps) * r(x, ps)
        : (x, ps) => l(x, ps) / r(x, ps);
    }
    return left;
  }

  function parseUnary(): PlotEvalFn {
    if (isSym('-')) {
      p++;
      const inner = parseUnary();
      return (x, ps) => -inner(x, ps);
    }
    if (isSym('+')) { p++; return parseUnary(); }
    return parsePower();
  }

  function parsePower(): PlotEvalFn {
    const base = parseAtom();
    if (isSym('^')) {
      p++;
      // exponent via parseUnary ⇒ rechts-associatief én "2^-3" werkt
      const exp = parseUnary();
      return (x, ps) => Math.pow(base(x, ps), exp(x, ps));
    }
    return base;
  }

  function parseAtom(): PlotEvalFn {
    const t = peek();
    if (!t) throw new ExprError('Onverwacht einde van de uitdrukking.');
    if (t.kind === 'num') {
      p++;
      const v = parseFloat(t.text.replace(',', '.'));
      return () => v;
    }
    if (t.kind === 'ident') {
      p++;
      const name = t.text;
      // own-property check: 'constructor' e.d. mogen niet via de prototype-keten binnenkomen
      const mathFn = Object.prototype.hasOwnProperty.call(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
      if (mathFn) {
        if (!isSym('(')) throw new ExprError(`Na '${name}' horen haakjes: ${name}(…).`);
        p++;
        const arg = parseExpr();
        expectClose();
        return (x, ps) => mathFn(arg(x, ps));
      }
      if (isSym('(')) {
        throw new ExprError(`Onbekende functie '${name}'. Beschikbaar: sin, cos, tan, sqrt, abs, log, ln, exp.`);
      }
      if (name === 'x') return (x) => x;
      const constVal = Object.prototype.hasOwnProperty.call(CONSTANTS, name) ? CONSTANTS[name] : undefined;
      if (constVal !== undefined) return () => constVal;
      vars.add(name);
      return (_x, ps) => {
        const v = ps[name];
        return v === undefined ? NaN : v;
      };
    }
    if (t.text === '(') {
      p++;
      const inner = parseExpr();
      expectClose();
      return inner;
    }
    throw new ExprError(`Onverwacht teken '${t.text}' op positie ${t.pos + 1}.`);
  }

  const fn = parseExpr();
  if (p < toks.length) {
    const t = toks[p];
    const hint = t.kind === 'num' || t.kind === 'ident' || t.text === '('
      ? ' Gebruik * voor vermenigvuldiging (bv. 2*x in plaats van 2x).'
      : '';
    throw new ExprError(`Onverwacht '${t.text}' op positie ${t.pos + 1}.${hint}`);
  }
  return { fn, variables: [...vars].sort() };
}

/** Parseert een uitdrukking naar een veilige evaluatiefunctie. Gooit nooit. */
export function parseExpression(src: string): ParseResult {
  try {
    const { fn, variables } = compile(src);
    return { ok: true, fn, variables };
  } catch (err) {
    return { ok: false, error: err instanceof ExprError ? err.message : 'Ongeldige uitdrukking.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gedeelde hulpjes
// ─────────────────────────────────────────────────────────────────────────────

/** Getal netjes tonen met komma als decimaalteken. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const v = Math.abs(n) < 1e-12 ? 0 : Number(n.toPrecision(10));
  return String(v).replace('.', ',');
}

function safeNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const FN_PALETTE = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0d9488', '#e11d48'];

type PlotFnEntry = ActivePlotConfig['functions'][number];

/** Tekstinvoer voor getallen die tijdens het typen niet "terugvecht". */
function NumInput({
  value, onChange, ariaLabel, width = 92,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  width?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value).replace('.', ','));
  }, [value, focused]);
  return (
    <input
      className="input input-sm"
      style={{ width, textAlign: 'right' }}
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setText(String(value).replace('.', ',')); }}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value.trim().replace(',', '.'));
        if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR
// ─────────────────────────────────────────────────────────────────────────────

export function ActivePlotEditor({ config, onChange }: EditorProps<ActivePlotConfig>) {
  const functions: PlotFnEntry[] = Array.isArray(config.functions) ? config.functions : [];
  const params: PlotParam[] = Array.isArray(config.params) ? config.params : [];
  const paramNames = params.map((q) => q.name);

  const xMin = safeNum(config.xMin, -10);
  const xMax = safeNum(config.xMax, 10);
  const yMin = safeNum(config.yMin, -6);
  const yMax = safeNum(config.yMax, 6);

  const setFn = (i: number, f: PlotFnEntry) => {
    const next = functions.slice();
    next[i] = f;
    onChange({ ...config, functions: next });
  };
  const setParam = (i: number, q: PlotParam) => {
    const next = params.slice();
    next[i] = q;
    onChange({ ...config, params: next });
  };
  const addParam = (name: string) => {
    onChange({ ...config, params: [...params, { name, min: -5, max: 5, step: 0.1, value: 1 }] });
  };

  const suggestParamName = (): string => {
    for (const c of 'abcdknmptuvw') {
      if (!RESERVED.has(c) && !paramNames.includes(c)) return c;
    }
    return '';
  };

  const paramNameError = (name: string, idx: number): string | null => {
    if (!name) return 'Geef een naam: één of meer kleine letters, bv. a.';
    if (!/^[a-z]+$/.test(name)) return 'Alleen kleine letters (a–z) zijn toegelaten.';
    if (RESERVED.has(name)) return `'${name}' is gereserveerd (x, pi, e en functienamen kunnen niet).`;
    if (params.some((q, j) => j !== idx && q.name === name)) return `De naam '${name}' wordt al gebruikt.`;
    return null;
  };

  return (
    <div>
      <div className="callout">
        <span aria-hidden>📈</span>
        <div>
          Schrijf uitdrukkingen in de variabele <code>x</code> en je eigen parameternamen, bv. <code>a*x^2 + b</code>.
          Beschikbaar: <code>sin cos tan sqrt abs log ln exp</code> (haakjes verplicht), constanten <code>pi</code> en{' '}
          <code>e</code>, machten met <code>^</code>. Gebruik <code>*</code> voor vermenigvuldiging.
        </div>
      </div>

      <h3>Functies</h3>
      {functions.length === 0 && (
        <p className="hint" style={{ marginBottom: 10 }}>Nog geen functies — voeg er hieronder één toe.</p>
      )}
      {functions.map((f, i) => {
        const msgId = `ap-fn-msg-${f.id}`;
        let tone: 'muted' | 'ok' | 'warn' | 'err' = 'muted';
        let message: React.ReactNode = 'Typ een uitdrukking in x, bv. sin(a*x).';
        let quickAdd: string[] = [];
        if (f.expression.trim() !== '') {
          const res = parseExpression(f.expression);
          if (!res.ok) {
            tone = 'err';
            message = `✗ ${res.error}`;
          } else {
            const missing = res.variables.filter((v) => !paramNames.includes(v));
            if (missing.length > 0) {
              tone = 'warn';
              quickAdd = missing;
              message = `⚠ Onbekende ${missing.length === 1 ? 'naam' : 'namen'}: ${missing.join(', ')}. Voeg ${missing.length === 1 ? 'die' : 'ze'} als parameter toe:`;
            } else {
              tone = 'ok';
              message = res.variables.length > 0
                ? `✓ Geldige functie met parameter${res.variables.length > 1 ? 's' : ''} ${res.variables.join(', ')}`
                : '✓ Geldige functie';
            }
          }
        }
        const msgColor = tone === 'err' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : 'var(--text-faint)';
        return (
          <div className="editor-item" key={f.id}>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={f.color || FN_PALETTE[i % FN_PALETTE.length]}
                  aria-label={`Kleur van functie ${i + 1}`}
                  title="Kleur van deze functie"
                  onChange={(e) => setFn(i, { ...f, color: e.target.value })}
                />
                <input
                  className="input"
                  style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
                  placeholder="bv. a*x^2 + b"
                  value={f.expression}
                  aria-label={`Uitdrukking van functie ${i + 1}`}
                  aria-invalid={tone === 'err'}
                  aria-describedby={msgId}
                  spellCheck={false}
                  onChange={(e) => setFn(i, { ...f, expression: e.target.value })}
                />
                <button
                  className="btn btn-quiet btn-icon btn-sm"
                  aria-label={`Functie ${i + 1} verwijderen`}
                  title="Verwijderen"
                  style={{ color: 'var(--err)' }}
                  onClick={() => onChange({ ...config, functions: functions.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
              <div
                id={msgId}
                aria-live="polite"
                style={{ fontSize: '0.82rem', marginTop: 6, color: msgColor, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <span>{message}</span>
                {quickAdd.map((name) => (
                  <button key={name} className="btn btn-ghost btn-sm" onClick={() => addParam(name)}>
                    + parameter '{name}'
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <button
        className="btn btn-primary"
        onClick={() => onChange({
          ...config,
          functions: [...functions, { id: uid(), expression: '', color: FN_PALETTE[functions.length % FN_PALETTE.length] }],
        })}
      >
        + Functie toevoegen
      </button>

      <hr className="divider" />

      <h3>Parameters (schuivers voor de leerling)</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        Elke parameter wordt een schuifknop onder de grafiek. De leerling verkent zo live het effect op de grafiek.
      </p>
      {params.map((q, i) => {
        const nameErr = paramNameError(q.name, i);
        const rangeErr = !(q.min < q.max)
          ? 'Min moet kleiner zijn dan max.'
          : !(q.step > 0)
            ? 'Stap moet groter zijn dan 0.'
            : q.value < q.min || q.value > q.max
              ? 'De startwaarde ligt buiten het bereik (wordt bij het spelen begrensd).'
              : null;
        return (
          <div className="editor-item" key={`p-${i}`}>
            <ItemHeader
              index={i}
              label={q.name ? `Parameter ${q.name}` : 'Nieuwe parameter'}
              canUp={i > 0}
              canDown={i < params.length - 1}
              onMoveUp={() => onChange({ ...config, params: moveItem(params, i, i - 1) })}
              onMoveDown={() => onChange({ ...config, params: moveItem(params, i, i + 1) })}
              onDelete={() => onChange({ ...config, params: params.filter((_, j) => j !== i) })}
            />
            <div className="editor-item-body">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Naam">
                  <input
                    className="input input-sm"
                    style={{ width: 90, fontFamily: 'ui-monospace, Consolas, monospace' }}
                    value={q.name}
                    aria-label={`Naam van parameter ${i + 1}`}
                    aria-invalid={nameErr !== null}
                    onChange={(e) => setParam(i, { ...q, name: e.target.value.toLowerCase().replace(/[^a-z]/g, '') })}
                  />
                </Field>
                <Field label="Min">
                  <NumInput value={q.min} ariaLabel={`Minimum van parameter ${q.name || i + 1}`} onChange={(v) => setParam(i, { ...q, min: v })} />
                </Field>
                <Field label="Max">
                  <NumInput value={q.max} ariaLabel={`Maximum van parameter ${q.name || i + 1}`} onChange={(v) => setParam(i, { ...q, max: v })} />
                </Field>
                <Field label="Stap">
                  <NumInput value={q.step} ariaLabel={`Stapgrootte van parameter ${q.name || i + 1}`} onChange={(v) => setParam(i, { ...q, step: v })} />
                </Field>
                <Field label="Startwaarde">
                  <NumInput value={q.value} ariaLabel={`Startwaarde van parameter ${q.name || i + 1}`} onChange={(v) => setParam(i, { ...q, value: v })} />
                </Field>
              </div>
              {(nameErr || rangeErr) && (
                <p aria-live="polite" style={{ fontSize: '0.82rem', color: nameErr ? 'var(--err)' : 'var(--warn)', margin: 0 }}>
                  {nameErr ?? rangeErr}
                </p>
              )}
            </div>
          </div>
        );
      })}
      <button
        className="btn btn-ghost"
        onClick={() => addParam(suggestParamName())}
      >
        + Parameter toevoegen
      </button>

      <hr className="divider" />

      <h3>Assenbereik</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Field label="x min">
          <NumInput value={xMin} ariaLabel="Minimum van de x-as" onChange={(v) => onChange({ ...config, xMin: v })} />
        </Field>
        <Field label="x max">
          <NumInput value={xMax} ariaLabel="Maximum van de x-as" onChange={(v) => onChange({ ...config, xMax: v })} />
        </Field>
        <Field label="y min">
          <NumInput value={yMin} ariaLabel="Minimum van de y-as" onChange={(v) => onChange({ ...config, yMin: v })} />
        </Field>
        <Field label="y max">
          <NumInput value={yMax} ariaLabel="Maximum van de y-as" onChange={(v) => onChange({ ...config, yMax: v })} />
        </Field>
      </div>
      {(!(xMin < xMax) || !(yMin < yMax)) && (
        <div className="callout warn" role="alert">
          <span aria-hidden>⚠️</span>
          <div>Het assenbereik klopt niet: min moet telkens kleiner zijn dan max, anders kan de grafiek niet getekend worden.</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPELER
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLES = 300; // aantal intervallen → 301 meetpunten per functie
const W = 700;
const H = 460;
const PAD_L = 50;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;

/** "Mooie" stapgrootte (1/2/5 × 10^k) voor asstreepjes. */
function niceStep(range: number, target: number): number {
  const raw = range / Math.max(target, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const f = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return f * mag;
}

function makeTicks(min: number, max: number, target: number): number[] {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9);
  const end = Math.floor(max / step + 1e-9);
  for (let i = start; i <= end && out.length < 200; i++) out.push(i * step);
  return out;
}

interface DrawableFn {
  id: string;
  expression: string;
  color: string;
  fn: PlotEvalFn;
}

/**
 * Bemonstert een functie en levert polyline-puntenreeksen in schermcoördinaten.
 * NaN/Infinity worden overgeslagen; bij een sprong dwars door het venster
 * (asymptoot, bv. tan) wordt de lijn gebroken i.p.v. verticaal doorgetrokken.
 */
function buildSegments(
  fn: PlotEvalFn, ps: Params,
  xMin: number, xMax: number, yMin: number, yMax: number,
  sx: (x: number) => number, sy: (y: number) => number,
): string[] {
  const segs: string[] = [];
  let cur: string[] = [];
  let prevY: number | null = null;
  const yRange = yMax - yMin;
  const lo = yMin - yRange;
  const hi = yMax + yRange;
  const flush = () => {
    if (cur.length >= 2) segs.push(cur.join(' '));
    cur = [];
  };
  for (let i = 0; i <= SAMPLES; i++) {
    const x = xMin + ((xMax - xMin) * i) / SAMPLES;
    const y = fn(x, ps);
    if (!Number.isFinite(y)) {
      flush();
      prevY = null;
      continue;
    }
    if (prevY !== null && ((prevY > yMax && y < yMin) || (prevY < yMin && y > yMax))) flush();
    prevY = y;
    const yc = Math.max(lo, Math.min(hi, y)); // extreem grote waarden begrenzen (clipPath knipt de rest)
    cur.push(`${sx(x).toFixed(2)},${sy(yc).toFixed(2)}`);
  }
  flush();
  return segs;
}

export function ActivePlotPlayer({ widget }: PlayerProps<ActivePlotConfig>) {
  // Geen indiening bij deze widget: het is een verkennend wiskunde-instrument,
  // dus onComplete wordt bewust nooit aangeroepen (zoals bij de klashulpjes).
  const cfg = widget.config;
  const functions: PlotFnEntry[] = Array.isArray(cfg.functions) ? cfg.functions : [];
  const params: PlotParam[] = Array.isArray(cfg.params) ? cfg.params : [];

  const idBase = useMemo(() => `ap${Math.random().toString(36).slice(2, 8)}`, []);
  // Alleen door de leerling verschoven waarden; de rest valt terug op de startwaarde.
  const [moved, setMoved] = useState<Params>({});

  const { drawable, broken } = useMemo(() => {
    const ok: DrawableFn[] = [];
    const bad: { expression: string; error: string }[] = [];
    functions.forEach((f, i) => {
      if (!f.expression || f.expression.trim() === '') return;
      const res = parseExpression(f.expression);
      if (res.ok) ok.push({ id: f.id, expression: f.expression, color: f.color || FN_PALETTE[i % FN_PALETTE.length], fn: res.fn });
      else bad.push({ expression: f.expression, error: res.error });
    });
    return { drawable: ok, broken: bad };
  }, [cfg.functions]);

  const xMin = safeNum(cfg.xMin, -10);
  const xMax = safeNum(cfg.xMax, 10);
  const yMin = safeNum(cfg.yMin, -6);
  const yMax = safeNum(cfg.yMax, 6);
  const rangeOk = xMin < xMax && yMin < yMax;

  if (functions.length === 0 || (drawable.length === 0 && broken.length === 0)) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Nog geen functies ingesteld. Vraag je leerkracht om minstens één functie toe te voegen.
      </p>
    );
  }
  if (!rangeOk) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Het assenbereik van deze grafiek klopt niet (min moet kleiner zijn dan max).
      </p>
    );
  }

  // Actuele parameterwaarden: verschoven waarde of startwaarde, begrensd op [min, max].
  const paramValues: Params = {};
  for (const q of params) {
    if (!q.name) continue;
    const base = safeNum(q.value, 0);
    const raw = moved[q.name] !== undefined ? moved[q.name] : base;
    paramValues[q.name] = q.min < q.max ? clamp(raw, q.min, q.max) : raw;
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const sx = (x: number) => PAD_L + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => PAD_T + ((yMax - y) / (yMax - yMin)) * plotH;

  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);
  const clipId = `${idBase}-clip`;

  const sliders = params.filter((q) => q.name && q.min < q.max);
  const fixed = params.filter((q) => q.name && !(q.min < q.max));

  return (
    <div>
      {broken.length > 0 && (
        <div className="callout warn" role="note">
          <span aria-hidden>⚠️</span>
          <div>
            {broken.length === 1 ? 'Eén functie kan niet getekend worden' : `${broken.length} functies kunnen niet getekend worden`}:{' '}
            {broken.map((b, i) => (
              <span key={i}>
                {i > 0 && '; '}
                <code>{b.expression}</code> — {b.error}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        {/* Legenda */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }} aria-label="Legenda">
          {drawable.map((f, i) => (
            <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <svg width="22" height="10" aria-hidden style={{ flex: 'none' }}>
                <line x1="1" y1="5" x2="21" y2="5" stroke={f.color} strokeWidth="3.5" strokeLinecap="round" />
              </svg>
              <code style={{ color: f.color, fontWeight: 700, fontSize: '0.92rem' }}>
                f{i + 1}(x) = {f.expression}
              </code>
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={`Interactieve grafiek van ${drawable.map((f) => f.expression).join(' en ')}, x van ${fmtNum(xMin)} tot ${fmtNum(xMax)}, y van ${fmtNum(yMin)} tot ${fmtNum(yMax)}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* Achtergrond */}
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="var(--bg-raised)" />

          {/* Lichte gridlijnen */}
          {xTicks.map((t) => (
            <line key={`gx${t}`} x1={sx(t)} y1={PAD_T} x2={sx(t)} y2={PAD_T + plotH} stroke="var(--line)" strokeWidth="1" />
          ))}
          {yTicks.map((t) => (
            <line key={`gy${t}`} x1={PAD_L} y1={sy(t)} x2={PAD_L + plotW} y2={sy(t)} stroke="var(--line)" strokeWidth="1" />
          ))}

          {/* Nul-assen (donkerder) */}
          {xMin < 0 && xMax > 0 && (
            <line x1={sx(0)} y1={PAD_T} x2={sx(0)} y2={PAD_T + plotH} stroke="var(--text-faint)" strokeWidth="1.5" />
          )}
          {yMin < 0 && yMax > 0 && (
            <line x1={PAD_L} y1={sy(0)} x2={PAD_L + plotW} y2={sy(0)} stroke="var(--text-faint)" strokeWidth="1.5" />
          )}

          {/* Functiekrommen (300 samples, gladde polylines, geknipt op het venster) */}
          <g clipPath={`url(#${clipId})`}>
            {drawable.map((f) =>
              buildSegments(f.fn, paramValues, xMin, xMax, yMin, yMax, sx, sy).map((pts, si) => (
                <polyline
                  key={`${f.id}-${si}`}
                  points={pts}
                  fill="none"
                  stroke={f.color}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))
            )}
          </g>

          {/* Kader */}
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />

          {/* Streepjes + labels x-as */}
          {xTicks.map((t) => (
            <g key={`tx${t}`}>
              <line x1={sx(t)} y1={PAD_T + plotH} x2={sx(t)} y2={PAD_T + plotH + 5} stroke="var(--line-strong)" strokeWidth="1.5" />
              <text x={sx(t)} y={PAD_T + plotH + 19} textAnchor="middle" fontSize="11" fill="var(--text-soft)">
                {fmtNum(t)}
              </text>
            </g>
          ))}
          {/* Streepjes + labels y-as */}
          {yTicks.map((t) => (
            <g key={`ty${t}`}>
              <line x1={PAD_L - 5} y1={sy(t)} x2={PAD_L} y2={sy(t)} stroke="var(--line-strong)" strokeWidth="1.5" />
              <text x={PAD_L - 9} y={sy(t) + 3.5} textAnchor="end" fontSize="11" fill="var(--text-soft)">
                {fmtNum(t)}
              </text>
            </g>
          ))}

          {/* Asnamen */}
          <text x={PAD_L + plotW - 6} y={PAD_T + plotH - 8} textAnchor="end" fontSize="13" fontStyle="italic" fill="var(--text-soft)">x</text>
          <text x={PAD_L + 8} y={PAD_T + 16} fontSize="13" fontStyle="italic" fill="var(--text-soft)">y</text>
        </svg>
      </div>

      {(sliders.length > 0 || fixed.length > 0) && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Verken met de schuivers</h3>
            {Object.keys(moved).length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setMoved({})}
                aria-label="Alle parameters terug naar hun beginwaarden"
              >
                ↺ Beginwaarden
              </button>
            )}
          </div>
          {sliders.map((q, qi) => {
            const sliderId = `${idBase}-${qi}-${q.name}`;
            const val = paramValues[q.name] ?? 0;
            const step = q.step > 0 ? q.step : (q.max - q.min) / 100;
            return (
              <div key={`${qi}-${q.name}`} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <label
                  htmlFor={sliderId}
                  style={{ width: 44, textAlign: 'right', fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace', flex: 'none' }}
                >
                  {q.name}
                </label>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)', flex: 'none', minWidth: 34, textAlign: 'right' }} aria-hidden>
                  {fmtNum(q.min)}
                </span>
                <input
                  id={sliderId}
                  type="range"
                  min={q.min}
                  max={q.max}
                  step={step}
                  value={val}
                  aria-label={`Parameter ${q.name}, van ${fmtNum(q.min)} tot ${fmtNum(q.max)}`}
                  style={{ flex: 1, accentColor: 'var(--player-accent, var(--brand))', minWidth: 120 }}
                  onChange={(e) => setMoved({ ...moved, [q.name]: Number(e.target.value) })}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)', flex: 'none', minWidth: 34 }} aria-hidden>
                  {fmtNum(q.max)}
                </span>
                <output
                  htmlFor={sliderId}
                  style={{
                    fontVariantNumeric: 'tabular-nums', fontWeight: 800, minWidth: 64, textAlign: 'center',
                    color: 'var(--player-accent, var(--brand))',
                    background: 'color-mix(in srgb, var(--player-accent, var(--brand)) 10%, transparent)',
                    borderRadius: 8, padding: '3px 8px', flex: 'none',
                  }}
                >
                  {fmtNum(val)}
                </output>
              </div>
            );
          })}
          {fixed.length > 0 && (
            <p style={{ margin: '4px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {fixed.map((q, qi) => (
                <span className="badge" key={`${qi}-${q.name}`}>{q.name} = {fmtNum(paramValues[q.name] ?? 0)}</span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
