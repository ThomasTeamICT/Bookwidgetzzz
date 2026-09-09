// ── Opslag van de leerstofmodule ────────────────────────────────────────────
//
// Zelfde aanpak als lib/courses.ts: alles in localStorage, media (foto's van
// cursusbladzijden) als verwijzing die de medialaag naar IndexedDB stuurt.
// Bewust eigen sleutels (wf.study.*) zodat leerstof los staat van het
// klasmateriaal — exporteren, wissen en back-uppen kan per onderdeel.

import type {
  ItemMastery, StudyGoal, StudyProgress, StudyQuestion, StudySession, StudyTerm, StudyTopic,
} from './studyTypes';
import { MAX_SESSIONS, emptyProgress } from './studyTypes';
import { uid } from './utils';
import { cleanupOrphanMedia, notifyChange, reportWriteFailure } from './storage';
import { collectMediaRefs, inlineMedia, parseWithMedia, stringifyWithMedia } from './mediaStore';

const TOPICS_KEY = 'wf.study.v1';
const PROGRESS_KEY = 'wf.studyprogress.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseWithMedia<T>(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  let ok = true;
  try {
    localStorage.setItem(key, stringifyWithMedia(value));
  } catch (e) {
    ok = false;
    reportWriteFailure(key, e);
  }
  notifyChange();
  return ok;
}

// ── Leerstofonderdelen ──────────────────────────────────────────────────────

export function getTopics(): StudyTopic[] {
  return read<StudyTopic[]>(TOPICS_KEY, []);
}

export function getTopic(id: string): StudyTopic | undefined {
  return getTopics().find((t) => t.id === id);
}

