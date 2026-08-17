// ── Opslag, voortgang en delen van cursussen ────────────────────────────────

import LZString from 'lz-string';
import type { Widget, WidgetSettings } from './types';
import type {
  Course, CourseBlock, CourseBlockType, CourseChapter, CourseProgress,
  CourseSection, SectionProgress,
} from './courseTypes';
import { referencedWidgetIds } from './courseTypes';
import { makeCode, uid } from './utils';
import { getWidget, getWidgets, notifyChange, saveWidget } from './storage';
import { defaultSettings, getTypeDef, WIDGET_TYPES } from '../widgets/registry';

const COURSES_KEY = 'wf.courses.v1';
const PROGRESS_KEY = 'wf.courseprogress.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Opslaan mislukt (localStorage vol?)', e);
    alert('Opslaan mislukt: de lokale opslag is vol. Verwijder grote afbeeldingen of oude cursussen.');
  }
  notifyChange();
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export function getCourses(): Course[] {
  return read<Course[]>(COURSES_KEY, []);
}
export function getCourse(id: string): Course | undefined {
  return getCourses().find((c) => c.id === id);
}
export function getCourseByCode(code: string): Course | undefined {
  const c = code.trim().toUpperCase();
  return getCourses().find((k) => k.code.toUpperCase() === c);
}
export function saveCourse(course: Course) {
  const all = getCourses();
  const i = all.findIndex((c) => c.id === course.id);
  const updated = { ...course, updatedAt: Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  write(COURSES_KEY, all);
}
export function deleteCourse(id: string) {
  write(COURSES_KEY, getCourses().filter((c) => c.id !== id));
  write(PROGRESS_KEY, readAllProgress().filter((p) => p.courseId !== id));
  // Privé leerlingnotities bij deze cursus mee opruimen (zie CourseViewerPage).
  try {
    localStorage.removeItem('wf.coursenotes.' + id);
  } catch {
    // genegeerd: notities opruimen mag verwijderen nooit blokkeren
  }
}

export function createCourse(title: string, author = ''): Course {
  const section: CourseSection = { id: uid(), title: 'Inleiding', blocks: [] };
  const chapter: CourseChapter = { id: uid(), title: 'Hoofdstuk 1', emoji: '📖', sections: [section] };
  return {
    id: uid(),
    title: title.trim() || 'Nieuwe cursus',
    author,
    coverEmoji: '📘',
    code: makeCode(),
    chapters: [chapter],
    settings: { accentColor: '#4f46e5', requireName: true, showProgressToStudent: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Standaardinhoud voor een nieuw blok van het gegeven type. */
export function makeBlock(type: CourseBlockType): CourseBlock {
  const id = uid();
  switch (type) {
    case 'heading': return { id, type, text: 'Nieuwe kop', level: 2 };
    case 'text': return { id, type, markdown: '' };
    case 'image': return { id, type, url: '', size: 'normal' };
    case 'video': return { id, type, url: '' };
    case 'audio': return { id, type, url: '' };
    case 'embed': return { id, type, url: '', height: 420 };
    case 'callout': return { id, type, kind: 'info', text: '' };
    case 'quote': return { id, type, text: '' };
    case 'divider': return { id, type };
    case 'attachment': return { id, type, name: '', dataUrl: '' };
    case 'accordion': return { id, type, items: [{ id: uid(), title: 'Onderdeel', text: '' }] };
    case 'columns': return { id, type, left: '', right: '' };
    case 'table': return { id, type, header: true, rows: [['', ''], ['', '']] };
    case 'terms': return { id, type, items: [{ id: uid(), term: '', uitleg: '' }] };
    case 'checklist': return { id, type, items: [{ id: uid(), text: '' }] };
    case 'widget': return { id, type, widgetId: '' };
  }
}

// ── Voortgang ───────────────────────────────────────────────────────────────

function readAllProgress(): CourseProgress[] {
  return read<CourseProgress[]>(PROGRESS_KEY, []);
}

export function getCourseProgressAll(courseId: string): CourseProgress[] {
  return readAllProgress().filter((p) => p.courseId === courseId);
}

export function getStudentProgress(courseId: string, studentName: string): CourseProgress | undefined {
  const name = studentName.trim().toLowerCase();
  return readAllProgress().find(
    (p) => p.courseId === courseId && p.studentName.trim().toLowerCase() === name
  );
}

export function saveStudentProgress(progress: CourseProgress) {
  const all = readAllProgress();
  const name = progress.studentName.trim().toLowerCase();
  const i = all.findIndex(
    (p) => p.courseId === progress.courseId && p.studentName.trim().toLowerCase() === name
  );
  // lastSeenAt óók op het doorgegeven object bijwerken: de viewer serialiseert
  // ditzelfde object naar de voortgangscode.
  progress.lastSeenAt = Date.now();
  const updated = { ...progress };
  if (i >= 0) all[i] = updated;
  else all.push(updated);
  write(PROGRESS_KEY, all);
}

/**
 * Voegt twee voortgangsrecords van dezelfde leerling samen zonder verlies:
 * unie van checks, vroegste openedAt, hoogste secondsSpent, completedAt blijft
 * staan zodra één van beide hem heeft. Gebruikt door de viewer (tegen verlies
 * bij twee tabbladen) en door de voortgangscode-import.
 */
export function mergeProgressRecords(a: CourseProgress, b: CourseProgress): CourseProgress {
  const newer = b.lastSeenAt >= a.lastSeenAt ? b : a;
  const merged: CourseProgress = {
    ...a,
    startedAt: Math.min(a.startedAt || Date.now(), b.startedAt || Date.now()),
    lastSeenAt: Math.max(a.lastSeenAt, b.lastSeenAt),
    lastSectionId: newer.lastSectionId ?? a.lastSectionId ?? b.lastSectionId,
    sections: { ...a.sections },
  };
  for (const [sid, sp] of Object.entries(b.sections)) {
    const cur = merged.sections[sid];
    if (!cur) {
      merged.sections[sid] = sp;
      continue;
    }
    const checks: Record<string, string[]> = { ...(cur.checks ?? {}) };
    for (const [blockId, items] of Object.entries(sp.checks ?? {})) {
      checks[blockId] = [...new Set([...(checks[blockId] ?? []), ...items])];
    }
    merged.sections[sid] = {
      openedAt: Math.min(cur.openedAt, sp.openedAt),
      completedAt: cur.completedAt ?? sp.completedAt,
      secondsSpent: Math.max(cur.secondsSpent, sp.secondsSpent),
      checks: Object.keys(checks).length ? checks : undefined,
    };
  }
  return merged;
}

export function deleteStudentProgress(courseId: string, studentName: string) {
  const name = studentName.trim().toLowerCase();
  write(
    PROGRESS_KEY,
    readAllProgress().filter(
      (p) => !(p.courseId === courseId && p.studentName.trim().toLowerCase() === name)
    )
  );
}

/** Bestaande voortgang ophalen of een nieuwe starten (nog niet bewaard). */
export function startProgress(course: Course, studentName: string): CourseProgress {
  return (
    getStudentProgress(course.id, studentName) ?? {
      courseId: course.id,
      courseCode: course.code,
      studentName: studentName.trim() || 'Anoniem',
      sections: {},
      lastSeenAt: Date.now(),
      startedAt: Date.now(),
    }
  );
}

export function touchSection(progress: CourseProgress, sectionId: string): SectionProgress {
  const existing = progress.sections[sectionId];
  if (existing) return existing;
  const fresh: SectionProgress = { openedAt: Date.now(), secondsSpent: 0 };
  progress.sections[sectionId] = fresh;
  return fresh;
}

// ── Delen: draagbare link met meereizende widgets ───────────────────────────

interface CoursePayload {
  v: 1;
  kind: 'cursus';
  c: Course;
  /** Widgets waar de cursus naar verwijst, zodat de link zelfstandig werkt. */
  w: Widget[];
  /** true = de link bevat maar een deel van de hoofdstukken. */
  partial?: boolean;
}

/**
 * Maakt een draagbare cursuslink. Optioneel enkel bepaalde hoofdstukken
 * (deel van de cursus delen). Ingebedde widgets reizen mee in de link.
 */
export function encodeCourseToUrl(course: Course, chapterIds?: string[]): string {
  const partial = Boolean(chapterIds && chapterIds.length && chapterIds.length < course.chapters.length);
  const c: Course = {
    ...course,
    chapters: chapterIds && chapterIds.length
      ? course.chapters.filter((ch) => chapterIds.includes(ch.id))
      : course.chapters,
  };
  const w = referencedWidgetIds(c)
    .map((id) => getWidget(id))
    .filter((x): x is Widget => Boolean(x));
  const payload: CoursePayload = { v: 1, kind: 'cursus', c, w, ...(partial ? { partial: true } : {}) };
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const base = location.origin + location.pathname;
  return `${base}#/cursus/open?d=${compressed}`;
}

const KNOWN_TYPES = new Set(WIDGET_TYPES.map((t) => t.id));

/** Meegereisde widget defensief saneren: onbekend type weigeren, ontbrekende velden aanvullen. */
function sanitizeSharedWidget(raw: unknown): Widget | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.type !== 'string' || !KNOWN_TYPES.has(w.type as Widget['type'])) return null;
  if (!w.config || typeof w.config !== 'object') return null;
  const type = w.type as Widget['type'];
  const base = getTypeDef(type).defaultConfig() as Record<string, unknown>;
  return {
    id: typeof w.id === 'string' && w.id ? w.id : uid(),
    type,
    title: typeof w.title === 'string' && w.title.trim() ? w.title : 'Oefening',
    folderId: typeof w.folderId === 'string' ? (w.folderId as string) : null,
    config: { ...base, ...(w.config as Record<string, unknown>) },
    settings: { ...defaultSettings(), ...(typeof w.settings === 'object' && w.settings ? (w.settings as Partial<WidgetSettings>) : {}) },
    code: typeof w.code === 'string' && w.code ? (w.code as string) : makeCode(),
    createdAt: typeof w.createdAt === 'number' ? (w.createdAt as number) : Date.now(),
    updatedAt: Date.now(),
  };
}

export interface DecodedCourse {
  course: Course;
  widgets: Widget[];
  partial: boolean;
}

export function decodeCourseFromParam(d: string): DecodedCourse | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(d);
    if (!json) return null;
    const payload = JSON.parse(json) as CoursePayload;
    if (!payload || payload.v !== 1 || payload.kind !== 'cursus') return null;
    const course = sanitizeCourse(payload.c);
    if (!course) return null;
    const widgets = Array.isArray(payload.w)
      ? payload.w.map(sanitizeSharedWidget).filter((x): x is Widget => x !== null)
      : [];
    return { course, widgets, partial: payload.partial === true };
  } catch {
    return null;
  }
}

