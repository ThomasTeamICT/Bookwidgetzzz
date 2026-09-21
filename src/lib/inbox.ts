// ── Inleverpunt: resultaat- en voortgangscodes verwerken ────────────────────
//
// Leerlingen die op hun eigen toestel werkten, dragen hun werk terug met een
// code: WF1.… voor een inzending, WFC1.… voor leesvoortgang. De leerkracht
// plakt er tientallen tegelijk (of scant ze met de camera, zie
// components/QrScanner). Deze module is de pure logica daarachter: splitsen,
// decoderen, ontdubbelen, koppelen aan een klaslijst en per code eerlijk
// rapporteren wat ermee gebeurde.
//
// Alles loopt via een `InboxDeps`-object, zodat de verwerking testbaar is
// zonder browseropslag. `defaultInboxDeps()` hangt het aan de echte opslag.

import LZString from 'lz-string';
import type { ClassGroup } from './classTypes';
import type { Course, CourseProgress } from './courseTypes';
import type { Submission, Widget } from './types';
import { decodeSubmission } from './share';
import {
  decodeCourseProgress, getCourse, getCourseByCode, getStudentProgress, importProgressCode,
} from './courses';
import { getSubmissions, getWidget, getWidgetByCode, saveSubmission } from './storage';
import { getClasses, normalizeName } from './classes';
import { submissionDupKey } from './progressTransfer';
import { uid } from './utils';

export type InboxOutcome = 'nieuw' | 'dubbel' | 'onbekend' | 'ongeldig';

export interface InboxRow {
  /** Volgnummer binnen deze plak-/scanbeurt (1-based). */
  index: number;
  outcome: InboxOutcome;
  kind: 'widget' | 'course' | null;
  /** Is het werk bewaard? (ook bij een onbekende widget bewaren we het) */
  saved: boolean;
  studentName: string;
  /** Klas waarin deze leerling herkend werd, of null. */
  className: string | null;
  /** Titel van de widget/cursus, of null als die niet op dit toestel staat. */
  title: string | null;
  /** "14/20 · 70%" of "60% gelezen". */
  detail: string;
  /** Uitleg bij dubbel/onbekend/ongeldig. */
  message: string;
  /** Begin van de code, om een regel te herkennen. */
  code: string;
  at: number | null;
}

export interface InboxReport {
  rows: InboxRow[];
  nieuw: number;
  dubbel: number;
  onbekend: number;
  ongeldig: number;
}

export interface InboxDeps {
  /** Alle klassen, om studentId/classId aan een naam te koppelen. */
  classes: ClassGroup[];
  /** Bestaande inzendingen (voor ontdubbeling). */
  submissions: Submission[];
  findWidget(sub: Submission): Widget | undefined;
  findCourse(p: CourseProgress): Course | undefined;
  /** Bestaande leesvoortgang van deze leerling voor deze cursus. */
  findProgress(courseId: string, studentName: string): CourseProgress | undefined;
  saveSubmission(sub: Submission): void;
  saveProgress(p: CourseProgress): void;
  /** Nieuw id voor een inzending waarvan het id hier al bestaat. */
  newId(): string;
}

/** Deps die op de echte opslag van dit toestel werken. */
export function defaultInboxDeps(): InboxDeps {
  return {
    classes: getClasses(),
    submissions: getSubmissions(),
    findWidget: (sub) => getWidget(sub.widgetId) ?? (sub.widgetCode ? getWidgetByCode(sub.widgetCode) : undefined),
    findCourse: (p) => getCourse(p.courseId) ?? (p.courseCode ? getCourseByCode(p.courseCode) : undefined),
    findProgress: (courseId, studentName) => getStudentProgress(courseId, studentName),
    saveSubmission,
    saveProgress: importProgressCode,
    newId: uid,
  };
}

/**
 * Voortgangscode lezen én de klas-/leerlingidentiteit terughalen.
 * `decodeCourseProgress` (lib/courses.ts) saneert de voortgang streng en laat
 * daarbij classId/studentId vallen; net die twee maken het verschil tussen
 * "een zekere Emma" en "Emma uit 1A". We lezen ze daarom apart terug uit
 * dezelfde code — defensief, want een geknutselde code mag niets breken.
 */
