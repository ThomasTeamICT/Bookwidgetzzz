import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Course, CourseProgress } from '../lib/courseTypes';
import { allSections, progressPercent } from '../lib/courseTypes';
import {
  adoptSharedCourse, decodeCourseFromParam, encodeCourseProgress,
  getCourseByCode, saveStudentProgress, startProgress, touchSection,
} from '../lib/courses';
import { BlockRenderer } from '../components/course/BlockRenderer';
import { CopyButton, EmptyState } from '../components/ui';
import { A11yMenu, loadA11y } from '../components/A11yMenu';

// ── /cursus/open?d=… — gedeelde link openen ─────────────────────────────────

export function CourseOpenPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const d = params.get('d');
    const decoded = d ? decodeCourseFromParam(d) : null;
    if (!decoded) {
      setInvalid(true);
      return;
    }
    // Cursus + meegereisde widgets lokaal opslaan en doorsturen naar de lezer
    adoptSharedCourse(decoded.course, decoded.widgets);
    navigate('/cursus/lees/' + decoded.course.code, { replace: true });
  }, [params, navigate]);

  return (
    <div className="player-shell" style={{ minHeight: '100vh' }}>
      <div className="player-main" style={{ maxWidth: 560 }}>
        {invalid ? (
          <EmptyState icon="⚠️" title="Deze cursuslink werkt niet">
            <p>
              De link is onvolledig of beschadigd (misschien is hij afgebroken bij het kopiëren).
              Vraag je leerkracht om een nieuwe deellink.
            </p>
            <Link to="/" className="btn btn-primary">Naar de startpagina</Link>
          </EmptyState>
        ) : (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: '3rem' }} aria-hidden>📖</div>
            <p style={{ color: 'var(--text-soft)' }}>Cursus wordt geopend…</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── /cursus/lees/:code — leerling-viewer ────────────────────────────────────

export function CourseViewerPage() {
  const { code } = useParams();
  const course = useMemo(() => (code ? getCourseByCode(code) : undefined), [code]);

  if (!course) return <CourseNotFound code={code} />;
  // key: bij een andere cursuscode volledig opnieuw beginnen
  return <CourseReader key={course.id} course={course} />;
}

function CourseNotFound({ code }: { code?: string }) {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  const open = () => {
    if (draft.trim()) navigate('/cursus/lees/' + draft.trim().toUpperCase());
  };
  return (
    <div className="player-shell" style={{ minHeight: '100vh' }}>
      <div className="player-main" style={{ maxWidth: 560 }}>
        <EmptyState icon="🔎" title="Cursus niet gevonden">
          <p>
            Er staat geen cursus met code{' '}
            <strong style={{ fontFamily: 'monospace' }}>{code}</strong> op dit toestel.<br />
            Controleer de code, of vraag je leerkracht om de <em>deellink</em> — daarmee reist de
            cursus (met oefeningen) automatisch mee.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <input
              className="input"
              style={{ maxWidth: 180, textTransform: 'uppercase', fontFamily: 'monospace' }}
              value={draft}
              placeholder="bv. K7P2QD"
              aria-label="Cursuscode"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
            />
            <button className="btn btn-primary" disabled={!draft.trim()} onClick={open}>Openen</button>
          </div>
        </EmptyState>
      </div>
    </div>
  );
}

// ── De eigenlijke lezer ─────────────────────────────────────────────────────

const NAME_KEY_PREFIX = 'wf.coursename.';

function useIsNarrow(px = 920): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${px}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [px]);
  return narrow;
}

