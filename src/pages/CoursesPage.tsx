import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Course } from '../lib/courseTypes';
import {
  adoptSharedCourse, createCourse, deleteCourse, ensureDemoCourse,
  exportCourseJson, getCourseProgressAll, getCourses, importCourseJson, saveCourse,
} from '../lib/courses';
import { onStorageChange, getPrefs } from '../lib/storage';
import { downloadFile, formatDateShort, makeCode, uid } from '../lib/utils';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { CourseShareModal } from '../components/course/CourseShareModal';
import { CourseAIModal } from '../components/course/CourseAIModal';

export function CoursesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => setCourses(getCourses());
  useEffect(() => {
    ensureDemoCourse();
    reload();
    return onStorageChange(reload);
  }, []);

  const duplicate = (course: Course) => {
    const copy: Course = JSON.parse(JSON.stringify(course));
    copy.id = uid();
    copy.code = makeCode();
    copy.title = `${course.title} (kopie)`;
    copy.createdAt = Date.now();
    saveCourse(copy);
    toast('Cursus gedupliceerd', 'ok');
  };

  const importFile = async (f: File) => {
    try {
      const res = importCourseJson(await f.text());
      if (!res) {
        toast('Dit is geen geldig cursusbestand', 'err');
        return;
      }
      adoptSharedCourse(res.course, res.widgets);
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
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>📥 Importeren</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          <button className="btn btn-ai" onClick={() => setAiOpen(true)} title="Een volledige cursus laten bouwen vanuit je leerplandoelen">
            ✨ Met AI (uit leerplandoelen)
          </button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>➕ Nieuwe cursus</button>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState icon="📚" title="Nog geen cursussen">
          <p>
            Bouw een digitale cursus met hoofdstukken, tekst, video en ingebedde oefeningen —
            of laat de AI een voorzet maken vanuit je leerplandoelen.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ai" onClick={() => setAiOpen(true)}>✨ Met AI</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>➕ Zelf bouwen</button>
          </div>
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
          {courses.map((course) => {
            const sections = course.chapters.reduce((a, c) => a + c.sections.length, 0);
            const readers = getCourseProgressAll(course.id).length;
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
                  <p className="hint" style={{ margin: 0 }}>👥 {readers} lezer{readers === 1 ? '' : 's'}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <Link to={`/cursus/bewerk/${course.id}`} className="btn btn-sm btn-primary">✏️ Bewerken</Link>
                    <Link to={`/cursus/volg/${course.id}`} className="btn btn-sm btn-ghost">📊 Volgen</Link>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShareTarget(course)}>📤 Delen</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-quiet" onClick={() => duplicate(course)}>📄 Dupliceren</button>
                    <a className="btn btn-sm btn-quiet" href={`#/cursus/print/${course.id}`} target="_blank" rel="noopener">🖨️ Afdrukken</a>
                    <button className="btn btn-sm btn-quiet" onClick={() => downloadFile(`${course.title || 'cursus'}.json`, exportCourseJson(course))}>💾 Exporteren</button>
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
      {aiOpen && (
        <CourseAIModal
          mode="new"
          onClose={() => setAiOpen(false)}
          onResult={(course) => {
            saveCourse(course);
            navigate(`/cursus/bewerk/${course.id}`);
          }}
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
