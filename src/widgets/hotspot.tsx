import React, { useMemo, useRef, useState } from 'react';
import type { HotspotConfig, HotspotPoint } from '../lib/types';
import { shuffled, uid } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

export function HotspotEditor({ config, onChange }: EditorProps<HotspotConfig>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState(false);

  return (
    <div>
      <Field label="Modus">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${config.mode === 'explore' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, mode: 'explore' })}>
            🔎 Verkennen (info bij elke stip)
          </button>
          <button className={`btn btn-sm ${config.mode === 'quiz' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, mode: 'quiz' })}>
            🎯 Aanwijzen (zoek de juiste plek)
          </button>
        </div>
      </Field>
      <ImagePicker value={config.imageUrl || undefined} onChange={(url) => onChange({ ...config, imageUrl: url ?? '' })} label="Achtergrondafbeelding" />
      {config.imageUrl ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className={`btn btn-sm ${placing ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPlacing((v) => !v)} aria-pressed={placing}>
              {placing ? '👆 Klik op de afbeelding om een stip te plaatsen…' : '+ Stip toevoegen'}
            </button>
          </div>
          <div
            ref={stageRef}
            className="hotspot-stage"
            style={{ cursor: placing ? 'crosshair' : 'default' }}
            onClick={(e) => {
              if (!placing || !stageRef.current) return;
              const rect = stageRef.current.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              onChange({
                ...config,
                hotspots: [...config.hotspots, { id: uid(), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, label: `Punt ${config.hotspots.length + 1}` }],
              });
              setPlacing(false);
            }}
          >
            <img src={config.imageUrl} alt="Achtergrond" />
            {config.hotspots.map((h, i) => (
              <button key={h.id} className="hotspot-dot" style={{ left: `${h.x}%`, top: `${h.y}%` }} aria-label={h.label} title={h.label}
                onClick={(e) => e.stopPropagation()}>
                {i + 1}
              </button>
            ))}
          </div>
          {config.hotspots.map((h, i) => (
            <div className="option-row" key={h.id} style={{ marginTop: 8 }}>
              <span className="badge badge-brand">{i + 1}</span>
              <input className="input input-sm" style={{ maxWidth: 200 }} value={h.label} placeholder="Naam van dit punt"
                onChange={(e) => {
                  const hotspots = config.hotspots.slice();
                  hotspots[i] = { ...h, label: e.target.value };
                  onChange({ ...config, hotspots });
                }} />
              <input className="input input-sm" value={h.description ?? ''} placeholder="Uitleg (bij verkennen)"
                onChange={(e) => {
                  const hotspots = config.hotspots.slice();
                  hotspots[i] = { ...h, description: e.target.value };
                  onChange({ ...config, hotspots });
                }} />
              <button className="btn btn-quiet btn-icon btn-sm" aria-label="Stip verwijderen"
                onClick={() => onChange({ ...config, hotspots: config.hotspots.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
        </>
      ) : (
        <p className="hint">Kies eerst een afbeelding (bv. een kaart, anatomie-figuur of schema).</p>
      )}
    </div>
  );
}

export function HotspotPlayer({ widget, onComplete }: PlayerProps<HotspotConfig>) {
  const config = widget.config;
  if (!config.imageUrl || config.hotspots.length === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Deze widget heeft nog geen afbeelding of stippen.</p>;
  }
  return config.mode === 'explore'
    ? <HotspotExplore widget={widget} onComplete={onComplete} />
    : <HotspotQuiz widget={widget} onComplete={onComplete} />;
}

function HotspotExplore({ widget, onComplete }: { widget: PlayerProps<HotspotConfig>['widget']; onComplete: PlayerProps['onComplete'] }) {
  const config = widget.config;
  const [openSpot, setOpenSpot] = useState<HotspotPoint | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  const open = (h: HotspotPoint) => {
    setOpenSpot(h);
    const next = new Set(seen).add(h.id);
    setSeen(next);
    if (next.size === config.hotspots.length && !finished) {
      setFinished(true);
      onComplete({ answers: { bekeken: config.hotspots.length }, itemScores: null, earned: 0, max: 0 });
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <GameStatus>
        <span className="badge badge-ok">👀 {seen.size} / {config.hotspots.length} bekeken</span>
      </GameStatus>
      <div className="hotspot-stage">
        <img src={config.imageUrl} alt="Interactieve afbeelding" />
        {config.hotspots.map((h, i) => (
          <button
            key={h.id}
            className={`hotspot-dot ${seen.has(h.id) ? 'found' : 'pulse'}`}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            aria-label={`Punt ${i + 1}${seen.has(h.id) ? ` — ${h.label}` : ''}`}
            onClick={() => open(h)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {openSpot && (
        <div className="card card-pad" style={{ maxWidth: 480, margin: '16px auto 0', textAlign: 'left' }} role="region" aria-live="polite">
          <h3 style={{ marginBottom: 4 }}>📍 {openSpot.label}</h3>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>{openSpot.description || 'Geen extra uitleg.'}</p>
        </div>
      )}
      {finished && <p style={{ color: 'var(--ok)', fontWeight: 700, marginTop: 14 }}>✓ Je hebt alle punten verkend!</p>}
    </div>
  );
}

function HotspotQuiz({ widget, onComplete }: { widget: PlayerProps<HotspotConfig>['widget']; onComplete: PlayerProps['onComplete'] }) {
  const config = widget.config;
  const order = useMemo(() => shuffled(config.hotspots), [widget.id]);
  const [idx, setIdx] = useState(0);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [wrongClicks, setWrongClicks] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'nok' | null>(null);
  const [done, setDone] = useState(false);

  const target = order[idx];

  const clickSpot = (h: HotspotPoint) => {
    if (done || found.has(h.id)) return;
    if (h.id === target.id) {
      const nextFound = new Set(found).add(h.id);
      setFound(nextFound);
      setFlash('ok');
      setTimeout(() => setFlash(null), 500);
      if (nextFound.size === order.length) {
        setDone(true);
        onComplete({
          answers: { fouteKlikken: wrongClicks },
          itemScores: null,
          earned: order.length,
          max: order.length,
        });
      } else {
        setIdx((i) => i + 1);
      }
    } else {
      setWrongClicks((w) => w + 1);
      setFlash('nok');
      setTimeout(() => setFlash(null), 500);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={order.length} max={order.length} showScore={false}
        title="Alles gevonden! 🎯"
        subtitle={`Je vond alle ${order.length} punten met ${wrongClicks} ${wrongClicks === 1 ? 'foute klik' : 'foute klikken'}.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          setFound(new Set()); setIdx(0); setWrongClicks(0); setDone(false);
        }}>🔁 Opnieuw</button>
      </ResultHero>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <GameStatus>
        <span className="badge badge-ok">🎯 {found.size} / {order.length}</span>
        <span className="badge badge-err">✗ {wrongClicks} fout</span>
      </GameStatus>
      <p style={{ fontSize: '1.25rem', fontWeight: 700, minHeight: 34 }} aria-live="assertive">
        Waar is: <span style={{ color: flash === 'nok' ? 'var(--err)' : 'var(--player-accent, var(--brand))' }}>{target.label}</span>?
        {flash === 'ok' && <span style={{ color: 'var(--ok)' }}> ✓</span>}
        {flash === 'nok' && <span style={{ color: 'var(--err)' }}> — probeer nog eens!</span>}
      </p>
      <div className="hotspot-stage">
        <img src={config.imageUrl} alt="Zoek het gevraagde punt op de afbeelding" />
        {config.hotspots.map((h) => (
          <button
            key={h.id}
            className={`hotspot-dot ${found.has(h.id) ? 'found' : ''}`}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            aria-label={found.has(h.id) ? h.label : 'Onbekend punt'}
            onClick={() => clickSpot(h)}
          >
            {found.has(h.id) ? '✓' : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}
