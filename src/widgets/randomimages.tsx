import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RandomImagesConfig } from '../lib/types';
import { uid } from '../lib/utils';
import { CheckRow, EmptyState, Field, ImagePicker } from '../components/ui';
import { EditorProps, GameStatus, ItemHeader, moveItem, PlayerProps } from './shared';

type RandomImage = RandomImagesConfig['images'][number];

// ── Editor ──────────────────────────────────────────────────────────────────

export function RandomImagesEditor({ config, onChange }: EditorProps<RandomImagesConfig>) {
  const images = config.images ?? [];

  const update = (i: number, item: RandomImage) => {
    const next = images.slice();
    next[i] = item;
    onChange({ ...config, images: next });
  };

  const add = () =>
    onChange({ ...config, images: [...images, { id: uid(), imageUrl: '', caption: '' }] });

  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling drukt op een knop en krijgt telkens een willekeurige afbeelding te zien —
        handig als schrijfprikkel, gespreksstarter of om beurten en opdrachten te verloten.
      </p>
      {images.length === 0 && (
        <EmptyState icon="🎲" title="Nog geen afbeeldingen">
          <p>Voeg minstens twee afbeeldingen toe zodat er echt iets te loten valt.</p>
        </EmptyState>
      )}
      {images.map((img, i) => (
        <div className="editor-item" key={img.id}>
          <ItemHeader
            index={i}
            label={img.caption || (img.imageUrl ? `Afbeelding ${i + 1}` : 'Nieuwe afbeelding')}
            canUp={i > 0}
            canDown={i < images.length - 1}
            onMoveUp={() => onChange({ ...config, images: moveItem(images, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, images: moveItem(images, i, i + 1) })}
            onDelete={() => onChange({ ...config, images: images.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const next = images.slice();
              next.splice(i + 1, 0, { ...img, id: uid() });
              onChange({ ...config, images: next });
            }}
          />
          <div className="editor-item-body">
            <ImagePicker
              value={img.imageUrl || undefined}
              onChange={(imageUrl) => update(i, { ...img, imageUrl: imageUrl ?? '' })}
              label="Afbeelding"
            />
            {!img.imageUrl && (
              <p className="hint" style={{ marginTop: -6 }}>
                Zonder afbeelding doet dit item niet mee aan de trekking.
              </p>
            )}
            <Field label="Bijschrift (optioneel)" hint="Verschijnt groot onder de afbeelding.">
              <input
                className="input input-sm"
                value={img.caption ?? ''}
                placeholder="bv. Een verlaten vuurtoren in de mist"
                onChange={(e) => update(i, { ...img, caption: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={add}>+ Afbeelding toevoegen</button>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function RandomImagesPlayer({ widget, timeUp, onComplete }: PlayerProps<RandomImagesConfig>) {
  const images = useMemo(
    () => (widget.config.images ?? []).filter((im) => im.imageUrl),
    [widget.id]
  );

  /** Index van de afbeelding die nu groot getoond wordt. */
  const [current, setCurrent] = useState<number | null>(null);
  /** Eerder getoonde indices in deze ronde (oudste eerst), zonder de huidige. */
  const [past, setPast] = useState<number[]>([]);
  const [noRepeat, setNoRepeat] = useState(true);
  /** Verandert bij elke trekking zodat de fade-in opnieuw afspeelt. */
  const [tick, setTick] = useState(0);
  /** Alles wat ooit getoond is (ook over resets heen) — voor de registratie. */
  const [everSeen, setEverSeen] = useState<Set<number>>(new Set());
  const firedRef = useRef(false);

  const finish = (count: number) => {
    if (firedRef.current) return;
    firedRef.current = true;
    onComplete({
      answers: { getoond: count, totaal: images.length },
      itemScores: null,
      earned: 0,
      max: 0,
    });
  };

  const allSeen = images.length > 0 && everSeen.size >= images.length;

  // Alles minstens één keer gezien → precies één keer registreren.
  useEffect(() => {
    if (allSeen) finish(everSeen.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSeen]);

  // Tijd om → huidige voortgang meteen registreren.
  useEffect(() => {
    if (timeUp) finish(everSeen.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (images.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Nog geen afbeeldingen ingesteld. Vraag je leerkracht om afbeeldingen toe te voegen.
      </p>
    );
  }

  const shownThisRound = new Set(past);
  if (current !== null) shownThisRound.add(current);
  const exhausted = noRepeat && shownThisRound.size >= images.length;

  const draw = () => {
    const all = images.map((_, i) => i);
    let pool = noRepeat
      ? all.filter((i) => !shownThisRound.has(i))
      : all.filter((i) => i !== current);
    if (pool.length === 0) {
      if (noRepeat) return;
      pool = all; // slechts één afbeelding: dan mag ze wél opnieuw
    }
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (current !== null) setPast((p) => [...p, current]);
    setCurrent(next);
    setEverSeen((s) => (s.has(next) ? s : new Set(s).add(next)));
    setTick((t) => t + 1);
  };

  const reset = () => {
    setPast([]);
    setCurrent(null);
    setTick((t) => t + 1);
  };

  const cur = current !== null ? images[current] : null;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <GameStatus>
        <span className="badge badge-brand">🖼 {shownThisRound.size} van {images.length} getoond</span>
        {!noRepeat && <span className="badge">herhaling toegestaan</span>}
      </GameStatus>

      {/* Podium */}
      <div
        className="card"
        aria-live="polite"
        style={{
          padding: 20,
          textAlign: 'center',
          minHeight: 300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderColor: 'color-mix(in srgb, var(--player-accent, var(--brand)) 40%, var(--line))',
        }}
      >
        {cur ? (
          <figure key={tick} style={{ margin: 0, maxWidth: '100%', animation: 'popIn 0.5s ease' }}>
            <img
              src={cur.imageUrl}
              alt={cur.caption || `Afbeelding ${(current ?? 0) + 1}`}
              style={{
                maxWidth: '100%',
                maxHeight: '52vh',
                borderRadius: 'var(--radius-m)',
                boxShadow: 'var(--shadow-2)',
                objectFit: 'contain',
              }}
            />
            <figcaption style={{ marginTop: 12 }}>
              <span className="sr-only">Nieuwe afbeelding: </span>
              {cur.caption ? (
                <strong style={{ fontSize: '1.25rem', color: 'var(--player-accent, var(--brand))' }}>
                  {cur.caption}
                </strong>
              ) : (
                <span className="sr-only">zonder bijschrift</span>
              )}
            </figcaption>
          </figure>
        ) : (
          <>
            <div style={{ fontSize: '3.2rem' }} aria-hidden>🎲</div>
            <p style={{ color: 'var(--text-soft)', margin: 0 }}>
              Druk op de knop en ontdek welke afbeelding het lot voor je kiest.
            </p>
          </>
        )}
      </div>

      {/* Bediening */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 18 }}>
        {exhausted ? (
          <>
            <p role="status" style={{ color: 'var(--ok)', fontWeight: 700, margin: 0 }}>
              🎉 Alle afbeeldingen zijn geweest!
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={reset}
              aria-label="Opnieuw beginnen met alle afbeeldingen"
            >
              🔁 Opnieuw beginnen
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-lg"
            onClick={draw}
            aria-label="Toon een willekeurige afbeelding"
          >
            🎲 Toon een willekeurige afbeelding
          </button>
        )}
        <CheckRow
          checked={noRepeat}
          onChange={setNoRepeat}
          label="Zonder herhaling (elke afbeelding maar één keer)"
        />
      </div>

      {/* Geschiedenisstrook */}
      {past.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h3
            style={{
              textAlign: 'center',
              fontSize: '0.82rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-faint)',
              marginBottom: 8,
            }}
          >
            Eerder getoond
          </h3>
          <ul
            aria-label="Eerder getoonde afbeeldingen, meest recente eerst"
            style={{
              listStyle: 'none',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              padding: 0,
              margin: 0,
            }}
          >
            {[...past].reverse().map((idx, k) => {
              const im = images[idx];
              return (
                <li key={past.length - 1 - k} style={{ flex: 'none' }}>
                  <img
                    src={im.imageUrl}
                    alt={im.caption || `Afbeelding ${idx + 1}`}
                    title={im.caption || `Afbeelding ${idx + 1}`}
                    style={{
                      width: 58,
                      height: 58,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '2px solid var(--line-strong)',
                      display: 'block',
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
