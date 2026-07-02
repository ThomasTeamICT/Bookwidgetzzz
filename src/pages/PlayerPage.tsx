import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bumpAttemptCount, getAttemptCount, getWidgetByCode, markStarted, saveSubmission } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { Submission, Widget } from '../lib/types';
import type { PlayerResult } from '../widgets/shared';
import { uid } from '../lib/utils';
import { hasProgress } from '../lib/autosave';
import { encodeSubmission } from '../lib/share';
import { CopyButton } from '../components/ui';
import { A11yMenu, loadA11y } from '../components/A11yMenu';

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
 * naam → instructies → spelen (met evt. tijdslimiet/toetsmodus) → indienen.
 */
export function WidgetRunner({ widget, recordSubmission, offerResultCode }: { widget: Widget; recordSubmission: boolean; offerResultCode?: boolean }) {
  const def = getTypeDef(widget.type);
  const needsName = recordSubmission && def.hasSubmissions && widget.settings.requireName;

  const [name, setName] = useState('');
  const [phase, setPhase] = useState<'gate' | 'playing'>(needsName || widget.settings.instructions ? 'gate' : 'playing');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [completedSub, setCompletedSub] = useState<Submission | null>(null);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const focusLossRef = useRef(0);
  const [focusWarn, setFocusWarn] = useState(0);
  const [a11y, setA11y] = useState(loadA11y);

  const expired = !!widget.settings.expiresAt && Date.now() > new Date(widget.settings.expiresAt).getTime();

  const start = () => {
    if (needsName && !name.trim()) return;
    const studentKey = name || 'anoniem';
    const resuming = hasProgress(widget.id, studentKey);
    if (recordSubmission && widget.settings.maxAttempts > 0 && def.hasSubmissions && !resuming) {
      const attempts = getAttemptCount(widget.id, studentKey);
      if (attempts >= widget.settings.maxAttempts) {
        setBlocked(true);
        return;
      }
      bumpAttemptCount(widget.id, studentKey);
    }
    if (recordSubmission && def.hasSubmissions) markStarted(widget.id, name.trim() || 'Anoniem');
    if (widget.settings.examMode) {
      document.documentElement.requestFullscreen?.().catch(() => { /* volledig scherm is best-effort */ });
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

  // toetsmodus: registreren wanneer de leerling het venster verlaat
  useEffect(() => {
    if (!widget.settings.examMode || phase !== 'playing') return;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !doneRef.current) {
        focusLossRef.current += 1;
        setFocusWarn(focusLossRef.current);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase, widget.settings.examMode]);

  const onComplete = (result: PlayerResult) => {
    if (doneRef.current || !recordSubmission || !def.hasSubmissions) return;
    doneRef.current = true;
    if (widget.settings.examMode && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { /* negeren */ });
    }
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
      ...(widget.settings.examMode ? { focusLosses: focusLossRef.current } : {}),
    };
    saveSubmission(sub);
    setCompletedSub(sub);
  };

  const mm = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const ss = timeLeft !== null ? timeLeft % 60 : 0;

  return (
    <div
      className={`player-shell ${a11y.calm ? 'calm' : ''} ${a11y.spacing ? 'spaced' : ''}`}
      style={{
        minHeight: '100vh',
        fontSize: a11y.scale !== 1 ? `${a11y.scale}em` : undefined,
        ['--player-accent' as any]: widget.settings.accentColor,
      }}
    >
      <header className="player-topbar">
        <span aria-hidden style={{ fontSize: '1.3rem' }}>{def.icon}</span>
        <span className="title">{widget.title}</span>
        <A11yMenu value={a11y} onChange={setA11y} />
        {widget.settings.examMode && phase === 'playing' && (
          <span className="badge badge-warn" title="Toetsmodus actief">🛡 toets</span>
        )}
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

      <div className={`player-main ${def.wide ? 'player-main-wide' : ''}`}>
        {expired ? (
          <div className="card result-hero">
            <div style={{ fontSize: '3rem' }} aria-hidden>⌛</div>
            <h2>Deze opdracht is afgesloten</h2>
            <p style={{ color: 'var(--text-soft)' }}>
              De deadline is verstreken. Neem contact op met je leerkracht.
            </p>
          </div>
        ) : blocked ? (
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              {widget.settings.timeLimitMin > 0 && (
                <span className="badge badge-warn">⏱ {widget.settings.timeLimitMin} minuten</span>
              )}
              {widget.settings.examMode && (
                <span className="badge badge-warn" title="Volledig scherm; het verlaten van het venster wordt geregistreerd">
                  🛡 Toetsmodus
                </span>
              )}
            </div>
            {needsName && (
              <div className="field" style={{ textAlign: 'left' }}>
                <label htmlFor="student-name">Jouw naam</label>
                <input
                  id="student-name"
                  className="input"
                  value={name}
                  placeholder="Voornaam (of klasnummer)"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') start(); }}
                  autoFocus
                />
                <span className="hint">Een voornaam of klasnummer is genoeg.</span>
              </div>
            )}
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={needsName && !name.trim()} onClick={start}>
              ▶ Starten
            </button>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              🔒 Je antwoorden blijven op dit toestel en zijn alleen voor je leerkracht. Er wordt niets op internet bewaard.
            </p>
          </div>
        ) : (
          <>
            {timeUp && (
              <div className="callout err" role="alert">
                <span aria-hidden>⏰</span>
                <div><strong>De tijd is om!</strong> Je antwoorden worden automatisch ingediend.</div>
              </div>
            )}
            {widget.settings.examMode && focusWarn > 0 && !doneRef.current && (
              <div className="callout warn" role="alert">
                <span aria-hidden>👀</span>
                <div>Je verliet het toetsvenster ({focusWarn}×). Dit wordt bij je inzending vermeld.</div>
              </div>
            )}
            <def.Player widget={widget} studentName={name.trim() || 'Anoniem'} timeUp={timeUp} onComplete={onComplete} />
            {offerResultCode && completedSub && (
              <div className="card card-pad" style={{ marginTop: 18 }}>
                <h3>📮 Stuur je resultaat naar je leerkracht</h3>
                <p style={{ color: 'var(--text-soft)', fontSize: '0.92rem' }}>
                  Je werkte op je eigen toestel, dus je leerkracht ziet dit resultaat nog niet vanzelf.
                  Kopieer deze resultaatcode en bezorg ze via je gebruikelijke kanaal (bv. Smartschool of mail).
                  Je leerkracht plakt ze bij de resultaten.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input input-sm" readOnly value={encodeSubmission(completedSub)}
                    aria-label="Resultaatcode" onFocus={(e) => e.target.select()}
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                  <CopyButton text={encodeSubmission(completedSub)} label="Code kopiëren" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
