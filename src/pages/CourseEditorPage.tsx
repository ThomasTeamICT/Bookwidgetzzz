// ── Cursuseditor: hoofdstukken → secties → blokken ──────────────────────────
//
// Eigen paginashell (geen Layout), zoals de widgeteditor. Links de structuur,
// rechts de geselecteerde sectie met haar blokken. Alles wordt automatisch
// bewaard met een korte debounce; bij unmount wordt de laatste stand geflusht.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Course, CourseBlockType, CourseChapter, CourseSection } from '../lib/courseTypes';
import { allSections } from '../lib/courseTypes';
import { courseReadUrl, getCourse, makeBlock, saveCourse } from '../lib/courses';
import { uid } from '../lib/utils';
import { CheckRow, ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { BLOCK_META, BlockEditor, PALETTE_ORDER, duplicateBlock } from '../components/course/blockEditors';
import { CourseAIModal } from '../components/course/CourseAIModal';
import { GoalCoverage } from '../components/course/GoalCoverage';

// ── Immutabele hulpjes ──────────────────────────────────────────────────────

function moveItem<T>(arr: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  const [x] = copy.splice(i, 1);
  copy.splice(j, 0, x);
  return copy;
}

function patchChapter(course: Course, chapterId: string, fn: (ch: CourseChapter) => CourseChapter): Course {
  return { ...course, chapters: course.chapters.map((ch) => (ch.id === chapterId ? fn(ch) : ch)) };
}

function patchSection(course: Course, sectionId: string, fn: (s: CourseSection) => CourseSection): Course {
  return {
    ...course,
    chapters: course.chapters.map((ch) => ({
      ...ch,
      sections: ch.sections.map((se) => (se.id === sectionId ? fn(se) : se)),
    })),
  };
}

type PendingDelete =
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'section'; chapterId: string; sectionId: string };

type AIModalState = { mode: 'rework' } | { mode: 'section'; sectionId: string } | null;

// ── De pagina ───────────────────────────────────────────────────────────────

