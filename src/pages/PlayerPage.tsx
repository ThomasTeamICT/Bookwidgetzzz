import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bumpAttemptCount, getAttemptCount, getWidgetByCode, markStarted, saveSubmission } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { Question, Submission, Widget } from '../lib/types';
import type { PlayerResult } from '../widgets/shared';
import { pct, uid } from '../lib/utils';
import { hasProgress } from '../lib/autosave';
import { encodeSubmission } from '../lib/share';
import { CopyButton } from '../components/ui';
import { A11yMenu, loadA11y } from '../components/A11yMenu';

/** Sleutel waaronder de deadline van één leerling bewaard wordt. */
function deadlineKey(widgetId: string, studentKey: string): string {
  return `wf.deadline.${widgetId}.${studentKey.toLowerCase()}`;
}

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
  // De gate is ook nodig zonder naamplicht: start() initialiseert timer,
  // pogingenteller, live-registratie en toetsmodus — die mogen niet worden
  // overgeslagen wanneer alleen requireName uit staat.
  const needsGate =
    needsName ||
    !!widget.settings.instructions ||
    widget.settings.timeLimitMin > 0 ||
    widget.settings.maxAttempts > 0 ||
    !!widget.settings.examMode ||
    (recordSubmission && def.hasSubmissions);
  const [phase, setPhase] = useState<'gate' | 'playing'>(needsGate ? 'gate' : 'playing');
  // Persoonlijk doel (optioneel, gekozen op het startscherm)
  const [doelProces, setDoelProces] = useState('');
  const [doelStreef, setDoelStreef] = useState(0);
  const [doelVrij, setDoelVrij] = useState('');
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
    if (widget.settings.timeLimitMin > 0) {
      // deadline overleeft herladen: hervatten geeft geen verse tijd
      let end = Date.now() + widget.settings.timeLimitMin * 60000;
      if (resuming) {
        const saved = parseInt(localStorage.getItem(deadlineKey(widget.id, studentKey)) ?? '', 10);
        if (!Number.isNaN(saved)) end = saved;
      }
      try { localStorage.setItem(deadlineKey(widget.id, studentKey), String(end)); } catch { /* best effort */ }
      setTimeLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    }
    setPhase('playing');
  };

  // aftellen (stopt zodra de leerling ingediend heeft)
  useEffect(() => {
    if (phase !== 'playing' || timeLeft === null || completedSub) return;
    if (timeLeft <= 0) { setTimeUp(true); return; }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, completedSub]);

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

  // Stabiele identiteit: anders krijgt de gememoiseerde speler hieronder bij elke
  // timertik een nieuwe prop en hertekent de hele oefening zich.
  const onComplete = useCallback((result: PlayerResult) => {
    if (doneRef.current || !recordSubmission || !def.hasSubmissions) return;
    // lege widget die door timeUp "afrondt" zonder enige inhoud: niets registreren
    if (result.max === 0 && Object.keys(result.answers).length === 0) return;
    doneRef.current = true;
    try { localStorage.removeItem(deadlineKey(widget.id, name || 'anoniem')); } catch { /* best effort */ }
    if (widget.settings.examMode && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { /* negeren */ });
    }
    // Persoonlijk doel (indien gekozen) bij de antwoorden bewaren
    const doel: PersoonlijkDoel = {
      ...(doelProces ? { proces: doelProces } : {}),
      ...(doelStreef > 0 ? { streef: doelStreef } : {}),
      ...(doelVrij.trim() ? { vrij: doelVrij.trim() } : {}),
    };
    const heeftDoel = Object.keys(doel).length > 0;
    const sub: Submission = {
      id: uid(),
      widgetId: widget.id,
      widgetCode: widget.code,
      studentName: name.trim() || 'Anoniem',
      startedAt: startRef.current,
      submittedAt: Date.now(),
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      answers: heeftDoel ? { ...result.answers, _doel: doel } : result.answers,
      itemScores: result.itemScores,
      totalEarned: result.earned,
      totalMax: result.max,
      status: result.hasPending ? 'submitted' : 'graded',
      ...(widget.settings.examMode ? { focusLosses: focusLossRef.current } : {}),
    };
    saveSubmission(sub);
    setCompletedSub(sub);
  }, [recordSubmission, def, widget, name, doelProces, doelStreef, doelVrij]);

  // De widgetmodule zelf is het duurste stuk van de pagina. Zolang de leerling
  // dezelfde opdracht speelt verandert er niets aan haar props, dus houden we
  // het element vast: een timertik, een toetsmodus-waarschuwing of een a11y-
  // instelling hertekent dan de balk eromheen, niet de hele oefening.
  const studentName = name.trim() || 'Anoniem';
  const playerNode = useMemo(
    () => <def.Player widget={widget} studentName={studentName} timeUp={timeUp} onComplete={onComplete} />,
    [def, widget, studentName, timeUp, onComplete]
  );

  // encodeSubmission comprimeert (lz-string) de volledige inzending; die stond
  // twee keer in de render van het resultaatveld hieronder.
  const resultCode = useMemo(
    () => (offerResultCode && completedSub ? encodeSubmission(completedSub) : ''),
    [offerResultCode, completedSub]
  );

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
            {recordSubmission && def.hasSubmissions && (
              <details className="card" style={{ textAlign: 'left', padding: '10px 14px', margin: '4px 0 14px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🎯 Kies je doel (optioneel)</summary>
                <p style={{ color: 'var(--text-soft)', fontSize: '0.88rem', margin: '10px 0 8px' }}>
                  Een doel kiezen helpt je gerichter te werken. Het telt niet mee voor punten;
                  na afloop kijk je er zelf even op terug.
                </p>
                <div
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
                  role="group"
                  aria-label="Kies een procesdoel"
                >
                  {PROCES_DOELEN.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`chip ${doelProces === d ? 'placed' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '0.83rem' }}
                      aria-pressed={doelProces === d}
                      onClick={() => setDoelProces((cur) => (cur === d ? '' : d))}
                    >
                      {doelProces === d ? '✓ ' : ''}{d}
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="doel-streef">Streefscore</label>
                  <select
                    id="doel-streef"
                    className="select"
                    value={doelStreef}
                    onChange={(e) => setDoelStreef(Number(e.target.value))}
                  >
                    <option value={0}>Geen streefscore</option>
                    <option value={50}>Minstens 50%</option>
                    <option value={70}>Minstens 70%</option>
                    <option value={90}>Minstens 90%</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="doel-vrij">Eigen doel (in je eigen woorden)</label>
                  <input
                    id="doel-vrij"
                    className="input"
                    value={doelVrij}
                    placeholder='bv. "Ik controleer mijn antwoord voor ik verderga."'
                    onChange={(e) => setDoelVrij(e.target.value)}
                  />
                </div>
              </details>
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
            {timeUp && !completedSub && (
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
            {/* de widgetmodule wordt lazy geladen (zie registry): even een laadmelding tonen */}
            <React.Suspense fallback={<div className="hint" role="status" style={{ textAlign: 'center', padding: '40px 0' }}>Widget laden…</div>}>
              {playerNode}
            </React.Suspense>
            {completedSub && widget.settings.showFeedback && (
              <FoutenAnalysePanel
                widget={widget}
                submission={completedSub}
                onSaved={(updated) => setCompletedSub(updated)}
              />
            )}
            {completedSub && (
              <DoelKaart
                submission={completedSub}
                showScore={widget.settings.showScore}
                onSaved={(updated) => setCompletedSub(updated)}
              />
            )}
            {offerResultCode && completedSub && (
              <div className="card card-pad" style={{ marginTop: 18 }}>
                <h3>📮 Stuur je resultaat naar je leerkracht</h3>
                {/* resultaatcode bevat ook de foutenanalyse als die vóór het kopiëren is ingevuld */}
                <p style={{ color: 'var(--text-soft)', fontSize: '0.92rem' }}>
                  Je werkte op je eigen toestel, dus je leerkracht ziet dit resultaat nog niet vanzelf.
                  Kopieer deze resultaatcode en bezorg ze via je gebruikelijke kanaal (bv. Smartschool of mail).
                  Je leerkracht plakt ze bij de resultaten.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input input-sm" readOnly value={resultCode}
                    aria-label="Resultaatcode" onFocus={(e) => e.target.select()}
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                  <CopyButton text={resultCode} label="Code kopiëren" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const FOUT_LABELS = [
  { key: 'slordig', label: '🙈 Slordigheidsfout' },
  { key: 'gelezen', label: '👓 Vraag verkeerd gelezen' },
  { key: 'kennis', label: '📖 Stof nog niet gekend' },
  { key: 'aanpak', label: '🧭 Aanpak niet gekend' },
] as const;

/**
 * Foutenanalyse door de leerling zelf ("exam wrapper"): fouten labelen en één
 * voornemen noteren. Wordt bij de inzending bewaard zodat de leerkracht het ziet.
 */
function FoutenAnalysePanel({
  widget, submission, onSaved,
}: { widget: Widget; submission: Submission; onSaved: (s: Submission) => void }) {
  const questions = (widget.config as { questions?: Question[] }).questions;
  // Zonder memo wordt deze lijst bij elke toetsaanslag in het invulveld hieronder
  // opnieuw doorlopen.
  const wrong = useMemo(
    () => (questions ?? []).filter((q) => {
      if (q.type === 'info') return false;
      const s = submission.itemScores?.[q.id];
      return !!s && s.mode !== 'pending' && s.earned < s.max;
    }),
    [questions, submission.itemScores]
  );
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [nextTime, setNextTime] = useState('');
  const [saved, setSaved] = useState(!!(submission.answers as Record<string, unknown>)['_foutenanalyse']);

  if (!questions || wrong.length === 0 || saved) {
    return saved && wrong.length > 0 ? (
      <div className="callout" role="status" style={{ marginTop: 18 }}>
        <span aria-hidden>🧠</span>
        <div>Je foutenanalyse is bewaard — sterk dat je naar je eigen fouten keek!</div>
      </div>
    ) : null;
  }


  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <h3>🧠 Kijk even terug op je fouten</h3>
      <p style={{ color: 'var(--text-soft)', fontSize: '0.92rem' }}>
        Wat voor soort fout was het? Dit telt niet mee voor punten — het helpt jou (en je leerkracht) om te zien wat je volgende stap is.
      </p>
      {wrong.map((q) => (
        <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
            {/* geen vraagnummer: bij schudden/vragenpool wijkt de confignummering af van wat de leerling zag */}
            {q.prompt ? q.prompt.slice(0, 110) : '(invuloefening)'}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Soort fout">
            {FOUT_LABELS.map((f) => (
              <button
                key={f.key}
                className={`chip ${labels[q.id] === f.key ? 'placed' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.83rem' }}
                aria-pressed={labels[q.id] === f.key}
                onClick={() => setLabels((m) => ({ ...m, [q.id]: f.key }))}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="fa-next">Wat doe je de volgende keer anders? (één zin)</label>
        <input
          id="fa-next" className="input" value={nextTime}
          placeholder='bv. "Ik lees elke vraag twee keer voor ik antwoord."'
          onChange={(e) => setNextTime(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary"
        disabled={Object.keys(labels).length === 0 && !nextTime.trim()}
        onClick={() => {
          const updated: Submission = {
            ...submission,
            answers: {
              ...submission.answers,
              _foutenanalyse: { labels, volgendeKeer: nextTime.trim() },
            },
          };
          saveSubmission(updated);
          onSaved(updated);
          setSaved(true);
        }}
      >
        Bewaren ✓
      </button>
    </div>
  );
}

// ── Persoonlijk doel ─────────────────────────────────────────────────────────

/** Vorm van answers._doel; lokaal gedefinieerd (geen wijziging aan types.ts). */
interface PersoonlijkDoel {
  proces?: string;
  streef?: number;
  vrij?: string;
}

const PROCES_DOELEN = [
  'Ik lees elke vraag twee keer',
  'Ik probeer het eerst zonder hint',
  'Ik werk rustig, zonder haast',
];

/**
 * Kaart die na afloop het persoonlijke doel naast het resultaat legt, met één
 * korte reflectievraag. Volgt het patroon van FoutenAnalysePanel: de reflectie
 * wordt bij de inzending bewaard (answers._doelreflectie) via saveSubmission.
 */
function DoelKaart({
  submission, onSaved, showScore,
}: { submission: Submission; onSaved: (s: Submission) => void; showScore: boolean }) {
  const answers = submission.answers as Record<string, unknown>;
  const doel = answers['_doel'] as PersoonlijkDoel | undefined;
  const [reflectie, setReflectie] = useState('');
  const [saved, setSaved] = useState(!!answers['_doelreflectie']);

  if (!doel || (!doel.proces && doel.streef === undefined && !doel.vrij)) return null;

  // respecteer de instelling "score verbergen": dan geen percentages tonen
  const procent = showScore && submission.totalMax > 0 ? pct(submission.totalEarned, submission.totalMax) : null;
  const behaald = doel.streef !== undefined && procent !== null ? procent >= doel.streef : null;

  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <h3>🎯 Jouw doel</h3>
      {doel.streef !== undefined && (
        procent !== null ? (
          <p style={{ margin: '6px 0' }}>
            Je doel: <strong>{doel.streef}%</strong> — behaald: <strong>{procent}%</strong>{' '}
            {behaald
              ? <span className="badge badge-ok">✔ behaald</span>
              : <span className="badge badge-warn">✗ nog niet — elke poging telt</span>}
          </p>
        ) : (
          <p style={{ margin: '6px 0' }}>
            Je streefdoel was <strong>{doel.streef}%</strong>, maar deze opdracht krijgt (nog) geen score.
            Kijk daarom vooral terug op je aanpak.
          </p>
        )
      )}
      {(doel.proces || doel.vrij) && (
        <p style={{ margin: '6px 0' }}>
          Je nam je voor: <em>“{[doel.proces, doel.vrij].filter(Boolean).join('” en “')}”</em>
          {' '}— gelukt? Wat hielp?
        </p>
      )}
      {saved ? (
        <div className="callout" role="status" style={{ marginTop: 8 }}>
          <span aria-hidden>💬</span>
          <div>Je reflectie is bewaard bij je resultaat — knap dat je terugkeek op je doel!</div>
        </div>
      ) : (
        <>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="doel-reflectie">Korte reflectie (één zin is genoeg)</label>
            <input
              id="doel-reflectie"
              className="input"
              value={reflectie}
              placeholder='bv. "Rustig lezen hielp; volgende keer mik ik op 80%."'
              onChange={(e) => setReflectie(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!reflectie.trim()}
            onClick={() => {
              const updated: Submission = {
                ...submission,
                answers: { ...submission.answers, _doelreflectie: reflectie.trim() },
              };
              saveSubmission(updated);
              onSaved(updated);
              setSaved(true);
            }}
          >
            Bewaren ✓
          </button>
        </>
      )}
      <p style={{ margin: '12px 0 0' }}>
        <Link to="/voortgang">📈 Bekijk je voortgang op dit toestel</Link>
      </p>
    </div>
  );
}
