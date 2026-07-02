import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bumpAttemptCount, getAttemptCount, getWidgetByCode, saveSubmission } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { Submission, Widget } from '../lib/types';
import type { PlayerResult } from '../widgets/shared';
import { uid } from '../lib/utils';

export function PlayerPage() {
  const { code } = useParams();
  const widget = useMemo(() => (code ? getWidgetByCode(code) : undefined), [code]);

  if (!widget) {
    return (
      <div className="player-shell" style={{ minHeight: '100vh' }}>
        <div className="player-main" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: '3rem' }} aria-hidden>🔎</div>
          <h1>Widget niet gevonden</h1>
          <p style={{ color: 'var(--text-soft)' }}>
            Er bestaat geen widget met code <strong style={{ fontFamily: 'monospace' }}>{code}</strong> op dit toestel.<br />
            Controleer de code, of vraag je leerkracht om de <em>draagbare link</em> als je op een ander toestel werkt.
          </p>
          <Link to="/meedoen" className="btn btn-primary">Code opnieuw invoeren</Link>
        </div>
      </div>
    );
  }

  // key zorgt dat de volledige leerlingflow herstart bij een andere code
  return <WidgetRunner key={widget.id} widget={widget} recordSubmission />;
}

/**
 * Volledige leerlingflow rond een widget:
 * naam → instructies → spelen (met evt. tijdslimiet) → indienen/registreren.
 */
export function WidgetRunner({ widget, recordSubmission }: { widget: Widget; recordSubmission: boolean }) {
  const def = getTypeDef(widget.type);
  const needsName = recordSubmission && def.hasSubmissions && widget.settings.requireName;

  const [name, setName] = useState('');
  const [phase, setPhase] = useState<'gate' | 'playing'>(needsName || widget.settings.instructions ? 'gate' : 'playing');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);

  const start = () => {
    if (needsName && !name.trim()) return;
    if (recordSubmission && widget.settings.maxAttempts > 0 && def.hasSubmissions) {
      const attempts = getAttemptCount(widget.id, name || 'anoniem');
      if (attempts >= widget.settings.maxAttempts) {
        setBlocked(true);
        return;
      }
      bumpAttemptCount(widget.id, name || 'anoniem');
    }
    startRef.current = Date.now();
    if (widget.settings.timeLimitMin > 0) setTimeLeft(widget.settings.timeLimitMin * 60);
    setPhase('playing');
  };

  // aftellen
  useEffect(() => {
    if (phase !== 'playing' || timeLeft === null) return;
    if (timeLeft <= 0) { setTimeUp(true); return; }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  const onComplete = (result: PlayerResult) => {
    if (doneRef.current || !recordSubmission || !def.hasSubmissions) return;
    doneRef.current = true;
    const sub: Submission = {
      id: uid(),
      widgetId: widget.id,
      widgetCode: widget.code,
      studentName: name.trim() || 'Anoniem',
      startedAt: startRef.current,
      submittedAt: Date.now(),
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      answers: result.answers,
      itemScores: result.itemScores,
      totalEarned: result.earned,
      totalMax: result.max,
      status: result.hasPending ? 'submitted' : 'graded',
    };
    saveSubmission(sub);
  };

  const mm = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const ss = timeLeft !== null ? timeLeft % 60 : 0;

  return (
    <div className="player-shell" style={{ minHeight: '100vh', ['--player-accent' as any]: widget.settings.accentColor }}>
      <header className="player-topbar">
        <span aria-hidden style={{ fontSize: '1.3rem' }}>{def.icon}</span>
        <span className="title">{widget.title}</span>
        {phase === 'playing' && timeLeft !== null && (
          <span
            className={`badge ${timeLeft <= 60 ? 'badge-err' : timeLeft <= 180 ? 'badge-warn' : 'badge-brand'}`}
            style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.95rem' }}
            role="timer"
            aria-label={`Nog ${mm} minuten ${ss} seconden`}
          >
            ⏱ {mm}:{ss.toString().padStart(2, '0')}
          </span>
        )}
        {name && <span className="badge">👤 {name}</span>}
      </header>

      <div className="player-main">
        {blocked ? (
          <div className="card result-hero">
            <div style={{ fontSize: '3rem' }} aria-hidden>🚫</div>
            <h2>Maximaal aantal pogingen bereikt</h2>
            <p style={{ color: 'var(--text-soft)' }}>
              Je hebt deze opdracht al {widget.settings.maxAttempts}× gemaakt. Vraag je leerkracht om een extra kans.
            </p>
          </div>
        ) : phase === 'gate' ? (
          <div className="card card-pad" style={{ maxWidth: 480, margin: '40px auto 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2.6rem' }} aria-hidden>{def.icon}</div>
            <h1 style={{ fontSize: '1.5rem' }}>{widget.title}</h1>
            <p style={{ color: 'var(--text-soft)' }}>{def.name}</p>
            {widget.settings.instructions && (
              <div className="callout" style={{ textAlign: 'left' }}>
                <span aria-hidden>📋</span>
                <div>{widget.settings.instructions}</div>
              </div>
            )}
            {widget.settings.timeLimitMin > 0 && (
              <p className="badge badge-warn" style={{ marginBottom: 14 }}>
                ⏱ Je krijgt {widget.settings.timeLimitMin} minuten
              </p>
            )}
            {needsName && (
              <div className="field" style={{ textAlign: 'left' }}>
                <label htmlFor="student-name">Jouw naam</label>
                <input
                  id="student-name"
                  className="input"
                  value={name}
                  placeholder="Voornaam en familienaam"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') start(); }}
                  autoFocus
                />
              </div>
            )}
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={needsName && !name.trim()} onClick={start}>
              ▶ Starten
            </button>
          </div>
        ) : (
          <>
            {timeUp && (
              <div className="callout err" role="alert">
                <span aria-hidden>⏰</span>
                <div><strong>De tijd is om!</strong> Je antwoorden worden automatisch ingediend.</div>
              </div>
            )}
            <def.Player widget={widget} studentName={name.trim() || 'Anoniem'} timeUp={timeUp} onComplete={onComplete} />
          </>
        )}
      </div>
    </div>
  );
}