export function CourseEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const initial = useMemo(() => (id ? getCourse(id) : undefined), [id]);
  const [course, setCourse] = useState<Course | undefined>(initial);
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>(
    () => initial?.chapters[0]?.sections[0]?.id
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [aiModal, setAiModal] = useState<AIModalState>(null);
  const [paletteAt, setPaletteAt] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Automatisch bewaren met debounce (eerste render overslaan: enkel openen
  // van een cursus mag updatedAt niet aanraken).
  const firstRun = useRef(true);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!course) return;
    if (firstRun.current) { firstRun.current = false; return; }
    dirtyRef.current = true;
    setSaveState('saving');
    const t = window.setTimeout(() => {
      saveCourse(course);
      dirtyRef.current = false;
      setSaveState('saved');
    }, 800);
    return () => window.clearTimeout(t);
  }, [course]);

  // Flush bij unmount: wie binnen de debounce wegklikt, verliest anders de
  // laatste wijzigingen. Ook bij F5/tabblad sluiten (pagehide), want dan
  // draait de React-cleanup niet.
  const courseRef = useRef(course);
  useEffect(() => { courseRef.current = course; }, [course]);
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && courseRef.current) {
        saveCourse(courseRef.current);
        dirtyRef.current = false;
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  if (!course) {
    return (
      <div className="page page-narrow" style={{ paddingTop: 60 }}>
        <EmptyState icon="📚" title="Cursus niet gevonden">
          <p style={{ color: 'var(--text-soft)' }}>Deze cursus bestaat niet (meer) in deze browser.</p>
          <Link to="/cursussen" className="btn btn-primary">← Naar mijn cursussen</Link>
        </EmptyState>
      </div>
    );
  }

  const sections = allSections(course);
  const selected = sections.find((x) => x.section.id === selectedSectionId) ?? sections[0];

  /** Onmiddellijk bewaren (vóór voorbeeld/afdruk in een nieuw tabblad). */
  const flushNow = () => {
    if (dirtyRef.current && courseRef.current) {
      saveCourse(courseRef.current);
      dirtyRef.current = false;
      setSaveState('saved');
    }
  };

  const mutateSection = (sectionId: string, fn: (s: CourseSection) => CourseSection) =>
    setCourse((c) => (c ? patchSection(c, sectionId, fn) : c));

  const doDelete = (p: PendingDelete) => {
    if (p.kind === 'chapter') {
      setCourse((c) => (c ? { ...c, chapters: c.chapters.filter((ch) => ch.id !== p.chapterId) } : c));
      return;
    }
    // Sectie: buur selecteren als de geselecteerde verdwijnt.
    const ch = course.chapters.find((x) => x.id === p.chapterId);
    if (ch && selected?.section.id === p.sectionId) {
      const i = ch.sections.findIndex((s) => s.id === p.sectionId);
      const neighbour = ch.sections[i + 1]?.id ?? ch.sections[i - 1]?.id;
      setSelectedSectionId(neighbour);
    }
    setCourse((c) =>
      c ? patchChapter(c, p.chapterId, (chap) => ({ ...chap, sections: chap.sections.filter((s) => s.id !== p.sectionId) })) : c
    );
  };

  const insertBlockAt = (type: CourseBlockType) => {
    if (paletteAt === null || !selected) return;
    const at = paletteAt;
    mutateSection(selected.section.id, (s) => ({
      ...s,
      blocks: [...s.blocks.slice(0, at), makeBlock(type), ...s.blocks.slice(at)],
    }));
    setPaletteAt(null);
  };

  return (
    <div className="appshell">
      <header className="topbar" style={{ flexWrap: 'wrap', rowGap: 6 }}>
        <button className="btn btn-quiet btn-sm" onClick={() => navigate('/cursussen')} aria-label="Terug naar mijn cursussen">
          ← Terug
        </button>
        <span
          className="type-icon"
          style={{ background: course.settings.accentColor, width: 34, height: 34, fontSize: '1.05rem', borderRadius: 9 }}
          aria-hidden
        >
          {course.coverEmoji}
        </span>
        <input
          className="input input-sm"
          style={{ maxWidth: 320, fontWeight: 700, fontSize: '1.02rem' }}
          value={course.title}
          aria-label="Titel van de cursus"
          onChange={(e) => setCourse({ ...course, title: e.target.value })}
        />
        <span className="hint" aria-live="polite" style={{ minWidth: 84 }}>
          {saveState === 'saving' ? 'Bewaren…' : saveState === 'saved' ? '✓ Bewaard' : ''}
        </span>
        <div className="topbar-spacer" />
        <span className="badge" title="Cursuscode" style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}>{course.code}</span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => { flushNow(); window.open(courseReadUrl(course.code), '_blank'); }}
          title="Open de cursus zoals je leerlingen hem zien"
        >
          👁️ Als leerling
        </button>
        <a
          className="btn btn-sm btn-ghost"
          href={`#/cursus/print/${course.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={flushNow}
          title="Afdrukken of als PDF bewaren"
        >
          🖨️ Afdrukken
        </a>
        <button className="btn btn-sm btn-ai" onClick={() => setAiModal({ mode: 'rework' })} title="Laat AI de hele cursus herwerken of uitbreiden">
          ✨ Herwerk met AI
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setGoalsOpen(true)}
          title="Welke leerplandoelen zijn gedekt, en welke secties dragen nog geen doel?"
        >
          🎯 Doelendekking
        </button>
        <Link to={`/cursus/volg/${course.id}`} className="btn btn-sm btn-ghost" title="Voortgang van je leerlingen">
          📊 Voortgang
        </Link>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setSettingsOpen(true)} aria-label="Cursusinstellingen" title="Cursusinstellingen">
          ⚙️
        </button>
      </header>

      <main
        style={{
          flex: 1, display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 18,
          width: '100%', maxWidth: 1400, margin: '0 auto', padding: '18px 22px 60px', alignItems: 'start',
        }}
      >
        <StructurePane
          course={course}
          selectedId={selected?.section.id}
          onSelect={setSelectedSectionId}
          onChange={setCourse}
          onAskDelete={(p) => {
            // Direct verwijderen als er niets in zit; anders eerst bevestigen.
            if (p.kind === 'chapter') {
              const ch = course.chapters.find((x) => x.id === p.chapterId);
              if (ch && ch.sections.length === 0) { doDelete(p); return; }
            } else {
              const ch = course.chapters.find((x) => x.id === p.chapterId);
              const se = ch?.sections.find((s) => s.id === p.sectionId);
              if (se && se.blocks.length === 0) { doDelete(p); return; }
            }
            setPendingDelete(p);
          }}
        />

        {selected ? (
          <SectionPane
            key={selected.section.id}
            chapter={selected.chapter}
            section={selected.section}
            onPatch={(fn) => mutateSection(selected.section.id, fn)}
            onOpenAI={() => setAiModal({ mode: 'section', sectionId: selected.section.id })}
            onOpenPalette={setPaletteAt}
          />
        ) : (
          <EmptyState icon="🧱" title="Geen sectie geselecteerd">
            <p style={{ color: 'var(--text-soft)' }}>Voeg links een hoofdstuk en een sectie toe om te beginnen.</p>
          </EmptyState>
        )}
      </main>

      {paletteAt !== null && <BlockPalette onPick={insertBlockAt} onClose={() => setPaletteAt(null)} />}

      {settingsOpen && (
        <CourseSettingsModal course={course} onChange={setCourse} onClose={() => setSettingsOpen(false)} />
      )}

      {goalsOpen && (
        <Modal title="🎯 Doelendekking" onClose={() => setGoalsOpen(false)} wide>
          <GoalCoverage course={course} />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.kind === 'chapter' ? 'Hoofdstuk verwijderen?' : 'Sectie verwijderen?'}
          message={
            pendingDelete.kind === 'chapter'
              ? 'Dit hoofdstuk bevat nog secties. Alles erin wordt definitief verwijderd (widgets zelf blijven bestaan).'
              : 'Deze sectie bevat nog blokken. Ze wordt definitief verwijderd (widgets zelf blijven bestaan).'
          }
          onConfirm={() => doDelete(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {aiModal && (
        <CourseAIModal
          mode={aiModal.mode}
          course={course}
          sectionId={aiModal.mode === 'section' ? aiModal.sectionId : undefined}
          onClose={() => setAiModal(null)}
          onResult={(result: Course) => {
            setCourse(result);
            setAiModal(null);
            toast('✨ Cursus bijgewerkt — kijk alles even na', 'ok');
          }}
        />
      )}
    </div>
  );
}

// ── Linkerkolom: structuur ──────────────────────────────────────────────────

function StructurePane({
  course, selectedId, onSelect, onChange, onAskDelete,
}: {
  course: Course;
  selectedId?: string;
  onSelect: (sectionId: string) => void;
  onChange: (course: Course) => void;
  onAskDelete: (p: PendingDelete) => void;
}) {
  const addChapter = () => {
    const section: CourseSection = { id: uid(), title: 'Nieuwe sectie', blocks: [] };
    const chapter: CourseChapter = {
      id: uid(), title: `Hoofdstuk ${course.chapters.length + 1}`, emoji: '📖', sections: [section],
    };
    onChange({ ...course, chapters: [...course.chapters, chapter] });
    onSelect(section.id);
  };

  const addSection = (chapterId: string) => {
    const section: CourseSection = { id: uid(), title: 'Nieuwe sectie', blocks: [] };
    onChange(patchChapter(course, chapterId, (ch) => ({ ...ch, sections: [...ch.sections, section] })));
    onSelect(section.id);
  };

  return (
    <nav
      aria-label="Cursusstructuur"
      style={{ position: 'sticky', top: 70, maxHeight: 'calc(100vh - 92px)', overflowY: 'auto', paddingRight: 2 }}
    >
      {course.chapters.map((ch, ci) => (
        <div key={ch.id} className="card" style={{ padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input input-sm"
              style={{ width: 42, textAlign: 'center', padding: '5px 2px', flexShrink: 0 }}
              value={ch.emoji ?? ''}
              maxLength={4}
              aria-label={`Emoji van hoofdstuk ${ci + 1}`}
              placeholder="📖"
              onChange={(e) => onChange(patchChapter(course, ch.id, (c) => ({ ...c, emoji: e.target.value || undefined })))}
            />
            <input
              className="input input-sm"
              style={{ flex: 1, fontWeight: 700, minWidth: 0 }}
              value={ch.title}
              aria-label={`Titel van hoofdstuk ${ci + 1}`}
              onChange={(e) => onChange(patchChapter(course, ch.id, (c) => ({ ...c, title: e.target.value })))}
            />
          </div>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', margin: '4px 0 6px' }}>
            <button className="btn btn-quiet btn-sm btn-icon" disabled={ci === 0} aria-label={`Hoofdstuk ${ci + 1} omhoog`}
              onClick={() => onChange({ ...course, chapters: moveItem(course.chapters, ci, -1) })}>↑</button>
            <button className="btn btn-quiet btn-sm btn-icon" disabled={ci === course.chapters.length - 1} aria-label={`Hoofdstuk ${ci + 1} omlaag`}
              onClick={() => onChange({ ...course, chapters: moveItem(course.chapters, ci, 1) })}>↓</button>
            <button
              className="btn btn-quiet btn-sm btn-icon"
              disabled={course.chapters.length <= 1}
              aria-label={`Hoofdstuk ${ci + 1} verwijderen`}
              title={course.chapters.length <= 1 ? 'Een cursus heeft minstens één hoofdstuk' : 'Hoofdstuk verwijderen'}
              onClick={() => onAskDelete({ kind: 'chapter', chapterId: ch.id })}
            >
              🗑
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-quiet btn-sm" onClick={() => addSection(ch.id)}>+ Sectie</button>
          </div>

          {ch.sections.map((se, si) => {
            const sel = se.id === selectedId;
            return (
              <div key={se.id} style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                <button
                  onClick={() => onSelect(se.id)}
                  aria-current={sel ? 'true' : undefined}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    textAlign: 'left', font: 'inherit', fontSize: '0.9rem',
                    background: sel ? 'var(--brand-soft)' : 'transparent',
                    color: sel ? 'var(--brand)' : 'var(--text)',
                    fontWeight: sel ? 700 : 500,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {se.title.trim() || 'Naamloze sectie'}
                  </span>
                  {(se.goals?.length ?? 0) > 0 && (
                    <span title="Heeft leerdoelen" aria-label="heeft leerdoelen" style={{ fontSize: '0.8rem' }}>🎯</span>
                  )}
                  {se.optional && (
                    <span className="badge" style={{ fontSize: '0.64rem', padding: '1px 6px' }} title="Verdiepings-/keuzesectie">
                      keuze
                    </span>
                  )}
                </button>
                <button className="btn btn-quiet btn-sm btn-icon" disabled={si === 0} aria-label={`Sectie “${se.title}” omhoog`}
                  onClick={() => onChange(patchChapter(course, ch.id, (c) => ({ ...c, sections: moveItem(c.sections, si, -1) })))}>↑</button>
                <button className="btn btn-quiet btn-sm btn-icon" disabled={si === ch.sections.length - 1} aria-label={`Sectie “${se.title}” omlaag`}
                  onClick={() => onChange(patchChapter(course, ch.id, (c) => ({ ...c, sections: moveItem(c.sections, si, 1) })))}>↓</button>
                <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Sectie “${se.title}” verwijderen`}
                  onClick={() => onAskDelete({ kind: 'section', chapterId: ch.id, sectionId: se.id })}>🗑</button>
              </div>
            );
          })}
          {ch.sections.length === 0 && (
            <p className="hint" style={{ margin: '4px 2px' }}>Nog geen secties.</p>
          )}
        </div>
      ))}
      <button className="btn btn-ghost" style={{ width: '100%' }} onClick={addChapter}>+ Hoofdstuk</button>
    </nav>
  );
}

