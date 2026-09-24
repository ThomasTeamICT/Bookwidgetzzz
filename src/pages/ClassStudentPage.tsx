import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar, Clock, CloudSun, ClipboardList, Package, Play, Puzzle, Send, TrendingUp, User,
} from 'lucide-react';
import type { Assignment, ClassGroup, ClassStudent, StudentContext } from '../lib/classTypes';
import type { Submission } from '../lib/types';
import {
  clearStudentContext, dueBadge, getStudentContext, handedOverKeys, loadClassContext, markHandedOver,
  matchesStudent, setStudentContext, sortedStudents, statusForAssignment, type ClassDataContext,
} from '../lib/classes';
import { findStudentClass } from '../lib/classPack';
import { encodeCourseProgress, getCourse, getStudentProgress } from '../lib/courses';
import { encodeSubmission } from '../lib/share';
import { getSubmissions, getWidget, onStorageChange } from '../lib/storage';
import { formatDate, formatDateShort } from '../lib/utils';
import { CodeQr } from '../components/CodeQr';
import { BrandMark } from '../components/Brand';
import { A11yMenu, loadA11y } from '../components/A11yMenu';
import { EmptyState, useToast } from '../components/ui';
import { CheckIcon, CopyIcon, CourseIcon, PrivacyIcon, QrIcon, SearchIcon } from '../components/icons';
import '../styles/leerling.css';

/**
 * /leerling/:classCode — de hub van de leerling.
 *
 * Mobiel eerst (dit staat op een gsm van 400 px in de bus naar huis), zonder
 * leerkrachtnavigatie. Drie dingen, in deze volgorde:
 *   1. wie ben jij? (naam uit de klaslijst → vaste identiteit)
 *   2. wat moet je doen? (opdrachten met status en deadline)
 *   3. wat moet je nog doorgeven? (codes als QR om te tonen of te kopiëren)
 */