/**
 * Slaat een gedeelde cursus + meegereisde widgets lokaal op (voor de
 * leerling die via een link opent). Bestaande widgets worden nooit
 * overschreven. Een gedeeltelijke link (enkele hoofdstukken) wordt per
 * hoofdstuk samengevoegd met de lokale kopie, zodat eerder gedeelde
 * hoofdstukken blijven bestaan.
 */
export function adoptSharedCourse(course: Course, widgets: Widget[], opts: { partial?: boolean; force?: boolean } = {}) {
  for (const w of widgets) {
    if (!getWidget(w.id)) saveWidget(w);
  }
  const existing = getCourse(course.id);
  if (!existing) {
    saveCourse(course);
    return;
  }
  if (opts.partial) {
    // Hoofdstukken uit de link vervangen hun lokale naamgenoot (op id) of
    // komen er achteraan bij; niet-gedeelde hoofdstukken blijven staan.
    const incoming = new Map(course.chapters.map((ch) => [ch.id, ch]));
    const merged: CourseChapter[] = existing.chapters.map((ch) => incoming.get(ch.id) ?? ch);
    for (const ch of course.chapters) {
      if (!existing.chapters.some((x) => x.id === ch.id)) merged.push(ch);
    }
    saveCourse({ ...course, chapters: merged });
    return;
  }
  if (opts.force || (course.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
    saveCourse(course);
  }
}

/**
 * Is dit een wezenlijk andere versie dan wat er lokaal staat? (Voor een
 * eerlijke bevestigingsvraag vóór overschrijven — een gedeelde link kan
 * door iedereen met de link nagemaakt worden.)
 */
export function sharedCourseDiffers(course: Course): boolean {
  const existing = getCourse(course.id);
  if (!existing) return false;
  const strip = (c: Course) => JSON.stringify({ ...c, updatedAt: 0, createdAt: 0 });
  return strip(existing) !== strip(course);
}

export function courseReadUrl(code: string): string {
  const base = location.origin + location.pathname;
  return `${base}#/cursus/lees/${code}`;
}

// ── Voortgangscode (leerling → leerkracht, zonder server) ───────────────────

export function encodeCourseProgress(progress: CourseProgress): string {
  return 'WFC1.' + LZString.compressToEncodedURIComponent(JSON.stringify(progress));
}

export function decodeCourseProgress(code: string): CourseProgress | null {
  try {
    const raw = code.trim();
    if (!raw.startsWith('WFC1.')) return null;
    const json = LZString.decompressFromEncodedURIComponent(raw.slice(5));
    if (!json) return null;
    const p = JSON.parse(json) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    if (typeof p.courseId !== 'string' || !p.courseId) return null;
    if (typeof p.studentName !== 'string' || !p.studentName.trim()) return null;
    // Secties defensief opbouwen: een geknutselde code (sections: null,
    // arrays, rommelvelden) mag de volgpagina nooit kunnen breken.
    const sections: Record<string, SectionProgress> = {};
    if (p.sections && typeof p.sections === 'object' && !Array.isArray(p.sections)) {
      for (const [sid, raw2] of Object.entries(p.sections as Record<string, unknown>)) {
        if (!raw2 || typeof raw2 !== 'object' || Array.isArray(raw2)) continue;
        const sp = raw2 as Record<string, unknown>;
        const checks: Record<string, string[]> = {};
        if (sp.checks && typeof sp.checks === 'object' && !Array.isArray(sp.checks)) {
          for (const [bid, items] of Object.entries(sp.checks as Record<string, unknown>)) {
            if (Array.isArray(items)) {
              checks[bid] = items.filter((x): x is string => typeof x === 'string');
            }
          }
        }
        sections[sid] = {
          openedAt: typeof sp.openedAt === 'number' ? sp.openedAt : Date.now(),
          completedAt: typeof sp.completedAt === 'number' ? sp.completedAt : undefined,
          secondsSpent: typeof sp.secondsSpent === 'number' && sp.secondsSpent >= 0 ? Math.min(sp.secondsSpent, 1e7) : 0,
          checks: Object.keys(checks).length ? checks : undefined,
        };
      }
    }
    return {
      courseId: p.courseId,
      courseCode: typeof p.courseCode === 'string' ? p.courseCode : '',
      studentName: p.studentName.trim().slice(0, 60),
      sections,
      lastSectionId: typeof p.lastSectionId === 'string' ? p.lastSectionId : undefined,
      lastSeenAt: typeof p.lastSeenAt === 'number' ? p.lastSeenAt : Date.now(),
      startedAt: typeof p.startedAt === 'number' ? p.startedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Binnengekomen voortgangscode samenvoegen met wat er al lokaal staat. */
export function importProgressCode(p: CourseProgress) {
  const existing = getStudentProgress(p.courseId, p.studentName);
  saveStudentProgress(existing ? mergeProgressRecords(existing, p) : p);
}

// ── JSON-export/-import & defensieve sanering ───────────────────────────────

export function exportCourseJson(course: Course): string {
  const widgets = referencedWidgetIds(course)
    .map((id) => getWidget(id))
    .filter((x): x is Widget => Boolean(x));
  return JSON.stringify({ app: 'widgetfabriek', kind: 'cursus', v: 1, course, widgets }, null, 2);
}

export function importCourseJson(json: string): { course: Course; widgets: Widget[] } | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    const course = sanitizeCourse(data.course ?? data.c ?? data);
    if (!course) return null;
    const widgets = Array.isArray(data.widgets ?? data.w)
      ? (data.widgets ?? data.w).map(sanitizeSharedWidget).filter((x: Widget | null): x is Widget => x !== null)
      : [];
    return { course, widgets };
  } catch {
    return null;
  }
}

const BLOCK_TYPES: CourseBlockType[] = [
  'heading', 'text', 'image', 'video', 'audio', 'embed', 'callout', 'quote',
  'divider', 'attachment', 'accordion', 'columns', 'table', 'terms', 'checklist', 'widget',
];

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function sanitizeBlock(raw: unknown): CourseBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const type = s(b.type) as CourseBlockType;
  if (!BLOCK_TYPES.includes(type)) return null;
  const id = s(b.id) || uid();
  switch (type) {
    case 'heading':
      return { id, type, text: s(b.text), level: b.level === 3 ? 3 : 2 };
    case 'text':
      return { id, type, markdown: s(b.markdown ?? b.text) };
    case 'image':
      return { id, type, url: s(b.url), caption: s(b.caption) || undefined, size: b.size === 'small' || b.size === 'wide' ? b.size : 'normal' };
    case 'video':
      return { id, type, url: s(b.url), caption: s(b.caption) || undefined };
    case 'audio':
      return { id, type, url: s(b.url), caption: s(b.caption) || undefined };
    case 'embed':
      return { id, type, url: s(b.url), height: typeof b.height === 'number' && b.height > 80 ? Math.min(b.height, 1200) : 420, title: s(b.title) || undefined };
    case 'callout':
      return { id, type, kind: b.kind === 'tip' || b.kind === 'warn' || b.kind === 'goal' ? b.kind : 'info', title: s(b.title) || undefined, text: s(b.text) };
    case 'quote':
      return { id, type, text: s(b.text), source: s(b.source) || undefined };
    case 'divider':
      return { id, type };
    case 'attachment':
      return { id, type, name: s(b.name) || 'bestand', dataUrl: s(b.dataUrl) };
    case 'accordion': {
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              const ii = it as Record<string, unknown>;
              const title = s(ii?.title).trim();
              const text = s(ii?.text);
              // Half-ingevuld item behouden: alleen weggooien als béíde velden leeg zijn.
              if (!title && !text.trim()) return null;
              return { id: s(ii?.id) || uid(), title: title || '—', text };
            })
            .filter((x): x is { id: string; title: string; text: string } => x !== null)
        : [];
      return items.length ? { id, type, items } : null;
    }
    case 'columns':
      return { id, type, left: s(b.left), right: s(b.right) };
    case 'table': {
      const rows = Array.isArray(b.rows)
        ? b.rows
            .filter((r): r is unknown[] => Array.isArray(r))
            .map((r) => r.map((cell) => s(cell)))
        : [];
      const width = Math.max(...rows.map((r) => r.length), 0);
      if (!rows.length || !width) return null;
      return { id, type, header: b.header !== false, rows: rows.map((r) => [...r, ...Array(width - r.length).fill('')]) };
    }
    case 'terms': {
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              const ii = it as Record<string, unknown>;
              const term = s(ii?.term).trim();
              const uitleg = s(ii?.uitleg);
              // Half-ingevuld begrip behouden: alleen weggooien als béíde velden leeg zijn.
              if (!term && !uitleg.trim()) return null;
              return { id: s(ii?.id) || uid(), term: term || '—', uitleg };
            })
            .filter((x): x is { id: string; term: string; uitleg: string } => x !== null)
        : [];
      return items.length ? { id, type, items } : null;
    }
    case 'checklist': {
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              const text = typeof it === 'string' ? it : s((it as Record<string, unknown>)?.text);
              return text.trim() ? { id: s((it as Record<string, unknown>)?.id) || uid(), text: text.trim() } : null;
            })
            .filter((x): x is { id: string; text: string } => x !== null)
        : [];
      return items.length ? { id, type, title: s(b.title) || undefined, items } : null;
    }
    case 'widget':
      return { id, type, widgetId: s(b.widgetId), note: s(b.note) || undefined };
  }
}

