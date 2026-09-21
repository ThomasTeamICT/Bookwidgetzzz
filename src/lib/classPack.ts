// ── Klaspakket: één link (of één bestand) met alles erin ────────────────────
//
// De leerkracht deelt zijn klas in één keer: de klaslijst, de opdrachten én
// de inhoud van die opdrachten (cursussen met hun ingebedde widgets, losse
// widgets). De leerling opent de link op eender welk toestel, kiest zijn naam
// uit de lijst en kan meteen werken — zonder server, zonder account.
//
// Vorm van de payload (bewust Nederlandstalig, net als de andere deelvormen):
//   { v: 1, kind: 'klas', klas: {...}, opdrachten: [{ ...opdracht, course?, widgets?, widget? }] }
//
// De klas van een leerling komt NIET in de leerkrachtlijst terecht: die staat
// apart onder 'wf.classpacks.v1'. Zo blijft "Mijn klassen" van de leerkracht
// schoon, ook wanneer hij zelf eens een pakket opent om te testen.

import LZString from 'lz-string';
import type { Assignment, ClassGroup } from './classTypes';
import type { Course } from './courseTypes';
import { referencedWidgetIds } from './courseTypes';
import type { Widget } from './types';
import { assignmentsForClass, getClassByCode, sanitizeAssignment, sanitizeClass } from './classes';
import { adoptSharedCourse, getCourse, sanitizeCourse } from './courses';
import { getWidget, notifyChange, reportWriteFailure, saveWidget } from './storage';
import { countUnresolvedMedia, inlineMedia } from './mediaStore';
import { sanitizeSharedWidget } from './share';

const PACKS_KEY = 'wf.classpacks.v1';

/** Boven deze linklengte heeft een QR-code geen zin meer (scanners haken af). */
export { QR_MAX_CHARS } from './qrLimits';

export interface PackAssignment extends Assignment {
  /** Cursus bij een cursusopdracht. */
  course?: Course;
  /** De widgets die in die cursus ingebed zitten. */
  widgets?: Widget[];
  /** Widget bij een widgetopdracht. */
  widget?: Widget;
}

export interface ClassPack {
  v: 1;
  kind: 'klas';
  klas: ClassGroup;
  opdrachten: PackAssignment[];
}

// ── Maken ───────────────────────────────────────────────────────────────────

/**
 * Bouwt het pakket op uit wat er op dít toestel staat. Ontbrekende cursussen
 * of widgets worden stil overgeslagen: de opdracht reist dan mee zonder
 * inhoud, en de leerling ziet netjes "staat niet op dit toestel".
 * Async: media staan in IndexedDB en moeten als data-URL mee (lib/mediaStore).
 */
export async function buildClassPack(cls: ClassGroup, assignments: Assignment[]): Promise<ClassPack> {
  const opdrachten: PackAssignment[] = assignments.map((a) => {
    if (a.kind === 'course') {
      const course = getCourse(a.targetId);
      if (!course) return { ...a };
      const widgets = referencedWidgetIds(course)
        .map((id) => getWidget(id))
        .filter((w): w is Widget => Boolean(w));
      return { ...a, course, widgets };
    }
    const widget = getWidget(a.targetId);
    return widget ? { ...a, widget } : { ...a };
  });
  return inlineMedia<ClassPack>({ v: 1, kind: 'klas', klas: cls, opdrachten });
}

export interface EncodedClassPack {
  url: string;
  /** Media die niet mee konden (blob niet op dit toestel). */
  unresolved: number;
  /** Lengte van de link — bepaalt of een QR-code nog kan. */
  length: number;
  pack: ClassPack;
}

export async function encodeClassPackToUrl(cls: ClassGroup, assignments: Assignment[]): Promise<EncodedClassPack> {
  const pack = await buildClassPack(cls, assignments);
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(pack));
  const base = typeof location !== 'undefined' ? location.origin + location.pathname : '';
  const url = `${base}#/klas/open?d=${compressed}`;
  return { url, unresolved: countUnresolvedMedia(pack), length: url.length, pack };
}

/** Downloadbaar bestand met hetzelfde pakket (voor trage of te lange links). */
export function classPackToJson(pack: ClassPack): string {
  return JSON.stringify({ app: 'boosterz', ...pack }, null, 2);
}

export function classPackFileName(cls: ClassGroup): string {
  const safe = cls.name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').toLowerCase() || 'klas';
  return `${safe}.klaspakket.json`;
}

// ── Lezen ───────────────────────────────────────────────────────────────────

function sanitizePack(raw: unknown): ClassPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.kind !== 'klas') return null;
  const klas = sanitizeClass(p.klas);
  if (!klas) return null;
  const opdrachten: PackAssignment[] = [];
  if (Array.isArray(p.opdrachten)) {
    for (const rawA of p.opdrachten as unknown[]) {
      // classId van de opdracht altijd op de klas uit hetzelfde pakket zetten:
      // een geknutseld pakket mag geen opdrachten aan een andere klas hangen.
      const base = sanitizeAssignment({ ...(rawA as object), classId: klas.id });
      if (!base) continue;
      const extra = rawA as Record<string, unknown>;
      const item: PackAssignment = { ...base };
      if (base.kind === 'course') {
        const course = extra.course ? sanitizeCourse(extra.course) : null;
        if (course) {
          item.course = course;
          item.widgets = Array.isArray(extra.widgets)
            ? (extra.widgets as unknown[]).map(sanitizeSharedWidget).filter((w): w is Widget => w !== null)
            : [];
          // De opdracht wijst naar de cursus zoals ze in het pakket zit.
          item.targetId = course.id;
        }
      } else {
        const widget = extra.widget ? sanitizeSharedWidget(extra.widget) : null;
        if (widget) {
          item.widget = widget;
          item.targetId = widget.id;
        }
      }
      opdrachten.push(item);
    }
  }
  return { v: 1, kind: 'klas', klas, opdrachten };
}