export function saveTopic(topic: StudyTopic): boolean {
  const all = getTopics();
  const i = all.findIndex((t) => t.id === topic.id);
  const updated = { ...topic, updatedAt: Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  return write(TOPICS_KEY, all);
}

export function deleteTopic(id: string) {
  const topic = getTopic(id);
  write(TOPICS_KEY, getTopics().filter((t) => t.id !== id));
  write(PROGRESS_KEY, getAllProgress().filter((p) => p.topicId !== id));
  // Foto's van dit onderdeel uit IndexedDB halen, tenzij een ander onderdeel
  // ze deelt (dupliceren kopieert bewust dezelfde verwijzing).
  if (topic) cleanupOrphanMedia(collectMediaRefs(stringifyWithMedia(topic)));
}

const DEFAULT_COLORS = ['#4f7df3', '#e2725b', '#3aa76d', '#8b5cf6', '#d97706', '#0e9aa7'];

export function createTopic(init: Partial<StudyTopic> = {}): StudyTopic {
  const now = Date.now();
  return {
    id: uid(),
    leerling: init.leerling ?? '',
    vak: init.vak ?? '',
    titel: init.titel ?? '',
    bron: init.bron,
    emoji: init.emoji ?? '📘',
    kleur: init.kleur ?? DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
    toetsDatum: init.toetsDatum,
    doelen: init.doelen ?? [],
    secties: init.secties ?? [],
    notaties: init.notaties ?? [],
    begrippen: init.begrippen ?? [],
    valkuilen: init.valkuilen ?? [],
    vragen: init.vragen ?? [],
    fotos: init.fotos ?? [],
    notitie: init.notitie,
    createdAt: now,
    updatedAt: now,
  };
}

/** Kopie met nieuwe id's — bv. om de leerstof van vorig jaar te hergebruiken. */
export function duplicateTopic(topic: StudyTopic): StudyTopic {
  const copy: StudyTopic = JSON.parse(JSON.stringify(topic));
  copy.id = uid();
  copy.titel = `${topic.titel} (kopie)`;
  copy.toetsDatum = undefined;
  copy.gearchiveerd = false;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  // Nieuwe id's: anders deelt de kopie haar voortgang met het origineel.
  copy.doelen = copy.doelen.map((d) => ({ ...d, id: uid() }));
  copy.vragen = copy.vragen.map((v) => ({ ...v, id: uid() }));
  copy.begrippen = copy.begrippen.map((b) => ({ ...b, id: uid() }));
  copy.secties = copy.secties.map((s) => ({ ...s, id: uid() }));
  copy.notaties = copy.notaties.map((n) => ({ ...n, id: uid() }));
  copy.valkuilen = copy.valkuilen.map((v) => ({ ...v, id: uid() }));
  copy.fotos = copy.fotos.map((f) => ({ ...f, id: uid() }));
  return copy;
}

// ── Voortgang ───────────────────────────────────────────────────────────────

export function getAllProgress(): StudyProgress[] {
  return read<StudyProgress[]>(PROGRESS_KEY, []);
}

export function getProgress(topicId: string): StudyProgress {
  return getAllProgress().find((p) => p.topicId === topicId) ?? emptyProgress(topicId);
}

export function saveProgress(progress: StudyProgress): boolean {
  const all = getAllProgress();
  const i = all.findIndex((p) => p.topicId === progress.topicId);
  if (i >= 0) all[i] = progress;
  else all.push(progress);
  return write(PROGRESS_KEY, all);
}

function updateProgress(topicId: string, fn: (p: StudyProgress) => StudyProgress) {
  saveProgress(fn(getProgress(topicId)));
}

/** Doel aan- of afvinken. */
export function toggleGoal(topicId: string, goalId: string, checked: boolean) {
  updateProgress(topicId, (p) => ({
    ...p,
    doelen: checked ? [...new Set([...p.doelen, goalId])] : p.doelen.filter((id) => id !== goalId),
    laatstGestudeerd: Date.now(),
  }));
}

function bump(stand: ItemMastery | undefined, goed: boolean): ItemMastery {
  const base = stand ?? { goed: 0, fout: 0, gekend: false, laatst: 0 };
  return {
    goed: base.goed + (goed ? 1 : 0),
    fout: base.fout + (goed ? 0 : 1),
    // "Gekend" volgt altijd de laatste beurt: wie het nu niet wist, weet het niet.
    gekend: goed,
    laatst: Date.now(),
  };
}

/** Eén overhoorde vraag of begrip bijwerken. */
export function recordAnswer(topicId: string, soort: 'vragen' | 'begrippen', itemId: string, goed: boolean) {
  updateProgress(topicId, (p) => ({
    ...p,
    [soort]: { ...p[soort], [itemId]: bump(p[soort][itemId], goed) },
    laatstGestudeerd: Date.now(),
  }));
}

/** Een afgeronde overhoorbeurt bewaren (voor de trend op de studeerpagina). */
export function recordSession(topicId: string, sessie: StudySession) {
  updateProgress(topicId, (p) => ({
    ...p,
    sessies: [sessie, ...p.sessies].slice(0, MAX_SESSIONS),
    laatstGestudeerd: sessie.at,
  }));
}

/** Alles opnieuw beginnen voor dit onderdeel (voortgang, niet de leerstof). */
export function resetProgress(topicId: string) {
  saveProgress(emptyProgress(topicId));
}

// ── Exporteren en importeren ────────────────────────────────────────────────

interface TopicPayload {
  v: 1;
  kind: 'leerstof';
  t: StudyTopic;
}

/**
 * Eén onderdeel als json-bestand. Foto's reizen als data-URL mee, zodat het
 * bestand ook op een ander toestel volledig is (zie mediaStore.inlineMedia).
 */
export async function exportTopicJson(topic: StudyTopic): Promise<string> {
  const payload: TopicPayload = await inlineMedia({ v: 1, kind: 'leerstof', t: topic });
  return JSON.stringify(payload, null, 2);
}

/** Alle onderdelen samen (back-up van de hele leerstofmodule). */
export async function exportAllTopicsJson(topics: StudyTopic[]): Promise<string> {
  const payload = await inlineMedia({ v: 1, kind: 'leerstof-bundel', t: topics });
  return JSON.stringify(payload, null, 2);
}

function sanitizeList<T extends { id: string }>(raw: unknown, keep: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const clean = keep(item as Record<string, unknown>);
    if (clean) out.push(clean);
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/** Een binnengekomen onderdeel defensief opschonen: onbekende velden weg, id's gegarandeerd. */
export function sanitizeTopic(raw: unknown): StudyTopic | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (!str(t.titel).trim()) return null;
  const base = createTopic();
  return {
    ...base,
    id: str(t.id) || base.id,
    leerling: str(t.leerling),
    vak: str(t.vak),
    titel: str(t.titel),
    bron: optStr(t.bron),
    emoji: str(t.emoji) || base.emoji,
    kleur: /^#[0-9a-f]{6}$/i.test(str(t.kleur)) ? str(t.kleur) : base.kleur,
    toetsDatum: optStr(t.toetsDatum),
    gearchiveerd: t.gearchiveerd === true,
    doelen: sanitizeList<StudyGoal>(t.doelen, (d) =>
      str(d.tekst).trim() ? { id: str(d.id) || uid(), tekst: str(d.tekst) } : null),
    secties: sanitizeList(t.secties, (s) =>
      str(s.titel).trim() || str(s.markdown).trim()
        ? {
            id: str(s.id) || uid(),
            titel: str(s.titel),
            markdown: str(s.markdown),
            figuur: ['spiegeling', 'translatie', 'rotatie', 'puntspiegeling'].includes(str(s.figuur))
              ? (s.figuur as StudyTopic['secties'][number]['figuur'])
              : undefined,
            todo: s.todo === true,
          }
        : null),
    notaties: sanitizeList(t.notaties, (n) =>
      str(n.symbool).trim() ? { id: str(n.id) || uid(), symbool: str(n.symbool), betekenis: str(n.betekenis) } : null),
    begrippen: sanitizeList<StudyTerm>(t.begrippen, (b) =>
      str(b.term).trim() ? { id: str(b.id) || uid(), term: str(b.term), uitleg: str(b.uitleg) } : null),
    valkuilen: sanitizeList(t.valkuilen, (v) =>
      str(v.tekst).trim() ? { id: str(v.id) || uid(), tekst: str(v.tekst) } : null),
    vragen: sanitizeList<StudyQuestion>(t.vragen, (v) =>
      str(v.vraag).trim()
        ? {
            id: str(v.id) || uid(),
            vraag: str(v.vraag),
            antwoord: str(v.antwoord),
            uitleg: optStr(v.uitleg),
            bron: optStr(v.bron),
          }
        : null),
    fotos: sanitizeList(t.fotos, (f) =>
      str(f.url).trim() ? { id: str(f.id) || uid(), url: str(f.url), bijschrift: optStr(f.bijschrift) } : null),
    notitie: optStr(t.notitie),
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : base.createdAt,
    updatedAt: Date.now(),
  };
}

/** Bestand inlezen: één onderdeel of een bundel. Geeft null bij onbruikbare inhoud. */
export function importTopicsJson(text: string): StudyTopic[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const payload = parsed as Record<string, unknown>;
  const rows = Array.isArray(payload.t) ? payload.t : [payload.t];
  const topics = rows.map(sanitizeTopic).filter((t): t is StudyTopic => t !== null);
  return topics.length ? topics : null;
}

/** Onderdelen overnemen; bestaande id's worden vervangen. */
export function adoptTopics(topics: StudyTopic[]) {
  const all = getTopics();
  for (const topic of topics) {
    const i = all.findIndex((t) => t.id === topic.id);
    if (i >= 0) all[i] = topic;
    else all.unshift(topic);
  }
  write(TOPICS_KEY, all);
}
