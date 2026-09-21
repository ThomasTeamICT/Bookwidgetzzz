import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Course } from '../lib/courseTypes';
import type { Curriculum } from '../lib/curriculumTypes';
import type { Widget } from '../lib/types';
import {
  adoptSharedCourse, createCourse, deleteCourse, ensureDemoCourse,
  exportCourseJson, getCourse, getCourseProgressAll, getCourses,
  importCourseJson, saveCourse, sharedCourseDiffers,
} from '../lib/courses';
import { getCurricula } from '../lib/curriculum';
import { computeCoverage } from '../lib/coverage';
import { takeHandoff } from '../lib/handoff';
import { onStorageChange, getPrefs, getWidgets } from '../lib/storage';
import { downloadFile, formatDateShort, makeCode, uid } from '../lib/utils';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { CourseShareModal } from '../components/course/CourseShareModal';
import { CourseAIModal } from '../components/course/CourseAIModal';

/** Alles wat de AI-cursusbouwer vooringevuld kan krijgen. */
interface AIStart {
  focus: 'source' | 'curriculum';
  source?: string;
  title?: string;
  curriculumId?: string;
  goalCodes?: string[];
  originNote?: string;
}

export function CoursesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [aiStart, setAiStart] = useState<AIStart | null>(null);
  const [shareTarget, setShareTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [importConflict, setImportConflict] = useState<{ course: Course; widgets: Widget[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exampleBusy, setExampleBusy] = useState(false);

  const reload = () => {
    setCourses(getCourses());
    setCurricula(getCurricula());
    setWidgets(getWidgets());
  };
  useEffect(() => {
    reload();
    // Voorbeeldinhoud lui laden (zoals in App.tsx): het voorbeeldleerplan moet
    // er eerst staan, want de democursus hangt zich eraan vast.
    void import('../lib/seed')
      .then((m) => m.ensureExampleCurriculum())
      .catch(() => { /* zonder voorbeeldleerplan werkt alles gewoon verder */ })
      .then(() => { ensureDemoCourse(); reload(); });
    return onStorageChange(reload);
  }, []);

  // Binnenkomen vanaf de importpagina: /cursussen?ai=nieuw met het
  // bronmateriaal in sessionStorage (lib/handoff.ts). Eén keer ophalen, de
  // query daarna wissen zodat een herlaadbeurt niets opnieuw opent.
  const handoffDone = useRef(false);
  useEffect(() => {
    if (handoffDone.current || searchParams.get('ai') !== 'nieuw') return;
    handoffDone.current = true;
    const h = takeHandoff();
    setAiStart({
      focus: h?.source?.trim() ? 'source' : 'curriculum',
      source: h?.source,
      title: h?.title,
      curriculumId: h?.curriculumId,
      goalCodes: h?.goalCodes,
      originNote: h?.origin ? `Bron uit ${h.origin}` : h?.source ? 'Bron uit de importpagina' : undefined,
    });
    if (h?.origin) toast(`Bron uit ${h.origin} overgenomen`, 'ok');
    const next = new URLSearchParams(searchParams);
    next.delete('ai');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  /** Leerplantitel + dekkingspercentage per cursus (alleen met curriculumId). */
  const coverageByCourse = useMemo(() => {
    const map = new Map<string, { title: string; percent: number; covered: number; total: number }>();
    for (const course of courses) {
      if (!course.curriculumId) continue;
      const cur = curricula.find((c) => c.id === course.curriculumId);
      if (!cur) continue;
      const res = computeCoverage(course, cur, widgets);
      map.set(course.id, { title: cur.title, percent: res.percent, covered: res.covered, total: res.total });
    }
    return map;
  }, [courses, curricula, widgets]);

  const duplicate = (course: Course) => {
    const copy: Course = JSON.parse(JSON.stringify(course));
    copy.id = uid();
    copy.code = makeCode();
    copy.title = `${course.title} (kopie)`;
    copy.createdAt = Date.now();
    saveCourse(copy);
    toast('Cursus gedupliceerd', 'ok');
  };

  // Voorbeeldcursus (bestaand materiaal van een leerkracht, 13 hoofdstukken):
  // lui opgehaald uit public/voorbeelden, zie lib/examples.ts.
  const loadExample = async () => {
    setExampleBusy(true);
    try {
      const m = await import('../lib/examples');
      const already = m.exampleCourseInstalled();
      const { course, widgets } = await m.loadExampleCourse();
      const n = course.chapters.length;
      toast(already ? `Voorbeeldcursus opnieuw geladen (${n} hoofdstukken)` : `Voorbeeldcursus geladen: ${n} hoofdstukken, ${widgets.length} flitskaartensets`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Voorbeeldcursus laden mislukt', 'err');
    } finally {
      setExampleBusy(false);
    }
  };

  const importFile = async (f: File) => {
    try {
      const res = importCourseJson(await f.text());
      if (!res) {
        toast('Dit is geen geldig cursusbestand', 'err');
        return;
      }
      // Bestaat er al een (andere) versie van deze cursus? Dan is een
      // stille overschrijving of een stille no-op allebei fout: vraag het.
      // Dit maakt ook "back-up terugzetten" betrouwbaar.
      if (getCourse(res.course.id) && (await sharedCourseDiffers(res.course))) {
        setImportConflict(res);
        return;
      }
      adoptSharedCourse(res.course, res.widgets, { force: true });
      toast(`Cursus "${res.course.title}" geïmporteerd${res.widgets.length ? ` (met ${res.widgets.length} widget${res.widgets.length === 1 ? '' : 's'})` : ''}`, 'ok');
    } catch {
      toast('Importeren mislukt', 'err');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📚 Cursussen</h1>
          <p className="sub">Digitale cursussen die je per hoofdstuk deelt en opvolgt — met oefeningen erin.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/importeren" className="btn btn-ghost" title="Vertrek van een document, pdf of presentatie die je al hebt">
            📥 Uit bestaand materiaal
          </Link>
          <button
            className="btn btn-ai"
            onClick={() => setAiStart({ focus: 'curriculum' })}
            title="Kies je leerplandoelen; de AI bouwt een cursus die ze allemaal dekt"
          >
            🎯 Blanco vanuit leerplan
          </button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>➕ Zelf bouwen</button>
          <button className="btn btn-quiet" onClick={() => fileRef.current?.click()} title="Een cursusbestand (.json) terugzetten">
            📂 JSON openen
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => { void loadExample(); }}
            disabled={exampleBusy}
            title="Een echte cursus natuurwetenschappen (13 hoofdstukken, uit pdf's ingelezen) als voorbeeld in je bibliotheek zetten"
          >
            {exampleBusy ? '⏳ Laden…' : '🧪 Voorbeeldcursus laden'}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState icon="📚" title="Nog geen cursussen">
          <p>
            Er zijn drie manieren om te starten. Kies er een — je kan achteraf altijd alles zelf
            aanpassen, en de AI blijft een voorzet die jij nakijkt.
          </p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', textAlign: 'left', marginTop: 8 }}>
            <div className="card card-pad">
              <strong>📥 Uit bestaand materiaal</strong>
              <p className="hint">Je hebt al een cursustekst, een pdf of een presentatie? Lees ze in en laat er een digitale cursus van maken.</p>
              <Link to="/importeren" className="btn btn-sm btn-ghost">Materiaal inlezen</Link>
            </div>
            <div className="card card-pad">
              <strong>🎯 Blanco vanuit leerplan</strong>
              <p className="hint">Kies je leerplandoelen; de AI bouwt een dekkende cursus met de doelcodes al op de secties.</p>
              <button className="btn btn-sm btn-ai" onClick={() => setAiStart({ focus: 'curriculum' })}>Doelen kiezen</button>
            </div>
            <div className="card card-pad">
              <strong>➕ Zelf bouwen</strong>
              <p className="hint">Begin met een leeg hoofdstuk en bouw sectie per sectie — met of zonder AI-hulp onderweg.</p>
              <button className="btn btn-sm btn-primary" onClick={() => setNewOpen(true)}>Lege cursus</button>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            Eerst eens zien hoe een ingelezen cursus eruitziet? Laad de <strong>voorbeeldcursus natuurwetenschappen</strong>:
            13 hoofdstukken uit de pdf's van een leerkracht, met afbeeldingen, doelcodes en flitskaarten.{' '}
            <button className="btn btn-sm btn-quiet" onClick={() => { void loadExample(); }} disabled={exampleBusy}>
              {exampleBusy ? '⏳ Laden…' : '🧪 Voorbeeldcursus laden'}
            </button>
          </p>
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
          {courses.map((course) => {
            const sections = course.chapters.reduce((a, c) => a + c.sections.length, 0);
            const readers = getCourseProgressAll(course.id).length;
            const cov = coverageByCourse.get(course.id);
            return (
              <div key={course.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 86,
                    fontSize: '2.6rem', background: `${course.settings.accentColor}22`,
                    borderRadius: 'var(--radius-m) var(--radius-m) 0 0',
                  }}
                  aria-hidden
                >
                  {course.coverEmoji}
                </div>
                <div style={{ padding: '12px 16px 14px', display: 'grid', gap: 6, flex: 1 }}>
                  <h3 style={{ margin: 0 }}>{course.title}</h3>
                  {course.subtitle && <p className="hint" style={{ margin: 0 }}>{course.subtitle}</p>}
                  <p className="hint" style={{ margin: 0 }}>
                    {course.chapters.length} hoofdstuk{course.chapters.length === 1 ? '' : 'ken'} · {sections} secties ·
                    code <strong style={{ fontFamily: 'monospace' }}>{course.code}</strong> · bijgewerkt {formatDateShort(course.updatedAt)}
                  </p>
                  {cov && (
                    <p style={{ margin: 0, fontSize: '0.84rem' }}>
                      🎯 {cov.title}
                      <br />
                      <span className="badge" title={`${cov.covered} van ${cov.total} leerplandoelen komen aan bod in een gewone sectie`}>
                        dekking {cov.percent}% ({cov.covered}/{cov.total})
                      </span>
                    </p>
                  )}
                  <p className="hint" style={{ margin: 0 }}>👥 {readers} lezer{readers === 1 ? '' : 's'}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <Link to={`/cursus/bewerk/${course.id}`} className="btn btn-sm btn-primary">✏️ Bewerken</Link>
                    <Link to={`/cursus/volg/${course.id}`} className="btn btn-sm btn-ghost">📊 Volgen</Link>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShareTarget(course)}>📤 Delen</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-quiet" onClick={() => duplicate(course)}>📄 Dupliceren</button>
                    <a className="btn btn-sm btn-quiet" href={`#/cursus/print/${course.id}`} target="_blank" rel="noopener">🖨️ Afdrukken</a>
                    <button className="btn btn-sm btn-quiet" onClick={() => { void exportCourseJson(course).then((json) => downloadFile(`${course.title || 'cursus'}.json`, json)); }}>💾 Exporteren</button>
                    <button
                      className="btn btn-sm btn-quiet"
                      aria-label={`Cursus "${course.title}" verwijderen`}
                      onClick={() => setDeleteTarget(course)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newOpen && (
        <NewCourseModal
          onClose={() => setNewOpen(false)}
          onCreate={(title) => {
            const c = createCourse(title, getPrefs().teacherName);
            saveCourse(c);
            navigate(`/cursus/bewerk/${c.id}`);
          }}
        />
      )}
      {aiStart && (
        <CourseAIModal
          mode="new"
          focus={aiStart.focus}
          initialSource={aiStart.source}
          initialTitle={aiStart.title}
          initialCurriculumId={aiStart.curriculumId}
          initialGoalCodes={aiStart.goalCodes}
          originNote={aiStart.originNote}
          onClose={() => setAiStart(null)}
          onResult={(course) => {
            saveCourse(course);
            navigate(`/cursus/bewerk/${course.id}`);
          }}
        />
      )}
      {importConflict && (
        <ConfirmModal
          title="Bestaande cursus vervangen?"
          message={`Er staat al een versie van "${importConflict.course.title}" op dit toestel. Vervangen door de versie uit het bestand? De huidige versie ben je dan kwijt (exporteer ze eerst als je twijfelt); leesvoortgang blijft staan.`}
          confirmLabel="Vervangen"
          onConfirm={() => {
            adoptSharedCourse(importConflict.course, importConflict.widgets, { force: true });
            toast(`Cursus "${importConflict.course.title}" vervangen door de versie uit het bestand`, 'ok');
          }}
          onClose={() => setImportConflict(null)}
        />
      )}
      {shareTarget && <CourseShareModal course={shareTarget} onClose={() => setShareTarget(null)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Cursus verwijderen?"
          message={`"${deleteTarget.title}" en de bijhorende leesvoortgang van leerlingen worden definitief verwijderd. Ingebedde widgets blijven bestaan bij "Mijn widgets".`}
          onConfirm={() => { deleteCourse(deleteTarget.id); toast('Cursus verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function NewCourseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const submit = () => { if (title.trim()) onCreate(title.trim()); };
  return (
    <Modal
      title="Nieuwe cursus"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={submit}>Aanmaken</button>
        </>
      }
    >
      <Field label="Titel van de cursus">
        <input
          className="input" value={title} autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="bv. De waterkringloop"
        />
      </Field>
    </Modal>
  );
}