export function ClassStudentPage() {
  const { classCode } = useParams();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [a11y, setA11y] = useState(loadA11y);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  // tick is een bewuste herlees-trigger (opslag gewijzigd), geen afhankelijkheid
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => (classCode ? findStudentClass(classCode) : null), [classCode, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => loadClassContext(view?.assignments ?? []), [view, tick]);
  const [context, setContext] = useState<StudentContext | null>(() => getStudentContext());

  // Een bewaarde identiteit geldt alleen binnen deze klas.
  const student: ClassStudent | null = useMemo(() => {
    if (!view || !context) return null;
    if (context.classCode.toUpperCase() !== view.cls.code.toUpperCase()) return null;
    const known = view.cls.students.find((s) => s.id === context.studentId);
    return known ?? { id: context.studentId, name: context.studentName };
  }, [view, context]);

  if (!view) {
    return (
      <div className="player-shell" style={{ minHeight: '100vh' }}>
        <main id="main" className="player-main" style={{ maxWidth: 520 }}>
          <h1 className="sr-only">Klas niet gevonden</h1>
          <EmptyState icon={<SearchIcon size={40} />} title="Klas niet gevonden">
            <p>
              Er staat geen klas met code{' '}
              <strong style={{ fontFamily: 'monospace' }}>{classCode}</strong> op dit toestel.
              Open eerst de <strong>klaslink</strong> of het <strong>klaspakket</strong> van je
              leerkracht — daarmee komt je klas op dit toestel.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/klas/open" className="btn btn-primary"><Package size={16} aria-hidden /> Klaspakket openen</Link>
              <Link to="/meedoen" className="btn btn-ghost">Code invoeren</Link>
            </div>
          </EmptyState>
        </main>
      </div>
    );
  }

  const cls = view.cls;

  const kies = (name: string, id: string) => {
    const ctxNew: StudentContext = {
      classId: cls.id,
      classCode: cls.code,
      className: cls.name,
      studentId: id,
      studentName: name,
    };
    setStudentContext(ctxNew);
    setContext(ctxNew);
  };

  const wissel = () => {
    clearStudentContext();
    setContext(null);
  };

  return (
    <div
      className={`player-shell ${a11y.calm ? 'calm' : ''} ${a11y.spacing ? 'spaced' : ''}`}
      style={{ minHeight: '100vh', fontSize: a11y.scale !== 1 ? `${a11y.scale}em` : undefined }}
    >
      <header className="player-topbar">
        <div className="player-topbar-row1">
          {student && <span className="player-chip"><User size={12} aria-hidden /> {student.name}</span>}
          <span className="sp" />
          <A11yMenu value={a11y} onChange={setA11y} />
        </div>
        <div className="player-topbar-row2">
          <BrandMark size={26} />
          <span className="title">{cls.name}</span>
        </div>
      </header>

      <main id="main" className="player-main" style={{ maxWidth: 640 }}>
        {!student ? (
          <NamePicker cls={cls} onPick={kies} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.4rem', margin: '4px 0' }}>Dag {student.name.split(' ')[0]}!</h1>
              <button className="btn btn-sm btn-quiet" onClick={wissel}>Niet jij? Wissel.</button>
            </div>

            <AssignmentList
              assignments={view.assignments}
              student={student}
              ctx={ctx}
              onOpen={(path) => navigate(path)}
            />

            <HandInSection cls={cls} student={student} assignments={view.assignments} ctx={ctx} />

            <div className="card card-pad" style={{ marginTop: 18 }}>
              <h2 style={{ fontSize: '1rem', marginTop: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Package size={17} aria-hidden /> Op een ander toestel werken?
              </h2>
              <p className="hint" style={{ marginTop: 0 }}>
                Open daar de klaslink of het klaspakket van je leerkracht. Daarna staan je
                opdrachten ook op dat toestel — je werk blijft altijd op het toestel waar je het maakte.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/klas/open" className="btn btn-sm btn-ghost"><Package size={14} aria-hidden /> Pakket of klaslink openen</Link>
                <Link to="/voortgang" className="btn btn-sm btn-ghost"><TrendingUp size={14} aria-hidden /> Mijn voortgang</Link>
              </div>
            </div>

            <p className="hint" style={{ marginTop: 18, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <PrivacyIcon size={13} aria-hidden style={{ marginTop: 2, flex: 'none' }} />
              Je antwoorden blijven op dit toestel. Je leerkracht ziet ze pas als je je code
              doorgeeft (of als je op zijn toestel werkte).
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ── Wie ben jij? ────────────────────────────────────────────────────────────

function NamePicker({ cls, onPick }: { cls: ClassGroup; onPick: (name: string, id: string) => void }) {
  const [query, setQuery] = useState('');
  const [free, setFree] = useState('');
  const [showFree, setShowFree] = useState(false);
  const students = useMemo(() => sortedStudents(cls.students), [cls.students]);
  const q = query.trim().toLocaleLowerCase('nl');
  const shown = q ? students.filter((s) => s.name.toLocaleLowerCase('nl').includes(q)) : students;

  return (
    <div className="card card-pad">
      <h1 style={{ fontSize: '1.3rem', marginTop: 0 }}>Wie ben jij?</h1>
      <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>
        Kies je naam uit de lijst van <strong>{cls.name}</strong>. Zo komt je werk altijd bij de
        juiste persoon terecht — ook als je op een ander toestel werkt.
      </p>

      {students.length > 6 && (
        <div className="field">
          <label htmlFor="zoek-naam">Zoek je naam</label>
          <input
            id="zoek-naam"
            type="search"
            className="input"
            value={query}
            placeholder="Typ de eerste letters…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {students.length === 0 ? (
        <p className="hint">Deze klas heeft nog geen namenlijst. Vul hieronder je naam in.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {shown.map((s) => (
            <button
              key={s.id}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', minHeight: 46, fontSize: '1rem' }}
              onClick={() => onPick(s.name, s.id)}
            >
              {s.number !== undefined && <span className="hint" style={{ marginRight: 8 }}>{s.number}</span>}
              {s.name}
            </button>
          ))}
          {shown.length === 0 && <p className="hint">Geen naam gevonden met “{query}”.</p>}
        </div>
      )}

      {showFree || students.length === 0 ? (
        <div className="field">
          <label htmlFor="vrije-naam">Mijn naam</label>
          <input
            id="vrije-naam"
            className="input"
            value={free}
            placeholder="Voornaam en naam"
            onChange={(e) => setFree(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && free.trim()) onPick(free.trim(), ''); }}
          />
          <span className="hint">
            Je leerkracht kan je werk dan op naam herkennen. Staat je naam er later toch bij? Kies
            hem dan alsnog — dat werkt beter.
          </span>
          <button
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            disabled={!free.trim()}
            onClick={() => onPick(free.trim(), '')}
          >
            Verder →
          </button>
        </div>
      ) : (
        <button className="btn btn-quiet btn-sm leerling-tap-target" onClick={() => setShowFree(true)}>
          Ik sta er niet bij
        </button>
      )}
    </div>
  );
}

// ── Opdrachten ──────────────────────────────────────────────────────────────

function AssignmentList({
  assignments, student, ctx, onOpen,
}: {
  assignments: Assignment[];
  student: ClassStudent;
  ctx: ClassDataContext;
  onOpen: (path: string) => void;
}) {
  if (assignments.length === 0) {
    return (
      <EmptyState icon={<CloudSun size={40} />} title="Nog geen opdrachten">
        <p>Je leerkracht heeft nog niets klaargezet voor deze klas. Kijk later nog eens.</p>
      </EmptyState>
    );
  }

  return (
    <section aria-label="Mijn opdrachten" style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <h2 style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
        <ClipboardList size={19} aria-hidden /> Mijn opdrachten
      </h2>
      {assignments.map((a) => {
        const status = statusForAssignment(a, student, ctx);
        const due = dueBadge(a.dueAt);
        const course = a.kind === 'course' ? ctx.courses.get(a.targetId) ?? getCourse(a.targetId) : undefined;
        const widget = a.kind === 'widget' ? ctx.widgets.get(a.targetId) ?? getWidget(a.targetId) : undefined;
        const title = course?.title ?? widget?.title ?? 'Opdracht';
        const path = course ? `/cursus/lees/${course.code}` : widget ? `/speel/${widget.code}` : '';
        const label =
          status.state === 'ingediend'
            ? a.kind === 'course' ? <><CheckIcon size={15} aria-hidden /> Nalezen</> : <><Play size={15} aria-hidden /> Opnieuw maken</>
            : status.state === 'bezig'
              ? <><Play size={15} aria-hidden /> Verder doen</>
              : <><Play size={15} aria-hidden /> Starten</>;

        return (
          <article key={a.id} className="card card-pad" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              {a.kind === 'course'
                ? <CourseIcon size={19} aria-hidden style={{ color: 'var(--text-soft)' }} />
                : <Puzzle size={19} aria-hidden style={{ color: 'var(--text-soft)' }} />}
              <h3 style={{ margin: 0, fontSize: '1.05rem', flex: '1 1 auto' }}>{title}</h3>
              {due && (
                <span className={`badge badge-${due.tone}`}>
                  {due.overdue ? <Clock size={13} aria-hidden /> : <Calendar size={13} aria-hidden />} {due.label}
                  <span className="sr-only"> (deadline {formatDateShort(a.dueAt!)})</span>
                </span>
              )}
            </div>
            {a.note && <p style={{ margin: 0 }}>{a.note}</p>}
            <p className="hint" style={{ margin: 0 }}>
              {status.state === 'ingediend'
                ? a.kind === 'course'
                  ? 'Je las alles — knap!'
                  : `Ingediend${status.scorePct !== null ? ` · ${status.scorePct}%` : ''}${status.attempts > 1 ? ` · ${status.attempts} pogingen` : ''}`
                : status.state === 'bezig'
                  ? status.progressPct !== null
                    ? `Bezig · ${status.progressPct}% gelezen`
                    : 'Bezig'
                  : 'Nog niet begonnen'}
            </p>
            {path ? (
              <button
                className="btn btn-primary"
                style={{ minHeight: 46 }}
                onClick={() => onOpen(path)}
              >
                {label}
              </button>
            ) : (
              <div className="callout warn">
                <Package size={18} aria-hidden />
                <div>
                  Deze opdracht staat niet op dit toestel. Open de <Link to="/klas/open">klaslink of het klaspakket</Link>{' '}
                  van je leerkracht.
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

// ── Inleveren: codes tonen als QR of kopiëren ───────────────────────────────

interface HandInItem {
  key: string;
  title: string;
  subtitle: string;
  /** Codes zijn soms duur om te maken (media inlijnen): pas op verzoek. */
  make: () => Promise<string>;
}

function HandInSection({
  cls, student, assignments, ctx,
}: {
  cls: ClassGroup;
  student: ClassStudent;
  assignments: Assignment[];
  ctx: ClassDataContext;
}) {
  const [tick, setTick] = useState(0);

  const items = useMemo<HandInItem[]>(() => {
    const out: HandInItem[] = [];
    // 1. Inzendingen van deze leerling op dit toestel (nieuwste eerst).
    const mine: Submission[] = getSubmissions()
      .filter((s) => matchesStudent(s, student))
      .sort((a, b) => b.submittedAt - a.submittedAt);
    for (const sub of mine) {
      const widget = getWidget(sub.widgetId);
      out.push({
        key: `sub:${sub.id}`,
        title: widget?.title ?? 'Oefening',
        subtitle: `${formatDate(sub.submittedAt)}${sub.totalMax > 0 ? ` · ${Math.round((sub.totalEarned / sub.totalMax) * 100)}%` : ''}`,
        make: () => encodeSubmission(sub),
      });
    }
    // 2. Leesvoortgang van de cursussen uit deze klas.
    for (const a of assignments) {
      if (a.kind !== 'course') continue;
      const course = ctx.courses.get(a.targetId) ?? getCourse(a.targetId);
      if (!course) continue;
      const progress = getStudentProgress(course.id, student.name);
      if (!progress) continue;
      const done = Object.values(progress.sections).filter((s) => s.completedAt).length;
      out.push({
        key: `prog:${course.id}:${progress.lastSeenAt}`,
        title: course.title,
        subtitle: `leesvoortgang · ${done} ${done === 1 ? 'sectie' : 'secties'} gelezen`,
        make: async () =>
          encodeCourseProgress({
            ...progress,
            classId: cls.id,
            ...(student.id ? { studentId: student.id } : {}),
          }),
      });
    }
    return out;
    // tick: na "doorgegeven" opnieuw indelen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id, student, assignments, ctx, tick]);

  // Eén keer lezen: anders gaat de lijst per item naar de opslag.
  const handed = new Set(handedOverKeys());
  const open = items.filter((i) => !handed.has(i.key));
  const done = items.length - open.length;

  return (
    <section className="card card-pad" style={{ marginTop: 18 }} aria-label="Inleveren">
      <h2 style={{ fontSize: '1.05rem', marginTop: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Send size={18} aria-hidden /> Inleveren
      </h2>
      {items.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Zodra je een oefening indient of in een cursus leest, staat hier een code klaar om aan je
          leerkracht te tonen.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>
            Werkte je op je eigen toestel? Toon deze QR-code aan je leerkracht (of kopieer ze en
            stuur ze door). {done > 0 && <>Je gaf er al {done} door.</>}
          </p>
          {open.length === 0 ? (
            <p className="hint" role="status" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckIcon size={14} aria-hidden /> Alles is doorgegeven. Netjes!
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {open.map((item) => (
                <HandInCard key={item.key} item={item} onHandedOver={() => setTick((t) => t + 1)} />
              ))}
            </div>
          )}
          {done > 0 && (
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Al doorgegeven verdwijnt uit deze lijst. Vroeg je leerkracht het toch nog eens? Dien
              dan gewoon opnieuw in, of gebruik <Link to="/voortgang">Mijn voortgang</Link>.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function HandInCard({ item, onHandedOver }: { item: HandInItem; onHandedOver: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const maak = async () => {
    setBusy(true);
    setError('');
    try {
      setCode(await item.make());
    } catch {
      setError('De code kon niet gemaakt worden op dit toestel.');
    } finally {
      setBusy(false);
    }
  };

  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Code gekopieerd — stuur ze naar je leerkracht', 'ok');
      markHandedOver(item.key);
      onHandedOver();
    } catch {
      toast('Kopiëren lukte niet — selecteer de code en kopieer ze zelf', 'err');
    }
  };

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ flex: '1 1 auto' }}>{item.title}</strong>
        <span className="hint">{item.subtitle}</span>
      </div>
      {!code ? (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => { void maak(); }}>
          {busy ? 'Code wordt gemaakt…' : <><QrIcon size={15} aria-hidden /> Toon mijn code</>}
        </button>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <CodeQr value={code} label={`de code van ${item.title}`} size={170} copyLabel="Code kopiëren" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={() => { void kopieer(); }}><CopyIcon size={14} aria-hidden /> Kopiëren</button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => { markHandedOver(item.key); onHandedOver(); toast('Afgevinkt als doorgegeven', 'ok'); }}
            >
              <CheckIcon size={14} aria-hidden /> Doorgegeven
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--err)', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
