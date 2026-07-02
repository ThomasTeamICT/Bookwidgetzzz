import React, { useMemo, useRef, useState } from 'react';
import type { SpinnerConfig } from '../lib/types';
import { CheckRow, Field } from '../components/ui';
import { EditorProps, PlayerProps } from './shared';

export function SpinnerEditor({ config, onChange }: EditorProps<SpinnerConfig>) {
  return (
    <div>
      <Field label="Items op het rad" hint="Eén item per regel: namen van leerlingen, opdrachten, vragen…">
        <textarea
          className="textarea" rows={10}
          value={config.items.join('\n')}
          onChange={(e) => onChange({ ...config, items: e.target.value.split('\n') })}
        />
      </Field>
      <CheckRow
        checked={config.removeAfterSpin}
        onChange={(v) => onChange({ ...config, removeAfterSpin: v })}
        label="Item verwijderen nadat het gekozen is"
      />
    </div>
  );
}

const WHEEL_COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0d9488', '#e11d48'];

export function SpinnerPlayer({ widget }: PlayerProps<SpinnerConfig>) {
  const initial = useMemo(() => widget.config.items.filter((i) => i.trim()), [widget.id]);
  const [items, setItems] = useState(initial);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const angleRef = useRef(0);

  if (initial.length < 2) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Voeg minstens 2 items toe aan het rad.</p>;

  const n = items.length;
  const seg = 360 / Math.max(n, 1);

  const spin = () => {
    if (spinning || n === 0) return;
    setWinner(null);
    setSpinning(true);
    const targetIdx = Math.floor(Math.random() * n);
    // wijzer staat bovenaan (270° in svg-termen); draai zodat het midden van het segment daar uitkomt
    const current = angleRef.current % 360;
    const targetAngle = 270 - (targetIdx * seg + seg / 2);
    const delta = ((targetAngle - current) % 360 + 360) % 360 + 360 * (4 + Math.floor(Math.random() * 3));
    const next = angleRef.current + delta;
    angleRef.current = next;
    setAngle(next);
    setTimeout(() => {
      setSpinning(false);
      const win = items[targetIdx];
      setWinner(win);
      setHistory((h) => [win, ...h]);
      if (widget.config.removeAfterSpin) {
        setItems((its) => its.filter((_, i) => i !== targetIdx));
      }
    }, 4200);
  };

  const R = 150;
  const cx = 160, cy = 160;

  return (
    <div className="spin-wheel-wrap">
      <div style={{ position: 'relative' }} aria-hidden={spinning}>
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
          width: 0, height: 0, borderLeft: '14px solid transparent', borderRight: '14px solid transparent',
          borderTop: '26px solid var(--text)',
        }} aria-hidden />
        <svg
          width="320" height="320" viewBox="0 0 320 320"
          style={{ transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4.2s cubic-bezier(0.12, 0.6, 0.04, 1)' : 'none', maxWidth: '86vw', height: 'auto' }}
          role="img" aria-label={`Rad met ${n} items`}
        >
          {items.map((item, i) => {
            const a0 = (i * seg * Math.PI) / 180;
            const a1 = ((i + 1) * seg * Math.PI) / 180;
            const large = seg > 180 ? 1 : 0;
            const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
            const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
            const mid = (a0 + a1) / 2;
            const tx = cx + R * 0.62 * Math.cos(mid), ty = cy + R * 0.62 * Math.sin(mid);
            return (
              <g key={i}>
                <path
                  d={n === 1 ? `M ${cx} ${cy} m -${R},0 a ${R},${R} 0 1,0 ${R * 2},0 a ${R},${R} 0 1,0 -${R * 2},0` : `M ${cx} ${cy} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`}
                  fill={WHEEL_COLORS[i % WHEEL_COLORS.length]}
                  stroke="#fff" strokeWidth="2"
                />
                <text
                  x={tx} y={ty} fill="#fff" fontSize={item.length > 12 ? 10 : 13} fontWeight="700"
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${(mid * 180) / Math.PI}, ${tx}, ${ty})`}
                >
                  {item.length > 18 ? item.slice(0, 17) + '…' : item}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="26" fill="var(--bg-raised)" stroke="var(--line-strong)" strokeWidth="3" />
        </svg>
      </div>

      <div aria-live="assertive" style={{ minHeight: 54, textAlign: 'center' }}>
        {winner && !spinning && (
          <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
            🎯 <span style={{ color: 'var(--player-accent, var(--brand))' }}>{winner}</span>
          </p>
        )}
      </div>

      <button className="btn btn-primary btn-lg" onClick={spin} disabled={spinning || n === 0}>
        {spinning ? 'Het rad draait…' : n === 0 ? 'Alles is geweest!' : '🎡 Draai aan het rad'}
      </button>
      {n === 0 && (
        <button className="btn btn-ghost" onClick={() => { setItems(initial); setHistory([]); setWinner(null); }}>
          🔁 Alles terugzetten
        </button>
      )}

      {history.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: 6 }}>Al gekozen</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {history.map((h, i) => <span className="badge" key={i}>{h}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