// ── Rechterkolom: de geselecteerde sectie ───────────────────────────────────

function SectionPane({
  chapter, section, onPatch, onOpenAI, onOpenPalette,
}: {
  chapter: CourseChapter;
  section: CourseSection;
  onPatch: (fn: (s: CourseSection) => CourseSection) => void;
  onOpenAI: () => void;
  onOpenPalette: (index: number) => void;
}) {
  const goals = section.goals ?? [];
  const setGoals = (g: string[]) => onPatch((s) => ({ ...s, goals: g.length ? g : undefined }));
  const setBlocks = (blocks: CourseSection['blocks']) => onPatch((s) => ({ ...s, blocks }));

  return (
    <div style={{ minWidth: 0 }}>
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <p className="hint" style={{ margin: '0 0 6px' }}>
          {chapter.emoji ? `${chapter.emoji} ` : ''}Hoofdstuk: {chapter.title}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 220, fontWeight: 700 }}
            value={section.title}
            aria-label="Titel van de sectie"
            placeholder="Titel van de sectie"
            onChange={(e) => onPatch((s) => ({ ...s, title: e.target.value }))}
          />
          <button className="btn btn-sm btn-ai" onClick={onOpenAI} title="Laat AI deze sectie vullen met inhoud">
            ✨ Vul deze sectie met AI
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <CheckRow
            checked={section.optional === true}
            onChange={(v) => onPatch((s) => ({ ...s, optional: v || undefined }))}
            label="Verdiepings-/keuzesectie (telt niet mee voor 'afgewerkt')"
          />
        </div>
        <Field
          label="🎯 Leerdoelen (optioneel)"
          hint="Wat kan de leerling na deze sectie? Zichtbaar als feed-up en in de voortgangsweergave."
        >
          <div>
            {goals.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input
                  className="input input-sm"
                  style={{ flex: 1, minWidth: 0 }}
                  value={g}
                  placeholder="bv. Ik kan uitleggen wat verdamping is."
                  aria-label={`Leerdoel ${i + 1}`}
                  onChange={(e) => setGoals(goals.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Leerdoel ${i + 1} verwijderen`}
                  onClick={() => setGoals(goals.filter((_, j) => j !== i))}>🗑</button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setGoals([...goals, ''])}>+ Leerdoel</button>
          </div>
        </Field>
      </div>

      {section.blocks.length === 0 && (
        <div className="empty-state" style={{ padding: '26px 16px' }}>
          <div className="big" aria-hidden>🧱</div>
          <h3>Nog geen inhoud</h3>
          <p style={{ color: 'var(--text-soft)' }}>Voeg je eerste blok toe — tekst, video, een oefenwidget, …</p>
        </div>
      )}

      {section.blocks.map((block, i) => (
        <React.Fragment key={block.id}>
          {i > 0 && (
            <div style={{ textAlign: 'center', margin: '-6px 0 6px' }}>
              <button
                className="btn btn-quiet btn-sm btn-icon"
                aria-label={`Blok invoegen vóór blok ${i + 1}`}
                title="Blok hier invoegen"
                onClick={() => onOpenPalette(i)}
              >
                +
              </button>
            </div>
          )}
          <BlockCard
            block={block}
            index={i}
            count={section.blocks.length}
            onChange={(nb) => setBlocks(section.blocks.map((x) => (x.id === block.id ? nb : x)))}
            onMove={(d) => setBlocks(moveItem(section.blocks, i, d))}
            onDuplicate={() => {
              const copy = duplicateBlock(block);
              setBlocks([...section.blocks.slice(0, i + 1), copy, ...section.blocks.slice(i + 1)]);
            }}
            onDelete={() => setBlocks(section.blocks.filter((x) => x.id !== block.id))}
          />
        </React.Fragment>
      ))}

      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => onOpenPalette(section.blocks.length)}>
        + Blok toevoegen
      </button>
    </div>
  );
}

// ── Eén blok-kaart met knoppen + formulier ──────────────────────────────────

function BlockCard({
  block, index, count, onChange, onMove, onDuplicate, onDelete,
}: {
  block: CourseSection['blocks'][number];
  index: number;
  count: number;
  onChange: (b: CourseSection['blocks'][number]) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const meta = BLOCK_META[block.type];
  return (
    <div className="editor-item">
      <div className="editor-item-head">
        <span aria-hidden>{meta.icon}</span>
        <strong style={{ fontSize: '0.9rem' }}>{meta.name}</strong>
        <span style={{ flex: 1 }} />
        <button className="btn btn-quiet btn-sm btn-icon" disabled={index === 0} aria-label={`Blok ${index + 1} omhoog`}
          onClick={() => onMove(-1)}>↑</button>
        <button className="btn btn-quiet btn-sm btn-icon" disabled={index === count - 1} aria-label={`Blok ${index + 1} omlaag`}
          onClick={() => onMove(1)}>↓</button>
        <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Blok ${index + 1} dupliceren`} title="Dupliceren"
          onClick={onDuplicate}>📄</button>
        <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Blok ${index + 1} verwijderen`} title="Verwijderen"
          onClick={onDelete}>🗑</button>
      </div>
      <div className="editor-item-body">
        <BlockEditor block={block} onChange={onChange} />
      </div>
    </div>
  );
}

// ── Blokkenpalet ────────────────────────────────────────────────────────────

function BlockPalette({ onPick, onClose }: { onPick: (type: CourseBlockType) => void; onClose: () => void }) {
  return (
    <Modal title="Blok toevoegen" onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        {PALETTE_ORDER.map((type) => {
          const meta = BLOCK_META[type];
          return (
            <button
              key={type}
              className="card"
              style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
              onClick={() => onPick(type)}
            >
              <div style={{ fontSize: '1.4rem', marginBottom: 4 }} aria-hidden>{meta.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{meta.name}</div>
              <div className="hint" style={{ lineHeight: 1.35 }}>{meta.blurb}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Cursusinstellingen ──────────────────────────────────────────────────────

function CourseSettingsModal({
  course, onChange, onClose,
}: {
  course: Course;
  onChange: (c: Course) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<Course>) => onChange({ ...course, ...patch });
  const setSettings = (patch: Partial<Course['settings']>) =>
    onChange({ ...course, settings: { ...course.settings, ...patch } });

  return (
    <Modal
      title="⚙️ Cursusinstellingen"
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Klaar</button>}
    >
      <Field label="Ondertitel (optioneel)">
        <input
          className="input"
          value={course.subtitle ?? ''}
          placeholder="bv. Aardrijkskunde — tweede graad"
          onChange={(e) => set({ subtitle: e.target.value || undefined })}
        />
      </Field>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Omslag-emoji" hint="1–2 tekens">
          <input
            className="input input-sm"
            style={{ width: 70, textAlign: 'center', fontSize: '1.2rem' }}
            value={course.coverEmoji}
            maxLength={4}
            aria-label="Omslag-emoji"
            onChange={(e) => set({ coverEmoji: e.target.value })}
          />
        </Field>
        <Field label="Accentkleur">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={course.settings.accentColor}
              aria-label="Accentkleur van de cursus"
              onChange={(e) => setSettings({ accentColor: e.target.value })}
            />
            <span className="hint">{course.settings.accentColor}</span>
          </div>
        </Field>
      </div>
      <Field label="Auteur" hint="Zichtbaar op de omslag voor je leerlingen.">
        <input
          className="input"
          value={course.author}
          placeholder="bv. Mevr. Peeters"
          onChange={(e) => set({ author: e.target.value })}
        />
      </Field>
      <CheckRow
        checked={course.settings.requireName}
        onChange={(v) => setSettings({ requireName: v })}
        label="Leerling moet eerst een naam invullen (nodig om voortgang te volgen)"
      />
      <CheckRow
        checked={course.settings.showProgressToStudent}
        onChange={(v) => setSettings({ showProgressToStudent: v })}
        label="Voortgangsbalk zichtbaar voor de leerling"
      />
    </Modal>
  );
}