export function decodeClassPack(d: string): ClassPack | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(d);
    if (!json) return null;
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || (payload as Record<string, unknown>).v !== 1) return null;
    return sanitizePack(payload);
  } catch {
    return null;
  }
}

export function importClassPackJson(json: string): ClassPack | null {
  try {
    return sanitizePack(JSON.parse(json));
  } catch {
    return null;
  }
}

// ── Overnemen op het leerlingtoestel ────────────────────────────────────────

export interface AdoptReport {
  courses: number;
  widgets: number;
  assignments: number;
}

/**
 * Bewaart de inhoud van het pakket lokaal: cursussen (met hun widgets) via de
 * bestaande sanering van de cursusmodule, losse widgets via saveWidget —
 * bestaande widgets worden nooit overschreven. De klas zelf komt in de
 * leerlingopslag ('wf.classpacks.v1'), niet in de klassenlijst van de
 * leerkracht.
 */
export function adoptClassPack(pack: ClassPack): AdoptReport {
  const report: AdoptReport = { courses: 0, widgets: 0, assignments: pack.opdrachten.length };
  for (const a of pack.opdrachten) {
    if (a.course) {
      adoptSharedCourse(a.course, a.widgets ?? [], {});
      report.courses++;
      report.widgets += a.widgets?.length ?? 0;
      continue;
    }
    if (a.widget) {
      if (!getWidget(a.widget.id)) saveWidget(a.widget);
      report.widgets++;
    }
  }
  saveClassPack(pack);
  return report;
}

// ── Opslag van overgenomen klassen (leerlingzijde) ──────────────────────────

/** Wat er van een pakket lokaal bijblijft: de klas en de kale opdrachten. */
export interface StoredClassPack {
  klas: ClassGroup;
  opdrachten: Assignment[];
  adoptedAt: number;
}

function readPacks(): StoredClassPack[] {
  try {
    const raw = localStorage.getItem(PACKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: StoredClassPack[] = [];
    for (const item of parsed as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const klas = sanitizeClass(rec.klas);
      if (!klas) continue;
      const opdrachten = Array.isArray(rec.opdrachten)
        ? (rec.opdrachten as unknown[])
            .map((a) => sanitizeAssignment({ ...(a as object), classId: klas.id }))
            .filter((a): a is Assignment => a !== null)
        : [];
      out.push({
        klas,
        opdrachten,
        adoptedAt: typeof rec.adoptedAt === 'number' ? rec.adoptedAt : Date.now(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function writePacks(list: StoredClassPack[]) {
  try {
    localStorage.setItem(PACKS_KEY, JSON.stringify(list));
  } catch (e) {
    reportWriteFailure(PACKS_KEY, e);
  }
  notifyChange();
}

/** Klas + opdrachten uit een pakket bewaren (vervangt een eerdere versie). */
export function saveClassPack(pack: ClassPack) {
  const kale: Assignment[] = pack.opdrachten.map(({ course: _c, widgets: _w, widget: _wg, ...rest }) => rest);
  const others = readPacks().filter((p) => p.klas.id !== pack.klas.id && p.klas.code !== pack.klas.code);
  writePacks([{ klas: pack.klas, opdrachten: kale, adoptedAt: Date.now() }, ...others]);
}

export function getClassPacks(): StoredClassPack[] {
  return readPacks();
}

export function getClassPackByCode(code: string): StoredClassPack | undefined {
  const c = code.trim().toUpperCase();
  return readPacks().find((p) => p.klas.code.toUpperCase() === c);
}

export function deleteClassPack(classId: string) {
  writePacks(readPacks().filter((p) => p.klas.id !== classId));
}

// ── Wat de leerlinghub nodig heeft ──────────────────────────────────────────

export interface StudentClassView {
  cls: ClassGroup;
  assignments: Assignment[];
  /** true = via een klaspakket binnengekomen, false = klas van dit (leerkracht)toestel. */
  fromPack: boolean;
}

/**
 * De klas achter een klascode, waar ze ook vandaan komt: van de leerkracht op
 * dit toestel, of uit een overgenomen klaspakket.
 */
export function findStudentClass(code: string): StudentClassView | null {
  const own = getClassByCode(code);
  if (own) return { cls: own, assignments: assignmentsForClass(own.id), fromPack: false };
  const pack = getClassPackByCode(code);
  if (pack) {
    return {
      cls: pack.klas,
      assignments: pack.opdrachten.slice().sort((a, b) => b.createdAt - a.createdAt),
      fromPack: true,
    };
  }
  return null;
}
