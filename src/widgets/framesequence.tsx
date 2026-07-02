import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Frame, FrameSequenceConfig } from '../lib/types';
import { uid } from '../lib/utils';
import { EmptyState, Field, ImagePicker } from '../components/ui';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';

// ── Editor ──────────────────────────────────────────────────────────────────

export function FrameSequenceEditor({ config, onChange }: EditorProps<FrameSequenceConfig>) {
  const frames = config.frames ?? [];

  const update = (i: number, f: Frame) => {
    const next = frames.slice();
    next[i] = f;
    onChange({ ...config, frames: next });
  };

  const addFrame = () =>
    onChange({ ...config, frames: [...frames, { id: uid(), title: '', text: '' }] });

  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling bekijkt de stappen één voor één, in deze volgorde — handig voor een stappenplan,
        beeldverhaal of proefopstelling. Per stap kun je een titel, tekst en een afbeelding instellen.
      </p>
      {frames.length === 0 && (
        <EmptyState icon="🎞️" title="Nog geen stappen">
          <p>Voeg je eerste stap toe om de reeks te vullen.</p>
        </EmptyState>
      )}
      {frames.map((f, i) => (
        <div className="editor-item" key={f.id}>
          <ItemHeader
            index={i}
            label={f.title || 'Nieuwe stap'}
            canUp={i > 0}
            canDown={i < frames.length - 1}
            onMoveUp={() => onChange({ ...config, frames: moveItem(frames, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, frames: moveItem(frames, i, i + 1) })}
            onDelete={() => onChange({ ...config, frames: frames.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const next = frames.slice();
              next.splice(i + 1, 0, { ...f, id: uid() });
              onChange({ ...config, frames: next });
            }}
          />
          <div className="editor-item-body">
            <Field label="Titel">
              <input
                className="input input-sm"
                value={f.title}
                placeholder="bv. Stap 1 — Zaadje planten"
                onChange={(e) => update(i, { ...f, title: e.target.value })}
              />
            </Field>
            <Field label="Tekst" hint="Uitleg die onder de titel verschijnt.">
              <textarea
                className="textarea"
                rows={3}
                value={f.text ?? ''}
                onChange={(e) => update(i, { ...f, text: e.target.value })}
              />
            </Field>
            <ImagePicker
              value={f.imageUrl}
              onChange={(imageUrl) => update(i, { ...f, imageUrl })}
              label="Afbeelding (optioneel)"
            />
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addFrame}>+ Stap toevoegen</button>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function FrameSequencePlayer({ widget, timeUp, onComplete }: PlayerProps<FrameSequenceConfig>) {
  const frames = useMemo(
    () =>
      (widget.config.frames ?? []).filter(
        (f) => (f.title ?? '').trim() || (f.text ?? '').trim() || f.imageUrl
      ),
    [widget.id]
  );
  const total = frames.length;

  const [idx, setIdx] = useState(0);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const firedRef = useRef(false);

  const frame = frames[idx] as Frame | undefined;
  const isLast = idx === total - 1;

  // Huidige stap als bekeken markeren.
  useEffect(() => {
    const f = frames[idx];
    if (!f) return;
    setViewed((v) => (v.has(f.id) ? v : new Set(v).add(f.id)));
  }, [idx, frames]);

  const finish = (count: number) => {
    if (firedRef.current) return;
    firedRef.current = true;
    onComplete({ answers: { bekeken: count }, itemScores: null, earned: 0, max: 0 });
  };

  // Tijd om → meteen indienen met de huidige voortgang.
  useEffect(() => {
    if (timeUp && !done) {
      setDone(true);
      finish(viewed.size);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const goTo = (i: number) => {
    if (total === 0) return;
    setIdx(Math.max(0, Math.min(total - 1, i)));
  };

  // Pijltjestoetsen: ← vorige, → volgende.
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(total - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total, done]);

  if (total === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Nog geen stappen ingesteld. Vraag je leerkracht om de reeks aan te vullen.
      </p>
    );
  }

  if (done) {
    return (
      <ResultHero
        earned={0}
        max={0}
        showScore={false}
        title="Bedankt voor het kijken! 👀"
        subtitle={`Je bekeek ${viewed.size} van de ${total} stappen.`}
      >
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={() => { setDone(false); setIdx(0); }}
        >
          🔁 Opnieuw bekijken
        </button>
      </ResultHero>
    );
  }

  if (!frame) return null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        role="status"
        aria-live="polite"
        style={{ textAlign: 'center', fontWeight: 650, color: 'var(--text-soft)', marginBottom: 8 }}
      >
        Stap {idx + 1} van {total}
        <span className="sr-only">{frame.title ? `: ${frame.title}` : ''}</span>
      </div>
      <div
        className="progressbar"
        role="progressbar"
        aria-label="Voortgang door de stappen"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={idx + 1}
        aria-valuetext={`Stap ${idx + 1} van ${total}`}
        style={{ marginBottom: 18 }}
      >
        <div style={{ width: `${((idx + 1) / total) * 100}%` }} />
      </div>

      <div className="card question-card">
        {frame.imageUrl && (
          <img
            src={frame.imageUrl}
            alt=""
            style={{
              display: 'block',
              width: '100%',
              maxHeight: '55vh',
              objectFit: 'contain',
              borderRadius: 'var(--radius-m)',
              background: 'var(--bg-sunken)',
              marginBottom: 14,
            }}
          />
        )}
        {frame.title && (
          <h2 style={{ margin: '0 0 8px', color: 'var(--player-accent, var(--brand))' }}>
            {frame.title}
          </h2>
        )}
        {(frame.text ?? '').trim() && (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{frame.text}</p>
        )}
      </div>

      <div className="player-nav">
        <button
          className="btn btn-ghost"
          aria-label="Vorige stap"
          disabled={idx === 0}
          onClick={() => goTo(idx - 1)}
        >
          ← Vorige
        </button>
        {isLast ? (
          <button
            className="btn btn-primary btn-lg"
            aria-label="Klaar met bekijken"
            onClick={() => { setDone(true); finish(viewed.size); }}
          >
            Klaar ✓
          </button>
        ) : (
          <button
            className="btn btn-primary"
            aria-label="Volgende stap"
            onClick={() => goTo(idx + 1)}
          >
            Volgende →
          </button>
        )}
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
        Tip: blader met de pijltjestoetsen.
      </p>
    </div>
  );
}
