import React, { useMemo, useRef, useState } from 'react';
import type { ArithmeticConfig, ArithmeticOp, ItemScore } from '../lib/types';
import { Field } from '../components/ui';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

const OP_META: Record<ArithmeticOp, { label: string; symbol: string }> = {
  add: { label: 'Optellen', symbol: '+' },
  sub: { label: 'Aftrekken', symbol: '−' },
  mul: { label: 'Vermenigvuldigen', symbol: '×' },
  div: { label: 'Delen', symbol: ':' },
};

export function ArithmeticEditor({ config, onChange }: EditorProps<ArithmeticConfig>) {
  const toggleOp = (op: ArithmeticOp) => {
    const has = config.ops.includes(op);
    const next = has ? config.ops.filter((o) => o !== op) : [...config.ops, op];
    if (next.length === 0) return;
    onChange({ ...config, ops: next });
  };
  const toggleTable = (t: number) => {
    const has = config.tables.includes(t);
    onChange({ ...config, tables: has ? config.tables.filter((x) => x !== t) : [...config.tables, t].sort((a, b) => a - b) });
  };
  return (
    <div>
      <Field label="Bewerkingen">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(OP_META) as ArithmeticOp[]).map((op) => (
            <button key={op} className={`btn btn-sm ${config.ops.includes(op) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleOp(op)} aria-pressed={config.ops.includes(op)}>
              {OP_META[op].symbol} {OP_META[op].label}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Kleinste getal">
          <input className="input input-sm" type="number" value={config.min}
            onChange={(e) => onChange({ ...config, min: parseInt(e.target.value) || 0 })} />
        </Field>
        <Field label="Grootste getal">
          <input className="input input-sm" type="number" value={config.max}
            onChange={(e) => onChange({ ...config, max: parseInt(e.target.value) || 10 })} />
        </Field>
        <Field label="Aantal oefeningen">
          <input className="input input-sm" type="number" min={1} max={50} value={config.count}
            onChange={(e) => onChange({ ...config, count: Math.max(1, Math.min(50, parseInt(e.target.value) || 10)) })} />
        </Field>
      </div>
      {config.ops.includes('mul') && (
        <Field label="Maaltafels (optioneel)" hint="Selecteer tafels om vermenigvuldigingen te beperken tot die tafels.">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => (
              <button key={t} className={`btn btn-sm ${config.tables.includes(t) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleTable(t)} aria-pressed={config.tables.includes(t)}>
                {t}
              </button>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

interface Sum { a: number; b: number; op: ArithmeticOp; answer: number }

function makeSums(config: ArithmeticConfig): Sum[] {
  const rint = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  const sums: Sum[] = [];
  const min = Math.min(config.min, config.max);
  const max = Math.max(config.min, config.max);
  for (let i = 0; i < config.count; i++) {
    const op = config.ops[rint(0, config.ops.length - 1)];
    let a = rint(min, max);
    let b = rint(min, max);
    if (op === 'sub' && b > a) [a, b] = [b, a];
    if (op === 'mul' && config.tables.length > 0) {
      b = config.tables[rint(0, config.tables.length - 1)];
      a = rint(1, 10);
    }
    if (op === 'div') {
      // deelbare sommen maken: quotiënt × deler
      b = Math.max(1, rint(Math.max(1, min), Math.min(10, Math.max(2, max))));
      const q = rint(1, Math.max(2, Math.min(10, max)));
      a = b * q;
    }
    const answer = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a / b;
    sums.push({ a, b, op, answer });
  }
  return sums;
}

export function ArithmeticPlayer({ widget, timeUp, onComplete }: PlayerProps<ArithmeticConfig>) {
  const sums = useMemo(() => makeSums(widget.config), [widget.id]);
  const [idx, setIdx] = useState(0);
  const [given, setGiven] = useState<(number | null)[]>([]);
  const [current, setCurrent] = useState('');
  const [feedback, setFeedback] = useState<'ok' | 'nok' | null>(null);
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = (answers: (number | null)[]) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const itemScores: Record<string, ItemScore> = {};
    let earned = 0;
    sums.forEach((s, i) => {
      const ok = answers[i] === s.answer;
      itemScores[`sum${i}`] = { earned: ok ? 1 : 0, max: 1, mode: 'auto' };
      if (ok) earned++;
    });
    onComplete({
      answers: Object.fromEntries(sums.map((s, i) => [`sum${i}`, `${s.a} ${OP_META[s.op].symbol} ${s.b} = ${answers[i] ?? '—'}`])),
      itemScores,
      earned,
      max: sums.length,
    });
    setDone(true);
  };

  React.useEffect(() => {
    if (timeUp && !done) finish([...given, current === '' ? null : parseFloat(current.replace(',', '.'))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (sums.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Geen oefeningen geconfigureerd.</p>;

  const submit = () => {
    const val = current === '' ? null : parseFloat(current.replace(',', '.'));
    const ok = val === sums[idx].answer;
    setFeedback(ok ? 'ok' : 'nok');
    setTimeout(() => {
      const answers = [...given, val];
      setGiven(answers);
      setCurrent('');
      setFeedback(null);
      if (idx + 1 >= sums.length) finish(answers);
      else { setIdx((i) => i + 1); inputRef.current?.focus(); }
    }, ok ? 500 : 1100);
  };

  if (done) {
    const correct = sums.filter((s, i) => given[i] === s.answer).length;
    return (
      <div>
        <ResultHero earned={correct} max={sums.length} showScore={widget.settings.showScore} />
        {widget.settings.showFeedback && (
          <div className="card card-pad" style={{ marginTop: 16, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
            <h3>Verbetering</h3>
            {sums.map((s, i) => {
              const ok = given[i] === s.answer;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontWeight: 600 }}>{s.a} {OP_META[s.op].symbol} {s.b} = {given[i] ?? '—'}</span>
                  <span style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>
                    {ok ? '✓' : `✗ (${s.answer})`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const s = sums[idx];
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
      <GameStatus>
        <span>Oefening {idx + 1} / {sums.length}</span>
        <span className="badge badge-ok">✓ {given.filter((g, i) => g === sums[i].answer).length}</span>
      </GameStatus>
      <div
        className="card card-pad"
        style={{
          fontSize: 'clamp(2rem, 8vw, 3.2rem)', fontWeight: 800, padding: '34px 20px',
          fontVariantNumeric: 'tabular-nums',
          borderColor: feedback === 'ok' ? 'var(--ok)' : feedback === 'nok' ? 'var(--err)' : undefined,
          background: feedback === 'ok' ? 'var(--ok-soft)' : feedback === 'nok' ? 'var(--err-soft)' : undefined,
        }}
        aria-live="polite"
      >
        {s.a} {OP_META[s.op].symbol} {s.b} = {feedback === 'nok' ? <span style={{ color: 'var(--err)' }}>{current || '?'}</span> : current || '?'}
        {feedback === 'nok' && <div style={{ fontSize: '1.1rem', color: 'var(--err)', fontWeight: 700 }}>Juiste antwoord: {s.answer}</div>}
        {feedback === 'ok' && <div style={{ fontSize: '1.3rem', color: 'var(--ok)' }} aria-label="juist">✓</div>}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (current !== '' && !feedback) submit(); }}
        style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'center' }}
      >
        <input
          ref={inputRef}
          className="input"
          type="number"
          inputMode="decimal"
          step="any"
          style={{ maxWidth: 180, fontSize: '1.4rem', textAlign: 'center', fontWeight: 700 }}
          value={current}
          disabled={!!feedback}
          onChange={(e) => setCurrent(e.target.value)}
          aria-label="Jouw antwoord"
          autoFocus
        />
        <button className="btn btn-primary btn-lg" type="submit" disabled={current === '' || !!feedback}>OK</button>
      </form>
    </div>
  );
}