export function decodeProgressCode(code: string): CourseProgress | null {
  const p = decodeCourseProgress(code);
  if (!p) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(code.trim().slice(5));
    const raw: unknown = json ? JSON.parse(json) : null;
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (typeof r.classId === 'string' && r.classId) p.classId = r.classId;
      if (typeof r.studentId === 'string' && r.studentId) p.studentId = r.studentId;
    }
  } catch {
    // genegeerd: de gesaneerde voortgang zelf is al bruikbaar
  }
  return p;
}

/**
 * Codes uit een geplakte tekst halen. Alles wat op witruimte gescheiden staat
 * telt mee; omringende leestekens en aanhalingstekens (uit een chatbericht of
 * mail) gaan eraf. Alleen echte codes blijven over — begeleidende tekst
 * ("Hier is mijn code:") verdwijnt dus niet stilletjes als "ongeldig".
 */
export function splitCodes(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^["'“”„«»(<[{]+/, '').replace(/["'“”„«»)>\]}.,;:]+$/, '').trim();
    if (!token) continue;
    const at = token.search(/WFC?1\./);
    if (at < 0) continue;
    out.push(token.slice(at));
  }
  return out;
}

/** Aantal afgewerkte secties in een voortgangsrecord. */
function completedSections(p: CourseProgress): number {
  return Object.values(p.sections).filter((s) => s.completedAt).length;
}

function progressDetail(p: CourseProgress, course: Course | undefined): string {
  const done = completedSections(p);
  const total = course
    ? course.chapters.reduce((a, ch) => a + ch.sections.filter((s) => !s.optional).length, 0)
    : 0;
  if (total > 0) return `${Math.round((done / total) * 100)}% gelezen (${done}/${total} secties)`;
  return `${done} ${done === 1 ? 'sectie' : 'secties'} gelezen`;
}

/** Leerling en klas opzoeken op id (of op naam) voor een nette regel. */
function describeStudent(
  entry: { classId?: string; studentId?: string; studentName: string },
  classes: ClassGroup[]
): { studentName: string; className: string | null } {
  const cls =
    (entry.classId ? classes.find((c) => c.id === entry.classId) : undefined) ??
    (entry.studentId ? classes.find((c) => c.students.some((s) => s.id === entry.studentId)) : undefined);
  if (!cls) return { studentName: entry.studentName.trim() || 'Anoniem', className: null };
  const student =
    (entry.studentId ? cls.students.find((s) => s.id === entry.studentId) : undefined) ??
    cls.students.find((s) => normalizeName(s.name) === normalizeName(entry.studentName));
  return {
    studentName: student?.name ?? entry.studentName.trim() ?? 'Anoniem',
    className: cls.name,
  };
}

/**
 * Verwerkt alle codes uit een geplakte tekst. Elke code levert één regel op;
 * dubbels worden herkend tegenover de bestaande opslag én binnen dezelfde
 * beurt (zelfde widget, naam en indienmoment — zie lib/progressTransfer).
 * Werk voor een widget of cursus die hier niet staat, wordt wél bewaard: het
 * is werk van een leerling, dat gooien we nooit weg.
 */
