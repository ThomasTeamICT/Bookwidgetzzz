import React, { useEffect, useRef, useState } from 'react';
import type { TimerConfig } from '../lib/types';
import { CheckRow, Field } from '../components/ui';
import { EditorProps, PlayerProps } from './shared';

export function TimerEditor({ config, onChange }: EditorProps<TimerConfig>) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Minuten">
          <input className="input input-sm" type="number" min={0} max={180} value={config.minutes}
            onChange={(e) => onChange({ ...config, minutes: Math.max(0, Math.min(180, parseInt(e.target.value) || 0)) })} />
        </Field>
        <Field label="Seconden">
          <input className="input input-sm" type="number" min={0} max={59} value={config.seconds}
            onChange={(e) => onChange({ ...config, seconds: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })} />
        </Field>
      </div>
      <Field label="Opdracht boven de timer (optioneel)">
        <input className="input" value={config.label} placeholder="bv. Werk in stilte aan oefening 3"
          onChange={(e) => onChange({ ...config, label: e.target.value })} />
      </Field>
      <CheckRow checked={config.sound} onChange={(v) => onChange({ ...config, sound: v })} label="Geluid wanneer de tijd om is" />
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const play = (freq: number, t0: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.001, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + dur + 0.05);
    };
    play(880, 0, 0.28); play(880, 0.4, 0.28); play(1174, 0.8, 0.5);
  } catch {
    // audio niet beschikbaar — stil laten
  }
}

export function TimerPlayer({ widget }: PlayerProps<TimerConfig>) {
  const total = widget.config.minutes * 60 + widget.config.seconds;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const soundedRef = useRef(false);
  const endRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const remaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        setRunning(false);
        if (widget.config.sound && !soundedRef.current) {
          soundedRef.current = true;
          beep();
        }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [running]);

  const start = () => {
    if (left <= 0) return;
    endRef.current = Date.now() + left * 1000;
    soundedRef.current = false;
    setRunning(true);
  };

  const mm = Math.floor(left / 60).toString().padStart(2, '0');
  const ss = (left % 60).toString().padStart(2, '0');
  const cls = left === 0 ? 'danger' : left <= 30 && running ? 'warning' : '';
  const progress = total > 0 ? left / total : 0;

  return (
    <div style={{ textAlign: 'center', paddingTop: 20 }}>
      {widget.config.label && <h2 style={{ marginBottom: 20 }}>{widget.config.label}</h2>}
      <div className={`timer-display ${cls}`} role="timer" aria-live={left <= 10 ? 'assertive' : 'off'} aria-label={`Nog ${mm} minuten en ${ss} seconden`}>
        {mm}:{ss}
      </div>
      {left === 0 && <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--err)' }} role="alert">⏰ De tijd is om!</p>}
      <div className="progressbar" style={{ maxWidth: 420, margin: '22px auto' }}>
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {running ? (
          <button className="btn btn-lg" onClick={() => setRunning(false)}>⏸ Pauze</button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={start} disabled={left <= 0}>▶ Start</button>
        )}
        <button className="btn btn-ghost btn-lg" onClick={() => { setRunning(false); setLeft(total); }}>↺ Reset</button>
      </div>
    </div>
  );
}
