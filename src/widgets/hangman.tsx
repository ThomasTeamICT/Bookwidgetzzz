import React, { useMemo, useState } from 'react';
import type { HangmanConfig } from '../lib/types';
import { shuffled } from '../lib/utils';
import { Field } from '../components/ui';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function HangmanEditor({ config, onChange }: EditorProps<HangmanConfig>) {
  return (
    <div>
      <Field
        label="Woorden en hints"
        hint="Eén woord per regel. Voeg optioneel een hint toe na een dubbelepunt, bv.: fotosynthese: proces in groene planten"
      >
        <textarea
          className="textarea" rows={8}
          value={config.words.map((w) => (w.hint ? `${w.word}: ${w.hint}` : w.word)).join('\n')}
          onChange={(e) => {
            const words = e.target.value.split('\n').map((line) => {
              const ix = line.indexOf(':');
              if (ix === -1) return { word: line, hint: '' };
              return { word: line.slice(0, ix).trim(), hint: line.slice(ix + 1).trim() };
            });
            onChange({ ...config, words });
          }}
        />
      </Field>
      <Field label="Maximaal aantal fouten">
        <input className="input input-sm" type="number" min={3} max={12} style={{ maxWidth: 110 }}
          value={config.maxErrors}
          onChange={(e) => onChange({ ...config, maxErrors: Math.max(3, Math.min(12, parseInt(e.target.value) || 8)) })} />
      </Field>
    </div>
  );
}

/** Eenvoudige, vriendelijke visual: ballonnen die één voor één wegvliegen. */
function BalloonMeter({ left, total }: { left: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', fontSize: '1.7rem' }} aria-label={`Nog ${left} van ${total} kansen`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ opacity: i < left ? 1 : 0.15, transition: 'opacity 0.3s' }} aria-hidden>🎈</span>
      ))}
    </div>
  );
}

export function HangmanPlayer({ widget, onComplete }: PlayerProps<HangmanConfig>) {
  const words = useMemo(() => {
    const valid = widget.config.words.filter((w) => w.word.trim().length >= 2);
    return widget.settings.shuffle ? shuffled(valid) : valid;
  }, [widget.id]);

  const [round, setRound] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState(0);
  const [solved, setSolved] = useState(0);
  const [roundOver, setRoundOver] = useState<'won' | 'lost' | null>(null);
  const [done, setDone] = useState(false);

  if (words.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen woorden ingesteld.</p>;

  const entry = words[round];
  const target = entry.word.toUpperCase();
  const letters = new Set(target.replace(/[^A-ZÀ-ÿ]/g, '').split(''));
  const maxErrors = widget.config.maxErrors;

  const display = target.split('').map((ch) => {
    if (!/[A-ZÀ-ÿ]/.test(ch)) return ch;
    return guessed.has(ch) || roundOver ? ch : '_';
  });

  const guess = (letter: string) => {
    if (roundOver || guessed.has(letter)) return;
    const next = new Set(guessed).add(letter);
    setGuessed(next);
    if (!letters.has(letter)) {
      const e = errors + 1;
      setErrors(e);
      if (e >= maxErrors) setRoundOver('lost');
    } else {
      const allFound = [...letters].every((l) => next.has(l));
      if (allFound) {
        setSolved((s) => s + 1);
        setRoundOver('won');
      }
    }
  };

  const nextRound = () => {
    const wasLast = round + 1 >= words.length;
    const finalSolved = solved;
    if (wasLast) {
      setDone(true);
      onComplete({
        answers: { geraden: finalSolved, totaal: words.length },
        itemScores: null,
        earned: finalSolved,
        max: words.length,
      });
    } else {
      setRound((r) => r + 1);
      setGuessed(new Set());
      setErrors(0);
      setRoundOver(null);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={solved} max={words.length}
        showScore={widget.settings.showScore}
        title={solved === words.length ? 'Alle woorden geraden! 🏆' : 'Spel afgelopen!'}
        subtitle={`Je raadde ${solved} van de ${words.length} woorden.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          setRound(0); setGuessed(new Set()); setErrors(0); setSolved(0); setRoundOver(null); setDone(false);
        }}>🔁 Opnieuw spelen</button>
      </ResultHero>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <GameStatus>
        <span>Woord {round + 1} / {words.length}</span>
        <span className="badge badge-ok">✓ {solved} geraden</span>
      </GameStatus>
      <BalloonMeter left={maxErrors - errors} total={maxErrors} />
      {entry.hint && (
        <p style={{ marginTop: 14, color: 'var(--text-soft)' }}>💡 Hint: <strong>{entry.hint}</strong></p>
      )}
      <p
        style={{ fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', fontWeight: 800, letterSpacing: '0.35em', margin: '22px 0', fontFamily: 'monospace' }}
        aria-label={`Woord: ${display.join(' ')}`}
      >
        {display.join('')}
      </p>
      {roundOver ? (
        <div>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: roundOver === 'won' ? 'var(--ok)' : 'var(--err)' }}>
            {roundOver === 'won' ? '🎉 Geraden!' : `😢 Helaas! Het woord was “${target}”.`}
          </p>
          <button className="btn btn-primary btn-lg" onClick={nextRound}>
            {round + 1 >= words.length ? 'Bekijk resultaat →' : 'Volgend woord →'}
          </button>
        </div>
      ) : (
        <div className="big-letter-grid" role="group" aria-label="Letters om te raden">
          {ALPHABET.map((l) => {
            const used = guessed.has(l);
            const hit = used && letters.has(l);
            return (
              <button
                key={l}
                className={`letter-key ${used ? (hit ? 'hit' : 'miss') : ''}`}
                disabled={used}
                onClick={() => guess(l)}
                aria-label={`Letter ${l}${used ? (hit ? ', juist' : ', fout') : ''}`}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
