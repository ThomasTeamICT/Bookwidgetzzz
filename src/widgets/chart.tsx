import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartConfig } from '../lib/types';
import { CheckRow, Field } from '../components/ui';
import { EditorProps, PlayerProps, moveItem } from './shared';

// ── Kleuren ─────────────────────────────────────────────────────────────────
// Slot 1 volgt het widget-accent; de overige tinten zijn vast en onderling
// onderscheidbaar (gevalideerd op kleurenblind-veiligheid). Kleuren horen bij
// een rij (entiteit) en wisselen nooit van plaats.

const ACCENT = 'var(--player-accent, var(--brand))';
const PALETTE = [ACCENT, '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#9333ea'];
const PALETTE_FALLBACK_HEX = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#9333ea'];

const MAX_ROWS = 12;

interface Row { label: string; value: number }

const TYPE_NAMES: Record<ChartConfig['chartType'], string> = {
  bar: 'Staafdiagram',
  line: 'Lijndiagram',
  pie: 'Taartdiagram',
  donut: 'Donutdiagram',
};

// ── Hulpjes ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('nl-BE', { maximumFractionDigits: 2 });
}

function fmtPct(frac: number): string {
  const p = frac * 100;
  return p.toLocaleString('nl-BE', { maximumFractionDigits: p >= 10 ? 0 : 1 });
}

function shorten(s: string, max: number): string {
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
}

function parseColor(c: string): [number, number, number] | null {
  const s = c.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return null;
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function relLuminance(rgb: [number, number, number]): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** Kies witte of donkere inkt in een gekleurd segment: hoogste contrast wint. */
function inkFor(color: string): string {
  const rgb = parseColor(color);
  if (!rgb) return '#ffffff';
  const l = relLuminance(rgb);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastDark = (l + 0.05) / 0.0623; // t.o.v. #1e293b
  return contrastWhite >= contrastDark ? '#ffffff' : '#1e293b';
}

/** Het accent (CSS-variabele) als concrete kleur uitlezen, voor inktkeuze in taartsegmenten. */
function useResolvedAccent() {
  const probeRef = useRef<HTMLSpanElement>(null);
  const [resolved, setResolved] = useState(PALETTE_FALLBACK_HEX[0]);
  useEffect(() => {
    if (probeRef.current) {
      const c = getComputedStyle(probeRef.current).color;
      if (c) setResolved(c);
    }
  }, []);
  return { probeRef, resolved };
}

// Nette astakken (1/2/5 × 10^k)
function niceStep(rough: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / pow;
  const f = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
  return f * pow;
}

function buildTicks(minV: number, maxV: number): { ticks: number[]; lo: number; hi: number } {
  let min = minV;
  let max = maxV;
  if (min === max) {
    if (max > 0) min = 0;
    else if (max < 0) max = 0;
    else max = 1;
  }
  const step = niceStep((max - min) / 4);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const count = Math.max(1, Math.round((hi - lo) / step));
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(Number((lo + i * step).toPrecision(12)));
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] };
}

function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  if (rInner <= 0) {
    return `M ${cx} ${cy} L ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} Z`;
  }
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`;
}

function fullCirclePath(cx: number, cy: number, rOuter: number, rInner: number): string {
  const ring = (r: number) =>
    `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  return rInner > 0 ? `${ring(rOuter)} ${ring(rInner)} Z` : `${ring(rOuter)} Z`;
}

/** Staaf met afgeronde datakant (4px) en rechte basislijn. */
function barPath(x: number, w: number, yBase: number, yVal: number): string {
  const top = Math.min(yVal, yBase);
  const bottom = Math.max(yVal, yBase);
  const h = bottom - top;
  if (h < 1) {
    // (bijna) nul: klein streepje op de basislijn zodat de categorie zichtbaar blijft
    return `M ${x} ${yBase - 1.5} h ${w} v 1.5 h ${-w} Z`;
  }
  const r = Math.min(4, w / 2, h);
  if (yVal <= yBase) {
    return `M ${x} ${bottom} L ${x} ${top + r} Q ${x} ${top} ${x + r} ${top} L ${x + w - r} ${top} Q ${x + w} ${top} ${x + w} ${top + r} L ${x + w} ${bottom} Z`;
  }
  return `M ${x} ${top} L ${x} ${bottom - r} Q ${x} ${bottom} ${x + r} ${bottom} L ${x + w - r} ${bottom} Q ${x + w} ${bottom} ${x + w} ${bottom - r} L ${x + w} ${top} Z`;
}

