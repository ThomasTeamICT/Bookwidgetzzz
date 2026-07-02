import React, { useMemo, useState } from 'react';
import type { PairsConfig } from '../lib/types';
import { shuffled, uid } from '../lib/utils';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

export function PairsEditor({ config, onChange }: EditorProps<PairsConfig>) {
  const pairs = config.pairs;
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling ziet twee kolommen en klikt telkens één item links en één item rechts aan om een paar te vormen.
      </p>
      {pairs.map((p, i) => (
        <div className="option-row" key={p.id}>
          <input className="input input-sm" placeholder="Links (bv. le chien)" value={p.left}
            onChange={(e) => { const next = pairs.slice(); next[i] = { ...p, left: e.target.value }; onChange({ ...config, pairs: next }); }} />
          <span aria-hidden>↔</span>
          <input className="input input-sm" placeholder="Rechts (bv. de hond)" value={p.right}
            onChange={(e) => { const next = pairs.slice(); next[i] = { ...p, right: e.target.value }; onChange({ ...config, pairs: next }); }} />
          <button className="btn btn-quiet btn-icon btn-sm" aria-label="Paar verwijderen" disabled={pairs.length <= 2}
            onClick={() => onChange({ ...config, pairs: pairs.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => onChange({ ...config, pairs: [...pairs, { id: uid(), left: '', right: '' }] })}>
        + Paar toevoegen
      </button>
    </div>
  );
}

export function PairsPlayer({ widget, onComplete }: PlayerProps<PairsConfig>) {
  const pairs = useMemo(() => widget.config.pairs.filter((p) => p.left && p.right), [widget.id]);
  const leftOrder = useMemo(() => (widget.settings.shuffle ? shuffled(pairs) : pairs), [widget.id]);
  const rightOrder = useMemo(() => shuffled(pairs), [widget.id]);

  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [selRight, setSelRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (pairs.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen paren ingesteld.</p>;

  const tryMatch = (leftId: string | null, rightId: string | null) => {
    if (!leftId || !rightId) return;
    if (leftId === rightId) {
      const nextMatched = new Set(matched).add(leftId);
      setMatched(nextMatched);
      setSelLeft(null); setSelRight(null);
      if (nextMatched.size === pairs.length) {
        setDone(true);
        onComplete({
          answers: { fouten: mistakes, paren: pairs.length },
          itemScores: null,
          earned: pairs.length,
          max: pairs.length,
        });
      }
    } else {
      setMistakes((m) => m + 1);
      setShake(rightId);
      setTimeout(() => { setShake(null); setSelLeft(null); setSelRight(null); }, 600);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={pairs.length} max={pairs.length} showScore={false}
        title="Alles gekoppeld! 🔗"
        subtitle={`Je vond alle ${pairs.length} paren met ${mistakes} ${mistakes === 1 ? 'fout' : 'fouten'}.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          setMatched(new Set()); setMistakes(0); setDone(false); setSelLeft(null); setSelRight(null);
        }}>🔁 Opnieuw spelen</button>
      </ResultHero>
    );
  }

  const col = (items: typeof pairs, side: 'left' | 'right') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0 }}>
      {items.map((p) => {
        const isMatched = matched.has(p.id);
        const isSel = side === 'left' ? selLeft === p.id : selRight === p.id;
        const isShake = side === 'right' && shake === p.id;
        return (
          <button
            key={p.id}
            className={`answer-option ${isSel ? 'selected' : ''} ${isMatched ? 'correct' : ''} ${isShake ? 'incorrect' : ''}`}
            style={{ marginBottom: 0, justifyContent: 'center', textAlign: 'center', opacity: isMatched ? 0.55 : 1 }}
            disabled={isMatched}
            aria-pressed={isSel}
            onClick={() => {
              if (side === 'left') { setSelLeft(p.id); tryMatch(p.id, selRight); }
              else { setSelRight(p.id); tryMatch(selLeft, p.id); }
            }}
          >
            {side === 'left' ? p.left : p.right}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <GameStatus>
        <span className="badge badge-ok">✓ {matched.size} / {pairs.length}</span>
        <span className="badge badge-err">✗ {mistakes} fouten</span>
      </GameStatus>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginBottom: 14, fontSize: '0.9rem' }}>
        Klik een item links en het bijhorende item rechts aan.
      </p>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        {col(leftOrder, 'left')}
        {col(rightOrder, 'right')}
      </div>
    </div>
  );
}