export function sanitizeCourse(raw: unknown): Course | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.chapters)) return null;
  const chapters: CourseChapter[] = c.chapters
    .map((chRaw): CourseChapter | null => {
      const ch = chRaw as Record<string, unknown>;
      if (!ch || typeof ch !== 'object') return null;
      const sections: CourseSection[] = Array.isArray(ch.sections)
        ? ch.sections
            .map((seRaw): CourseSection | null => {
              const se = seRaw as Record<string, unknown>;
              if (!se || typeof se !== 'object') return null;
              const blocks = Array.isArray(se.blocks)
                ? se.blocks.map(sanitizeBlock).filter((x): x is CourseBlock => x !== null)
                : [];
              return {
                id: s(se.id) || uid(),
                title: s(se.title).trim() || 'Sectie',
                blocks,
                goals: Array.isArray(se.goals) ? se.goals.filter((g): g is string => typeof g === 'string' && g.trim() !== '') : undefined,
                optional: se.optional === true,
              };
            })
            .filter((x): x is CourseSection => x !== null)
        : [];
      return {
        id: s(ch.id) || uid(),
        title: s(ch.title).trim() || 'Hoofdstuk',
        emoji: s(ch.emoji) || undefined,
        sections,
      };
    })
    .filter((x): x is CourseChapter => x !== null);
  if (!chapters.length) return null;

  const st = (c.settings && typeof c.settings === 'object' ? c.settings : {}) as Record<string, unknown>;
  return {
    id: s(c.id) || uid(),
    title: s(c.title).trim() || 'Cursus',
    subtitle: s(c.subtitle) || undefined,
    author: s(c.author),
    coverEmoji: s(c.coverEmoji) || '📘',
    code: s(c.code) || makeCode(),
    chapters,
    settings: {
      accentColor: s(st.accentColor) || '#4f46e5',
      requireName: st.requireName !== false,
      showProgressToStudent: st.showProgressToStudent !== false,
    },
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
  };
}