// ── Getalinvoer met nette typ-ervaring (komma of punt toegelaten) ───────────

/** Getal als bewerkbare tekst, met komma als decimaalteken. */
function editText(n: number): string {
  return String(n).replace('.', ',');
}

function NumberInput({
  value, onValue, ariaLabel, width,
}: { value: number; onValue: (n: number) => void; ariaLabel: string; width?: number }) {
  const [text, setText] = useState(editText(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(editText(value));
  }, [value]);
  return (
    <input
      className="input input-sm"
      style={{ maxWidth: width ?? 110, textAlign: 'right' }}
      inputMode="decimal"
      value={text}
      placeholder="0"
      aria-label={ariaLabel}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(editText(value)); }}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        if (t === '') { onValue(0); return; }
        const n = parseFloat(t.replace(',', '.'));
        if (Number.isFinite(n)) onValue(n);
      }}
    />
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

const CHART_TYPE_OPTIONS: { id: ChartConfig['chartType']; label: string; icon: string }[] = [
  { id: 'bar', label: 'Staaf', icon: '📊' },
  { id: 'line', label: 'Lijn', icon: '📈' },
  { id: 'pie', label: 'Taart', icon: '🥧' },
  { id: 'donut', label: 'Donut', icon: '🍩' },
];

export function ChartEditor({ config, onChange }: EditorProps<ChartConfig>) {
  const labels = Array.isArray(config.labels) ? config.labels : [];
  const values = Array.isArray(config.values) ? config.values : [];
  const n = Math.max(labels.length, values.length);

  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const raw = values[i];
    rows.push({ label: labels[i] ?? '', value: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0 });
  }

  const commit = (next: Row[]) =>
    onChange({ ...config, labels: next.map((r) => r.label), values: next.map((r) => r.value) });

  const isPie = config.chartType === 'pie' || config.chartType === 'donut';
  const hasNegative = rows.some((r) => r.value < 0);

  return (
    <div>
      <Field label="Soort grafiek">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Soort grafiek">
          {CHART_TYPE_OPTIONS.map((t) => (
            <button
              key={t.id}
              className={`btn btn-sm ${config.chartType === t.id ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={config.chartType === t.id}
              onClick={() => onChange({ ...config, chartType: t.id })}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {isPie && (
          <span className="hint">Tip: een taart- of donutdiagram werkt het best met 2 tot 6 positieve waarden.</span>
        )}
        {isPie && hasNegative && (
          <span className="hint" style={{ color: 'var(--warn)' }}>
            ⚠ Negatieve waarden worden in een taart- of donutdiagram als 0 getoond.
          </span>
        )}
      </Field>

      <Field label="Titel van de grafiek">
        <input
          className="input"
          value={config.title ?? ''}
          placeholder="bv. Neerslag per maand in Ukkel"
          onChange={(e) => onChange({ ...config, title: e.target.value })}
        />
      </Field>

      <Field label="Gegevens" hint="Elke rij is één categorie met een label en een waarde.">
        <div>
          {rows.map((r, i) => (
            <div className="option-row" key={i}>
              <span className="badge badge-brand" aria-hidden>{i + 1}</span>
              <input
                className="input input-sm"
                value={r.label}
                placeholder={`Categorie ${i + 1}`}
                aria-label={`Label van rij ${i + 1}`}
                onChange={(e) => {
                  const next = rows.slice();
                  next[i] = { ...r, label: e.target.value };
                  commit(next);
                }}
              />
              <NumberInput
                value={r.value}
                ariaLabel={`Waarde van rij ${i + 1}`}
                onValue={(v) => {
                  const next = rows.slice();
                  next[i] = { ...r, value: v };
                  commit(next);
                }}
              />
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Rij ${i + 1} omhoog`}
                title="Omhoog"
                disabled={i === 0}
                onClick={() => commit(moveItem(rows, i, i - 1))}
              >↑</button>
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Rij ${i + 1} omlaag`}
                title="Omlaag"
                disabled={i === rows.length - 1}
                onClick={() => commit(moveItem(rows, i, i + 1))}
              >↓</button>
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Rij ${i + 1} verwijderen`}
                title="Verwijderen"
                style={{ color: 'var(--err)' }}
                onClick={() => commit(rows.filter((_, j) => j !== i))}
              >✕</button>
            </div>
          ))}
          <button
            className="btn btn-primary"
            disabled={rows.length >= MAX_ROWS}
            onClick={() => commit([...rows, { label: '', value: 0 }])}
          >
            + Rij toevoegen
          </button>
          {rows.length >= MAX_ROWS && (
            <span className="hint" style={{ display: 'block', marginTop: 6 }}>
              Maximaal {MAX_ROWS} rijen — meer categorieën maken een grafiek onleesbaar.
            </span>
          )}
        </div>
      </Field>

      <CheckRow
        checked={config.studentEditable}
        onChange={(v) => onChange({ ...config, studentEditable: v })}
        label="Leerlingen mogen de gegevens aanpassen (grafiek verandert live)"
      />
      {config.studentEditable && (
        <p className="hint" style={{ margin: '2px 0 0' }}>
          Didactisch handig om te oefenen op het lezen én maken van grafieken. Er wordt niets ingediend.
        </p>
      )}
    </div>
  );
}