function CourseReader({ course }: { course: Course }) {
  const flat = useMemo(() => allSections(course), [course]);
  const nameKey = NAME_KEY_PREFIX + course.id;

  const [name, setName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [a11y, setA11y] = useState(loadA11y);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const progressRef = useRef<CourseProgress | null>(null);
  const sectionIdRef = useRef<string | null>(null);
  sectionIdRef.current = sectionId;
  const lastSaveRef = useRef(Date.now());
  const narrow = useIsNarrow();

  const begin = (studentName: string) => {
    const n = studentName.trim() || 'Anoniem';
    try { localStorage.setItem(nameKey, n); } catch { /* best effort */ }
    const p = startProgress(course, n);
    progressRef.current = p;
    // Verder lezen waar je was — anders bij de eerste sectie beginnen
    const startId =
      p.lastSectionId && flat.some((x) => x.section.id === p.lastSectionId)
        ? p.lastSectionId
        : flat[0]?.section.id ?? null;
    if (startId) {
      touchSection(p, startId);
      p.lastSectionId = startId;
    }
    saveStudentProgress(p);
    lastSaveRef.current = Date.now();
    setName(n);
    setSectionId(startId);
  };

  // Automatisch starten: naam al bekend van vorige keer, of geen naam vereist
  useEffect(() => {
    if (progressRef.current) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(nameKey); } catch { /* geen opslag */ }
    if (stored && stored.trim()) begin(stored);
    else if (!course.settings.requireName) begin('Anoniem');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kijktijd bijhouden: elke 5 s optellen zolang het tabblad zichtbaar is,
  // throttled bewaren (elke 15 s en bij sectiewissel/unmount).
  useEffect(() => {
    if (!sectionId) return;
    const iv = setInterval(() => {
      const p = progressRef.current;
      const sid = sectionIdRef.current;
      if (!p || !sid || document.visibilityState !== 'visible') return;
      touchSection(p, sid).secondsSpent += 5;
      if (Date.now() - lastSaveRef.current >= 15000) {
        lastSaveRef.current = Date.now();
        saveStudentProgress(p);
      }
    }, 5000);
    return () => {
      clearInterval(iv);
      const p = progressRef.current;
      if (p) {
        lastSaveRef.current = Date.now();
        saveStudentProgress(p);
      }
    };
  }, [sectionId]);

  const goTo = (id: string) => {
    const p = progressRef.current;
    if (!p) return;
    touchSection(p, id);
    p.lastSectionId = id;
    saveStudentProgress(p);
    lastSaveRef.current = Date.now();
    setSectionId(id);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  const toggleCheck = (blockId: string, itemId: string) => {
    const p = progressRef.current;
    if (!p || !sectionId) return;
    const sp = touchSection(p, sectionId);
    const checks = { ...(sp.checks ?? {}) };
    const cur = checks[blockId] ?? [];
    checks[blockId] = cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId];
    sp.checks = checks;
    saveStudentProgress(p);
    lastSaveRef.current = Date.now();
    bump();
  };

  const markRead = () => {
    const p = progressRef.current;
    if (!p || !sectionId) return;
    touchSection(p, sectionId).completedAt = Date.now();
    saveStudentProgress(p);
    lastSaveRef.current = Date.now();
    bump();
  };

  const progress = progressRef.current;
  const accent = course.settings.accentColor;
  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    fontSize: a11y.scale !== 1 ? `${a11y.scale}em` : undefined,
    ['--player-accent' as string]: accent,
  } as React.CSSProperties;
  const shellClass = `player-shell ${a11y.calm ? 'calm' : ''} ${a11y.spacing ? 'spaced' : ''}`;

  // ── Naampoort ─────────────────────────────────────────────────────────────
  if (!progress || !name) {
    return (
      <div className={shellClass} style={shellStyle}>
        <div className="player-main" style={{ maxWidth: 520 }}>
          <div className="card card-pad" style={{ maxWidth: 480, margin: '40px auto 0', textAlign: 'center' }}>
            <div style={{ fontSize: '3.4rem' }} aria-hidden>{course.coverEmoji}</div>
            <h1 style={{ fontSize: '1.6rem', margin: '6px 0 2px' }}>{course.title}</h1>
            {course.subtitle && <p style={{ color: 'var(--text-soft)', margin: '0 0 4px' }}>{course.subtitle}</p>}
            {course.author && <p className="hint" style={{ margin: '0 0 14px' }}>door {course.author}</p>}
            <div className="field" style={{ textAlign: 'left' }}>
              <label htmlFor="course-student-name">Jouw naam</label>
              <input
                id="course-student-name"
                className="input"
                value={draftName}
                placeholder="Voornaam (volstaat)"
                autoFocus
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && draftName.trim()) begin(draftName); }}
              />
              <span className="hint">Zo kan je later verderlezen waar je gebleven was.</span>
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={!draftName.trim()}
              onClick={() => begin(draftName)}
            >
              📖 Start met lezen
            </button>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              🔒 Je voortgang blijft op dit toestel en is alleen voor jou en je leerkracht.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cur = flat.find((x) => x.section.id === sectionId);
  const idx = flat.findIndex((x) => x.section.id === sectionId);
  const prev = idx > 0 ? flat[idx - 1] : undefined;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : undefined;
  const isLast = idx === flat.length - 1;
  const pctDone = progressPercent(course, progress);
  const progressCode = encodeCourseProgress(progress);

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, height: '100%' }}>
      <div>
        <strong style={{ display: 'block', lineHeight: 1.35 }}>
          <span aria-hidden>{course.coverEmoji}</span> {course.title}
        </strong>
        {course.settings.showProgressToStudent && (
          <>
            <div
              className="progressbar"
              role="progressbar"
              aria-valuenow={pctDone}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Jouw voortgang in deze cursus"
              style={{ marginTop: 10 }}
            >
              <div style={{ width: `${pctDone}%` }} />
            </div>
            <span className="hint">{pctDone}% afgewerkt</span>
          </>
        )}
      </div>

      <nav aria-label="Inhoudstafel" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {course.chapters.map((ch) => (
          <div key={ch.id} style={{ marginBottom: 14 }}>
            <p
              style={{
                margin: '0 0 4px', fontWeight: 800, fontSize: '0.8rem',
                letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-soft)',
              }}
            >
              {ch.emoji && <span aria-hidden>{ch.emoji} </span>}{ch.title}
            </p>
            {ch.sections.map((s) => {
              const sp = progress.sections[s.id];
              const status = sp?.completedAt ? 'afgewerkt' : sp ? 'geopend' : 'nog niet gelezen';
              const icon = sp?.completedAt ? '✅' : sp ? '◐' : '○';
              const active = s.id === sectionId;
              return (
                <button
                  key={s.id}
                  onClick={() => goTo(s.id)}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${s.title} — ${status}`}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%',
                    textAlign: 'left', padding: '7px 10px', marginBottom: 2,
                    border: 'none', borderRadius: 'var(--radius-s)', cursor: 'pointer',
                    font: 'inherit', fontSize: '0.92rem',
                    background: active ? 'var(--brand-soft)' : 'transparent',
                    color: active ? 'var(--brand)' : 'var(--text)',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span aria-hidden style={{ flex: 'none' }}>{icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {s.title}
                    {s.optional && (
                      <span style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}> · keuze</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <A11yMenu value={a11y} onChange={setA11y} />
      </div>
      <div className="card" style={{ padding: '12px 14px', flex: 'none' }}>
        <strong style={{ fontSize: '0.9rem' }}>📨 Voortgangscode</strong>
        <p className="hint" style={{ margin: '4px 0 8px' }}>
          Werk je op je eigen toestel? Bezorg deze code aan je leerkracht om je voortgang door te geven.
        </p>
        <CopyButton text={progressCode} label="Code kopiëren" />
      </div>
    </div>
  );

  return (
    <div className={shellClass} style={shellStyle}>
      <header className="player-topbar">
        {narrow && (
          <button
            className="btn btn-quiet btn-icon"
            aria-label={navOpen ? 'Inhoudstafel verbergen' : 'Inhoudstafel tonen'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
        )}
        <span aria-hidden style={{ fontSize: '1.3rem' }}>{course.coverEmoji}</span>
        <span className="title">{course.title}</span>
        {course.settings.showProgressToStudent && (
          <span className="badge badge-brand" aria-label={`Voortgang: ${pctDone} procent`}>{pctDone}%</span>
        )}
        <span className="badge">👤 {name}</span>
      </header>

      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch', minHeight: 0 }}>
        {/* Inhoudstafel: vast paneel op breed scherm, uitklapbaar op mobiel */}
        {narrow ? (
          navOpen && (
            <>
              <div
                onClick={() => setNavOpen(false)}
                aria-hidden
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
              />
              <aside
                aria-label="Inhoudstafel en instellingen"
                style={{
                  position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(320px, 85vw)',
                  zIndex: 51, overflowY: 'auto', background: 'var(--bg-raised)',
                  borderRight: '1px solid var(--line)', boxShadow: 'var(--shadow-3)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                  <button className="btn btn-quiet btn-icon" aria-label="Inhoudstafel sluiten" onClick={() => setNavOpen(false)}>✕</button>
                </div>
                {sidebar}
              </aside>
            </>
          )
        ) : (
          <aside
            aria-label="Inhoudstafel en instellingen"
            style={{
              width: 300, flex: 'none', borderRight: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--bg-raised) 65%, transparent)',
              position: 'sticky', top: 53, alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 53px)', overflowY: 'auto',
            }}
          >
            {sidebar}
          </aside>
        )}

        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 90px', lineHeight: 1.7 }}>
            {!cur ? (
              <EmptyState icon="📭" title="Deze cursus heeft nog geen inhoud">
                <p>Vraag je leerkracht om de cursus aan te vullen.</p>
              </EmptyState>
            ) : (
              <>
                <nav aria-label="Kruimelpad" style={{ color: 'var(--text-soft)', fontSize: '0.88rem', marginBottom: 4 }}>
                  {cur.chapter.emoji && <span aria-hidden>{cur.chapter.emoji} </span>}
                  {cur.chapter.title} <span aria-hidden>›</span> {cur.section.title}
                </nav>
                <h1 style={{ fontSize: '1.7rem', margin: '0 0 6px', lineHeight: 1.25 }}>
                  {cur.section.title}
                  {cur.section.optional && (
                    <span className="badge badge-brand" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                      ✦ verdieping (keuze)
                    </span>
                  )}
                </h1>

                {(cur.section.goals?.length ?? 0) > 0 && (
                  <div className="callout" role="note" style={{ marginTop: 14 }}>
                    <span aria-hidden>🎯</span>
                    <div>
                      <strong>Wat leer je hier?</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
                        {cur.section.goals!.map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 18 }}>
                  {cur.section.blocks.map((block) => (
                    <BlockRenderer
                      key={block.id}
                      block={block}
                      interactive
                      studentName={name}
                      accent={accent}
                      checkedIds={progress.sections[cur.section.id]?.checks?.[block.id] ?? []}
                      onToggleCheck={(itemId) => toggleCheck(block.id, itemId)}
                    />
                  ))}
                  {cur.section.blocks.length === 0 && (
                    <p className="hint">Deze sectie is nog leeg.</p>
                  )}
                </div>

                {/* Sectie afronden + navigatie */}
                <div style={{ textAlign: 'center', marginTop: 30 }}>
                  {progress.sections[cur.section.id]?.completedAt ? (
                    <span className="badge badge-ok" style={{ fontSize: '0.95rem', padding: '8px 16px' }}>
                      ✔ Gelezen — je mag altijd nog eens nalezen
                    </span>
                  ) : (
                    <button className="btn btn-primary" onClick={markRead}>✔ Markeer als gelezen</button>
                  )}
                </div>
                <div className="player-nav">
                  {prev ? (
                    <button
                      className="btn btn-ghost"
                      onClick={() => goTo(prev.section.id)}
                      style={{ maxWidth: '48%' }}
                    >
                      ← {prev.section.title}
                    </button>
                  ) : <span />}
                  {next ? (
                    <button
                      className="btn btn-ghost"
                      onClick={() => goTo(next.section.id)}
                      style={{ maxWidth: '48%' }}
                    >
                      {next.section.title} →
                    </button>
                  ) : <span />}
                </div>

                {isLast && (
                  <div className="card" style={{ marginTop: 30, padding: '30px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.8rem' }} aria-hidden>🎉</div>
                    <h2 style={{ margin: '6px 0' }}>Cursus afgewerkt?</h2>
                    <p style={{ color: 'var(--text-soft)', margin: '0 0 12px' }}>
                      Je hebt <strong>{pctDone}%</strong> van de cursus afgewerkt.
                      {pctDone < 100 && ' Kijk in de inhoudstafel welke secties nog open staan.'}
                    </p>
                    <div className="progressbar" aria-hidden style={{ maxWidth: 320, margin: '0 auto 16px' }}>
                      <div style={{ width: `${pctDone}%` }} />
                    </div>
                    <p className="hint" style={{ margin: '0 0 8px' }}>
                      Werk je op je eigen toestel? Bezorg je leerkracht je voortgangscode.
                    </p>
                    <CopyButton text={progressCode} label="Voortgangscode kopiëren" />
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