// ── Democursus (eerste kennismaking) ────────────────────────────────────────

export function ensureDemoCourse() {
  if (getCourses().length > 0) return;
  const demoWidget = getWidgets().find((w) => ['quiz', 'worksheet', 'exitticket', 'flashcards'].includes(w.type));
  const course = createCourse('Voorbeeldcursus: de waterkringloop');
  course.subtitle = 'Zo ziet een digitale cursus voor je leerlingen eruit';
  course.coverEmoji = '💧';
  course.chapters = [
    {
      id: uid(), title: 'Verdamping en wolken', emoji: '☁️',
      sections: [
        {
          id: uid(), title: 'Wat gebeurt er met water in de zon?',
          goals: ['Ik kan uitleggen wat verdamping is'],
          blocks: [
            { id: uid(), type: 'callout', kind: 'goal', title: 'Wat leer je hier?', text: 'Na deze pagina kan je uitleggen wat verdamping is en waar wolken vandaan komen.' },
            { id: uid(), type: 'text', markdown: 'De zon verwarmt het water in zeeën, rivieren en plassen. Een deel van dat water wordt **waterdamp**: onzichtbaar kleine druppeltjes die opstijgen in de lucht.\n\nDit proces heet **verdamping**. Hoe warmer het is, hoe sneller water verdampt.' },
            { id: uid(), type: 'terms', items: [
              { id: uid(), term: 'verdamping', uitleg: 'Water dat verandert in waterdamp (gas) door warmte.' },
              { id: uid(), term: 'condensatie', uitleg: 'Waterdamp die weer vloeibare druppels wordt, bv. in wolken.' },
            ] },
            { id: uid(), type: 'checklist', title: 'Check jezelf', items: [
              { id: uid(), text: 'Ik kan een voorbeeld van verdamping geven uit de keuken.' },
              { id: uid(), text: 'Ik weet waarom een wolk uit druppeltjes bestaat.' },
            ] },
          ],
        },
        {
          id: uid(), title: 'Oefen even',
          blocks: [
            { id: uid(), type: 'text', markdown: 'Test of je de begrippen al kent. Deze oefening staat *in* de cursus — je resultaat komt bij je leerkracht terecht.' },
            ...(demoWidget ? [{ id: uid(), type: 'widget', widgetId: demoWidget.id } as CourseBlock] : []),
          ],
        },
      ],
    },
    {
      id: uid(), title: 'Neerslag', emoji: '🌧️',
      sections: [
        {
          id: uid(), title: 'Van wolk tot regen',
          optional: true,
          blocks: [
            { id: uid(), type: 'text', markdown: 'Dit is een **verdiepingssectie** — ze telt niet mee voor "cursus afgewerkt". Handig voor uitbreidingsleerstof.' },
            { id: uid(), type: 'quote', text: 'Regen is gewoon een wolk die het niet meer houdt.', source: 'Een weerman' },
          ],
        },
      ],
    },
  ];
  saveCourse(course);
}