// ── SVG-grafiek ─────────────────────────────────────────────────────────────

const W = 720;
const H = 420;

function AxisChart({ type, rows }: { type: 'bar' | 'line'; rows: Row[] }) {
  const plotX = 52, plotY = 30, plotW = W - plotX - 16, plotBottom = H - 48;
  const plotH = plotBottom - plotY;

  const vals = rows.map((r) => r.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (type === 'bar') {
    // Staafdiagram: de y-as begint altijd bij 0 (eerlijke lengtevergelijking).
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const { ticks, lo, hi } = buildTicks(min, max);
  const y = (v: number) => plotBottom - ((v - lo) / (hi - lo)) * plotH;

  const nRows = rows.length;
  const band = plotW / nRows;
  const maxChars = Math.max(4, Math.floor(band / 7.5));
  const showPointLabels = nRows <= 16;

  return (
    <>
      {/* dunne, neutrale gridlijnen */}
      {ticks.map((t) => (
        <g key={`tick-${t}`} aria-hidden>
          <line x1={plotX} x2={plotX + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={plotX - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--text-faint)">
            {fmt(t)}
          </text>
        </g>
      ))}
      {/* basislijn (nulniveau) iets sterker */}
      {lo <= 0 && hi >= 0 && (
        <line x1={plotX} x2={plotX + plotW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1.5} aria-hidden />
      )}

      {type === 'bar' && rows.map((r, i) => {
        const barW = Math.min(band * 0.62, 56);
        const x = plotX + band * i + (band - barW) / 2;
        const yVal = y(r.value);
        const yBase = y(Math.max(lo, Math.min(hi, 0)));
        const labelY = r.value >= 0 ? Math.min(yVal, yBase) - 8 : Math.max(yVal, yBase) + 17;
        return (
          <g key={i} role="img" aria-label={`${r.label}: ${fmt(r.value)}`}>
            <path d={barPath(x, barW, yBase, yVal)} fill={ACCENT} />
            <text
              x={x + barW / 2} y={labelY} textAnchor="middle"
              fontSize={13} fontWeight={700} fill="var(--text-soft)" aria-hidden
            >
              {fmt(r.value)}
            </text>
            <text
              x={plotX + band * i + band / 2} y={plotBottom + 20} textAnchor="middle"
              fontSize={12.5} fill="var(--text-soft)" aria-hidden
            >
              {shorten(r.label, maxChars)}
            </text>
          </g>
        );
      })}

      {type === 'line' && (
        <>
          <polyline
            points={rows.map((r, i) => `${plotX + band * (i + 0.5)},${y(r.value)}`).join(' ')}
            fill="none" stroke={ACCENT} strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round" aria-hidden
          />
          {rows.map((r, i) => {
            const px = plotX + band * (i + 0.5);
            const py = y(r.value);
            const labelAbove = py - 12 > plotY + 8;
            return (
              <g key={i} role="img" aria-label={`${r.label}: ${fmt(r.value)}`}>
                {/* puntmarker met ring in achtergrondkleur, zodat hij op de lijn leesbaar blijft */}
                <circle cx={px} cy={py} r={4.5} fill={ACCENT} stroke="var(--bg-raised)" strokeWidth={2} />
                {showPointLabels && (
                  <text
                    x={px} y={labelAbove ? py - 11 : py + 21} textAnchor="middle"
                    fontSize={12.5} fontWeight={700} fill="var(--text-soft)" aria-hidden
                  >
                    {fmt(r.value)}
                  </text>
                )}
                <text
                  x={px} y={plotBottom + 20} textAnchor="middle"
                  fontSize={12.5} fill="var(--text-soft)" aria-hidden
                >
                  {shorten(r.label, maxChars)}
                </text>
              </g>
            );
          })}
        </>
      )}
    </>
  );
}

function PieChart({ rows, donut, accentResolved }: { rows: Row[]; donut: boolean; accentResolved: string }) {
  const cx = W / 2, cy = 202, R = 152;
  const rInner = donut ? 86 : 0;

  const positive = rows
    .map((r, i) => ({ ...r, colorIndex: i % PALETTE.length, value: Math.max(0, r.value) }))
    .filter((r) => r.value > 0);
  const total = positive.reduce((s, r) => s + r.value, 0);

  let angle = -Math.PI / 2;
  const slices = positive.map((r) => {
    const frac = r.value / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });

  return (
    <>
      {slices.map((s, i) => {
        const fill = PALETTE[s.colorIndex];
        const fillResolved = s.colorIndex === 0 ? accentResolved : PALETTE_FALLBACK_HEX[s.colorIndex];
        const mid = (s.a0 + s.a1) / 2;
        const inside = s.frac >= 0.07;
        const labelR = donut ? (R + rInner) / 2 : R * 0.66;
        const [lx, ly] = polar(cx, cy, labelR, mid);
        const [ox, oy] = polar(cx, cy, R + 20, mid);
        const [l0x, l0y] = polar(cx, cy, R + 3, mid);
        const [l1x, l1y] = polar(cx, cy, R + 14, mid);
        const anchorRight = Math.cos(mid) >= 0;
        const pctLabel = `${fmtPct(s.frac)}%`;
        return (
          <g key={i} role="img" aria-label={`${s.label}: ${fmt(s.value)} (${fmtPct(s.frac)} procent)`}>
            <path
              d={s.frac > 0.9995 ? fullCirclePath(cx, cy, R, rInner) : arcPath(cx, cy, R, rInner, s.a0, s.a1)}
              fill={fill}
              fillRule="evenodd"
              stroke="var(--bg-raised)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {inside ? (
              <text
                x={lx} y={ly + 5} textAnchor="middle"
                fontSize={15} fontWeight={700} fill={inkFor(fillResolved)} aria-hidden
              >
                {pctLabel}
              </text>
            ) : (
              <>
                <line x1={l0x} y1={l0y} x2={l1x} y2={l1y} stroke="var(--line-strong)" strokeWidth={1} aria-hidden />
                <text
                  x={ox} y={oy + 4} textAnchor={anchorRight ? 'start' : 'end'}
                  fontSize={13} fontWeight={650} fill="var(--text-soft)" aria-hidden
                >
                  {pctLabel}
                </text>
              </>
            )}
          </g>
        );
      })}
      {donut && (
        <g aria-hidden>
          <text x={cx} y={cy + 2} textAnchor="middle" fontSize={30} fontWeight={800} fill="var(--text)">
            {fmt(total)}
          </text>
          <text x={cx} y={cy + 26} textAnchor="middle" fontSize={13} fill="var(--text-soft)">
            Totaal
          </text>
        </g>
      )}
    </>
  );
}

function ChartSvg({ type, rows, title, accentResolved }: {
  type: ChartConfig['chartType'];
  rows: Row[];
  title: string;
  accentResolved: string;
}) {
  const isPie = type === 'pie' || type === 'donut';
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', fontFamily: 'inherit' }}
      role="group"
      aria-label={`${TYPE_NAMES[type]}${title ? ` — ${title}` : ''}, ${rows.length} ${rows.length === 1 ? 'categorie' : 'categorieën'}`}
      focusable="false"
    >
      {isPie
        ? <PieChart rows={rows} donut={type === 'donut'} accentResolved={accentResolved} />
        : <AxisChart type={type} rows={rows} />}
    </svg>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

const EMPTY_LABELS: string[] = [];
const EMPTY_VALUES: number[] = [];

export function ChartPlayer({ widget }: PlayerProps<ChartConfig>) {
  const cfg = widget.config;
  // stabiele fallback-identiteit, anders zou de useMemo hieronder elke render opnieuw rekenen
  const cfgLabels = Array.isArray(cfg.labels) ? cfg.labels : EMPTY_LABELS;
  const cfgValues = Array.isArray(cfg.values) ? cfg.values : EMPTY_VALUES;

  const initialRows = useMemo<Row[]>(() => {
    const n = Math.max(cfgLabels.length, cfgValues.length);
    const out: Row[] = [];
    for (let i = 0; i < n; i++) {
      const rawLabel = (cfgLabels[i] ?? '').trim();
      const rawValue = cfgValues[i];
      const hasValue = typeof rawValue === 'number' && Number.isFinite(rawValue);
      if (!rawLabel && !hasValue) continue; // volledig lege rij overslaan
      out.push({ label: rawLabel || `Categorie ${i + 1}`, value: hasValue ? rawValue : 0 });
    }
    return out;
  }, [cfgLabels, cfgValues]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  const { probeRef, resolved } = useResolvedAccent();

  if (initialRows.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Deze grafiek heeft nog geen gegevens. De leerkracht voegt rijen toe in de editor.
      </p>
    );
  }

  const type = cfg.chartType;
  const isPie = type === 'pie' || type === 'donut';
  const total = rows.reduce((s, r) => s + (isPie ? Math.max(0, r.value) : r.value), 0);
  const pieEmpty = isPie && total <= 0;

  const updateRow = (i: number, r: Row) => {
    const next = rows.slice();
    next[i] = r;
    setRows(next);
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* onzichtbare peiler die de accentkleur concreet maakt (voor inktkeuze in segmenten) */}
      <span ref={probeRef} hidden aria-hidden style={{ color: ACCENT }} />

      {cfg.title && <h3 style={{ textAlign: 'center', marginBottom: 12 }}>{cfg.title}</h3>}

      <div className="card" style={{ padding: '18px 16px 12px' }}>
        {pieEmpty ? (
          <p style={{ textAlign: 'center', color: 'var(--text-soft)', padding: '30px 12px' }}>
            Een {type === 'donut' ? 'donutdiagram' : 'taartdiagram'} heeft minstens één waarde boven 0 nodig.
          </p>
        ) : (
          <ChartSvg type={type} rows={rows} title={cfg.title ?? ''} accentResolved={resolved} />
        )}

        {/* legenda bij taart/donut: kleur is nooit de enige betekenisdrager */}
        {isPie && !pieEmpty && (
          <ul
            aria-label="Legenda"
            style={{
              listStyle: 'none', padding: '4px 4px 6px', margin: '8px 0 0',
              display: 'flex', flexWrap: 'wrap', gap: '8px 20px', justifyContent: 'center',
            }}
          >
            {rows.map((r, i) => {
              const v = Math.max(0, r.value);
              return (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.9rem' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 12, height: 12, borderRadius: 3, flex: 'none',
                      background: PALETTE[i % PALETTE.length],
                    }}
                  />
                  <span>{r.label}</span>
                  <strong>{fmt(v)}</strong>
                  <span style={{ color: 'var(--text-faint)' }}>({fmtPct(total > 0 ? v / total : 0)}%)</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* tekstalternatief voor schermlezers */}
      <table className="sr-only">
        <caption>{cfg.title || 'Gegevens van de grafiek'}</caption>
        <thead>
          <tr>
            <th scope="col">Categorie</th>
            <th scope="col">Waarde</th>
            {isPie && <th scope="col">Aandeel</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{r.label}</th>
              <td>{fmt(r.value)}</td>
              {isPie && <td>{fmtPct(total > 0 ? Math.max(0, r.value) / total : 0)}%</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {cfg.studentEditable && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 2 }}>Pas de gegevens zelf aan</h3>
          <p className="hint" style={{ marginBottom: 12 }}>
            Wijzig de labels of waarden en kijk meteen wat er met de grafiek gebeurt. Er wordt niets ingediend.
          </p>
          {rows.map((r, i) => (
            <div className="option-row" key={i}>
              <span className="badge badge-brand" aria-hidden>{i + 1}</span>
              <input
                className="input input-sm"
                value={r.label}
                aria-label={`Label van rij ${i + 1}`}
                onChange={(e) => updateRow(i, { ...r, label: e.target.value })}
              />
              <NumberInput
                value={r.value}
                ariaLabel={`Waarde van rij ${i + 1}`}
                onValue={(v) => updateRow(i, { ...r, value: v })}
              />
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Rij ${i + 1} verwijderen`}
                title="Verwijderen"
                disabled={rows.length <= 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button
              className="btn btn-sm btn-ghost"
              disabled={rows.length >= MAX_ROWS}
              onClick={() => setRows([...rows, { label: `Categorie ${rows.length + 1}`, value: 0 }])}
            >
              + Rij toevoegen
            </button>
            <button className="btn btn-sm btn-quiet" onClick={() => setRows(initialRows)}>
              ↺ Originele gegevens terugzetten
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            Grafiek bijgewerkt. {rows.length} {rows.length === 1 ? 'rij' : 'rijen'}, totaal {fmt(rows.reduce((s, r) => s + r.value, 0))}.
          </p>
        </div>
      )}
    </div>
  );
}
