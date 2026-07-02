import React, { useEffect, useMemo, useState } from 'react';
import type { Flashcard, FlashcardsConfig } from '../lib/types';
import { shuffled, uid } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { EditorProps, GameStatus, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';

export function FlashcardsEditor({ config, onChange }: EditorProps<FlashcardsConfig>) {
  const cards = config.cards;
  const update = (i: number, c: Flashcard) => {
    const next = cards.slice();
    next[i] = c;
    onChange({ ...config, cards: next });
  };
  return (
    <div>
      <Field label="Automatisch omdraaien (seconden, 0 = uit)" hint="Handig om zelfstandig te studeren.">
        <input className="input input-sm" type="number" min={0} max={60} style={{ maxWidth: 110 }}
          value={config.autoFlipSec}
          onChange={(e) => onChange({ ...config, autoFlipSec: Math.max(0, parseInt(e.target.value) || 0) })} />
      </Field>
      {cards.map((c, i) => (
        <div className="editor-item" key={c.id}>
          <ItemHeader
            index={i}
            label={c.front || 'Nieuwe kaart'}
            canUp={i > 0} canDown={i < cards.length - 1}
            onMoveUp={() => onChange({ ...config, cards: moveItem(cards, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, cards: moveItem(cards, i, i + 1) })}
            onDelete={() => onChange({ ...config, cards: cards.filter((_, j) => j !== i) })}
          />
          <div className="editor-item-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <Field label="Voorkant">
                <textarea className="textarea" rows={2} value={c.front} placeholder="bv. de hond"
                  onChange={(e) => update(i, { ...c, front: e.target.value })} />
              </Field>
              <ImagePicker value={c.frontImage} onChange={(frontImage) => update(i, { ...c, frontImage })} label="Afbeelding voorkant" />
            </div>
            <div>
              <Field label="Achterkant">
                <textarea className="textarea" rows={2} value={c.back} placeholder="bv. the dog"
                  onChange={(e) => update(i, { ...c, back: e.target.value })} />
              </Field>
              <ImagePicker value={c.backImage} onChange={(backImage) => update(i, { ...c, backImage })} label="Afbeelding achterkant" />
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => onChange({ ...config, cards: [...cards, { id: uid(), front: '', back: '' }] })}>
        + Kaart toevoegen
      </button>
    </div>
  );
}

export function FlashcardsPlayer({ widget, onComplete }: PlayerProps<FlashcardsConfig>) {
  const cards = useMemo(
    () => (widget.settings.shuffle ? shuffled(widget.config.cards) : widget.config.cards).filter((c) => c.front || c.back || c.frontImage || c.backImage),
    [widget.id]
  );
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [again, setAgain] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  const card = cards[idx];

  useEffect(() => {
    if (!widget.config.autoFlipSec || flipped || done) return;
    const t = setTimeout(() => setFlipped(true), widget.config.autoFlipSec * 1000);
    return () => clearTimeout(t);
  }, [idx, flipped, done]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (e.key === 'ArrowRight') next(true);
      if (e.key === 'ArrowLeft') next(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done, cards.length]);

  if (cards.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen kaarten in deze set.</p>;

  const next = (knewIt: boolean) => {
    if (done || !card) return;
    if (knewIt) setKnown((s) => new Set(s).add(card.id));
    else setAgain((s) => new Set(s).add(card.id));
    if (idx + 1 >= cards.length) {
      setDone(true);
      const knownCount = known.size + (knewIt ? 1 : 0);
      onComplete({
        answers: { gekend: knownCount, teHerhalen: cards.length - knownCount },
        itemScores: null,
        earned: knownCount,
        max: cards.length,
      });
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={known.size} max={cards.length}
        showScore={widget.settings.showScore}
        title="Set afgewerkt! 🎓"
        subtitle={`Je kende ${known.size} van de ${cards.length} kaarten.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          setIdx(0); setFlipped(false); setKnown(new Set()); setAgain(new Set()); setDone(false);
        }}>
          🔁 Opnieuw oefenen
        </button>
      </ResultHero>
    );
  }

  return (
    <div>
      <GameStatus>
        <span>Kaart {idx + 1} / {cards.length}</span>
        <span className="badge badge-ok">✓ {known.size} gekend</span>
        <span className="badge badge-warn">↻ {again.size} herhalen</span>
      </GameStatus>
      <div className="flashcard-stage">
        <button
          className={`flashcard ${flipped ? 'flipped' : ''}`}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Kaart terugdraaien' : 'Kaart omdraaien'}
        >
          <span className="face front">
            <span className="face-label">Voorkant</span>
            {card.frontImage && <img src={card.frontImage} alt="" />}
            <span>{card.front}</span>
          </span>
          <span className="face back">
            <span className="face-label">Achterkant</span>
            {card.backImage && <img src={card.backImage} alt="" />}
            <span>{card.back}</span>
          </span>
        </button>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: 12, fontSize: '0.88rem' }}>
        Klik op de kaart (of druk op spatie) om ze om te draaien.
      </p>
      <div className="player-nav" style={{ justifyContent: 'center', gap: 14 }}>
        <button className="btn btn-lg" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }} onClick={() => next(false)}>
          ↻ Nog eens herhalen
        </button>
        <button className="btn btn-lg" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }} onClick={() => next(true)}>
          ✓ Die ken ik!
        </button>
      </div>
    </div>
  );
}
