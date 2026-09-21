// ── Wie ben ik? (leerlingtoestel) ───────────────────────────────────────────
//
// Bewust een piepklein bestand zonder afhankelijkheden: de speler
// (/speel/:code, hoofdbundel) moet weten of er een klasidentiteit is, maar mag
// daarvoor niet de hele klassen- en cursusmodule binnenhalen.

import type { StudentContext } from './classTypes';
import { notifyChange, reportWriteFailure } from './storage';

const STUDENT_KEY = 'wf.student.v1';
/** Codes die de leerling al aan de leerkracht doorgaf (alleen op dit toestel). */
const HANDED_KEY = 'wf.handed.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  let ok = true;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    ok = false;
    reportWriteFailure(key, e);
  }
  notifyChange();
  return ok;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function getStudentContext(): StudentContext | null {
  const raw = readJson<Record<string, unknown> | null>(STUDENT_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const ctx: StudentContext = {
    classId: str(raw.classId),
    classCode: str(raw.classCode).toUpperCase(),
    className: str(raw.className),
    studentId: str(raw.studentId),
    studentName: str(raw.studentName),
  };
  if (!ctx.classCode || !ctx.studentName) return null;
  return ctx;
}

export function setStudentContext(ctx: StudentContext): boolean {
  return writeJson(STUDENT_KEY, ctx);
}

export function clearStudentContext() {
  try {
    localStorage.removeItem(STUDENT_KEY);
  } catch {
    // genegeerd: zonder opslag is er ook niets te wissen
  }
  notifyChange();
}

// ── Doorgegeven codes (leerlingzijde) ───────────────────────────────────────

/**
 * De leerling vinkt zelf af welke resultaat-/voortgangscode al bij de
 * leerkracht geraakte (gescand of gekopieerd). Puur lokaal comfort: het
 * voorkomt dat hij dezelfde code tien keer laat scannen.
 */
export function handedOverKeys(): string[] {
  const raw = readJson<unknown>(HANDED_KEY, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function isHandedOver(key: string): boolean {
  return handedOverKeys().includes(key);
}

export function markHandedOver(key: string) {
  const all = handedOverKeys();
  if (all.includes(key)) return;
  // hoogstens de laatste 300 onthouden: het is een comfortlijstje, geen archief
  writeJson(HANDED_KEY, [...all, key].slice(-300));
}

export function unmarkHandedOver(key: string) {
  writeJson(HANDED_KEY, handedOverKeys().filter((k) => k !== key));
}