export function processCodes(text: string, deps: InboxDeps = defaultInboxDeps()): InboxReport {
  const report: InboxReport = { rows: [], nieuw: 0, dubbel: 0, onbekend: 0, ongeldig: 0 };
  const seenSubs = new Set(
    deps.submissions.map((s) => submissionDupKey(s.widgetId, s.studentName, s.submittedAt))
  );
  const existingIds = new Set(deps.submissions.map((s) => s.id));
  const seenProgress = new Map<string, number>();

  let index = 0;
  for (const code of splitCodes(text)) {
    index++;
    const short = code.length > 26 ? code.slice(0, 26) + '…' : code;
    const row: InboxRow = {
      index,
      outcome: 'ongeldig',
      kind: null,
      saved: false,
      studentName: '',
      className: null,
      title: null,
      detail: '',
      message: '',
      code: short,
      at: null,
    };

    const sub = code.startsWith('WF1.') ? decodeSubmission(code) : null;
    const prog = !sub && code.startsWith('WFC1.') ? decodeProgressCode(code) : null;

    if (sub) {
      row.kind = 'widget';
      const widget = deps.findWidget(sub);
      const who = describeStudent(sub, deps.classes);
      row.studentName = who.studentName;
      row.className = who.className;
      row.title = widget?.title ?? null;
      row.at = sub.submittedAt;
      row.detail =
        sub.totalMax > 0
          ? `${sub.totalEarned}/${sub.totalMax} · ${Math.round((sub.totalEarned / sub.totalMax) * 100)}%`
          : 'geen score bij deze opdracht';

      const key = submissionDupKey(widget?.id ?? sub.widgetId, sub.studentName, sub.submittedAt);
      if (seenSubs.has(key)) {
        row.outcome = 'dubbel';
        row.message = 'Stond hier al — niets toegevoegd.';
        report.dubbel++;
        report.rows.push(row);
        continue;
      }
      seenSubs.add(key);
      const stored: Submission = {
        ...sub,
        id: existingIds.has(sub.id) ? deps.newId() : sub.id,
        // Het id van de widget op dít toestel wint: de leerling kan de widget
        // via een draagbare link gekregen hebben met een ander id.
        widgetId: widget?.id ?? sub.widgetId,
      };
      existingIds.add(stored.id);
      deps.saveSubmission(stored);
      row.saved = true;
      if (!widget) {
        row.outcome = 'onbekend';
        row.message = 'Bewaard, maar deze widget staat niet op dit toestel — importeer ze om het resultaat te zien.';
        report.onbekend++;
      } else {
        row.outcome = 'nieuw';
        report.nieuw++;
      }
      report.rows.push(row);
      continue;
    }

    if (prog) {
      row.kind = 'course';
      const course = deps.findCourse(prog);
      const who = describeStudent(prog, deps.classes);
      row.studentName = who.studentName;
      row.className = who.className;
      row.title = course?.title ?? null;
      row.at = prog.lastSeenAt;
      row.detail = progressDetail(prog, course);

      const batchKey = `${prog.courseId}::${normalizeName(prog.studentName)}`;
      const existing = deps.findProgress(prog.courseId, prog.studentName);
      const eerderGezien = seenProgress.get(batchKey) ?? 0;
      const niets =
        (!!existing &&
          existing.lastSeenAt >= prog.lastSeenAt &&
          completedSections(existing) >= completedSections(prog)) ||
        eerderGezien >= prog.lastSeenAt;
      if (niets) {
        row.outcome = 'dubbel';
        row.message = 'Deze voortgang stond hier al — niets bijgewerkt.';
        report.dubbel++;
        report.rows.push(row);
        continue;
      }
      seenProgress.set(batchKey, prog.lastSeenAt);
      deps.saveProgress(prog);
      row.saved = true;
      if (!course) {
        row.outcome = 'onbekend';
        row.message = 'Bewaard, maar deze cursus staat niet op dit toestel — neem ze over om de voortgang te zien.';
        report.onbekend++;
      } else {
        row.outcome = 'nieuw';
        report.nieuw++;
      }
      report.rows.push(row);
      continue;
    }

    row.message = code.startsWith('WF1.') || code.startsWith('WFC1.')
      ? 'Deze code is onvolledig of beschadigd (afgebroken bij het kopiëren?).'
      : 'Dit lijkt geen resultaat- of voortgangscode.';
    report.ongeldig++;
    report.rows.push(row);
  }

  return report;
}

/** Korte samenvatting voor een toast of aria-live-melding. */
export function summarizeReport(report: InboxReport): string {
  if (report.rows.length === 0) return 'Geen codes gevonden.';
  const parts = [`${report.nieuw} nieuw`];
  if (report.dubbel) parts.push(`${report.dubbel} al aanwezig`);
  if (report.onbekend) parts.push(`${report.onbekend} zonder widget of cursus hier`);
  if (report.ongeldig) parts.push(`${report.ongeldig} ongeldig`);
  return parts.join(', ');
}

/** Alleen voor de scanner: hoort deze tekst er überhaupt uit te zien als code? */
export function looksLikeCode(text: string): boolean {
  return /WFC?1\./.test(text);
}
