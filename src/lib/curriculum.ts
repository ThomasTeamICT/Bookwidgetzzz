// ── Opslag van leerplannen (wf.curricula.v1) ────────────────────────────────
// Basis-CRUD en opzoekhulpen. Uitgebreidere logica (AI-structurering, import
// uit pdf/tekst, dekking) staat in aiCurriculum.ts en de leerplanpagina.

import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { notifyChange, reportWriteFailure } from './storage';
import { uid } from './utils';

const KEY = 'wf.curricula.v1';

function read(): Curriculum[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Curriculum[]).filter((c) => c && typeof c === 'object' && Array.isArray(c.goals)) : [];
  } catch {
    return [];
  }
}

function write(list: Curriculum[]): boolean {
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    ok = false;
    reportWriteFailure(KEY, e);
  }
  notifyChange();
  return ok;
}

export function getCurricula(): Curriculum[] {
  return read();
}
export function getCurriculum(id: string): Curriculum | undefined {
  return read().find((c) => c.id === id);
}
export function saveCurriculum(cur: Curriculum): boolean {
  const all = read();
  const i = all.findIndex((c) => c.id === cur.id);
  const updated = { ...cur, updatedAt: Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  return write(all);
}
export function deleteCurriculum(id: string) {
  write(read().filter((c) => c.id !== id));
}

export function createCurriculum(init: Partial<Curriculum> & Pick<Curriculum, 'title' | 'net' | 'subject' | 'level'>): Curriculum {
  return {
    id: uid(),
    goals: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...init,
  };
}

/** Doelcode normaliseren voor vergelijking: spaties samenvouwen, hoofdletters. */
export function normalizeGoalCode(code: string): string {
  return code.trim().replace(/\s+/g, ' ').toUpperCase();
}

export interface GoalOption {
  curriculumId: string;
  curriculumTitle: string;
  goal: CurriculumGoal;
}

/** Alle doelen van alle leerplannen, voor keuzelijsten en autocomplete. */
export function allGoalOptions(curriculumId?: string): GoalOption[] {
  const out: GoalOption[] = [];
  for (const cur of read()) {
    if (curriculumId && cur.id !== curriculumId) continue;
    for (const goal of cur.goals) out.push({ curriculumId: cur.id, curriculumTitle: cur.title, goal });
  }
  return out;
}

/** Doel opzoeken op code (in één leerplan, of over alle leerplannen heen). */
export function findGoalByCode(code: string, curriculumId?: string): GoalOption | undefined {
  const want = normalizeGoalCode(code);
  return allGoalOptions(curriculumId).find((o) => normalizeGoalCode(o.goal.code) === want);
}

/** Korte weergave "WIS 2.3 — De leerlingen kunnen …" (afgekapt). */
export function goalLabel(code: string, curriculumId?: string, maxChars = 90): string {
  const hit = findGoalByCode(code, curriculumId);
  if (!hit) return code;
  const t = hit.goal.text.length > maxChars ? hit.goal.text.slice(0, maxChars - 1) + '…' : hit.goal.text;
  return `${hit.goal.code} — ${t}`;
}
