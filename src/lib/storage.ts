import type { Folder, Submission, Widget } from './types';

// ── Eenvoudige localStorage-laag met change-events ──────────────────────────

const KEYS = {
  widgets: 'wf.widgets.v1',
  folders: 'wf.folders.v1',
  submissions: 'wf.submissions.v1',
  prefs: 'wf.prefs.v1',
  attempts: 'wf.attempts.v1', // pogingen per widget per leerlingnaam
  live: 'wf.live.v1', // wie is er (op dit toestel) aan het werk
} as const;

type Listener = () => void;
const listeners = new Set<Listener>();

export function onStorageChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

/** Voor andere opslagmodules (bv. cursussen) om dezelfde luisteraars te verwittigen. */
export function notifyChange() {
  emit();
}

// Ook wijzigingen uit ándere tabbladen doorgeven (bv. leerling dient in op
// hetzelfde toestel) zodat dashboards en resultaten live verversen.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('wf.')) emit();
  });
}

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
    alert('Opslaan mislukt: de lokale opslag is vol. Verwijder oude widgets of grote afbeeldingen.');
  }
  emit();
}

// ── Widgets ─────────────────────────────────────────────────────────────────

export function getWidgets(): Widget[] {
  return read<Widget[]>(KEYS.widgets, []);
}
export function getWidget(id: string): Widget | undefined {
  return getWidgets().find((w) => w.id === id);
}
export function getWidgetByCode(code: string): Widget | undefined {
  const c = code.trim().toUpperCase();
  return getWidgets().find((w) => w.code.toUpperCase() === c);
}
export function saveWidget(widget: Widget) {
  const all = getWidgets();
  const i = all.findIndex((w) => w.id === widget.id);
  const updated = { ...widget, updatedAt: Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  write(KEYS.widgets, all);
}
export function deleteWidget(id: string) {
  write(KEYS.widgets, getWidgets().filter((w) => w.id !== id));
  write(KEYS.submissions, getSubmissions().filter((s) => s.widgetId !== id));
}

// ── Mappen ──────────────────────────────────────────────────────────────────

export function getFolders(): Folder[] {
  return read<Folder[]>(KEYS.folders, []);
}
export function saveFolder(folder: Folder) {
  const all = getFolders();
  const i = all.findIndex((f) => f.id === folder.id);
  if (i >= 0) all[i] = folder;
  else all.push(folder);
  write(KEYS.folders, all);
}
export function deleteFolder(id: string) {
  write(KEYS.folders, getFolders().filter((f) => f.id !== id));
  // widgets uit de map terug naar hoofdmap
  const widgets = getWidgets().map((w) => (w.folderId === id ? { ...w, folderId: null } : w));
  write(KEYS.widgets, widgets);
}

// ── Inzendingen ─────────────────────────────────────────────────────────────

export function getSubmissions(widgetId?: string): Submission[] {
  const all = read<Submission[]>(KEYS.submissions, []);
  return widgetId ? all.filter((s) => s.widgetId === widgetId) : all;
}
export function saveSubmission(sub: Submission) {
  const all = read<Submission[]>(KEYS.submissions, []);
  const i = all.findIndex((s) => s.id === sub.id);
  if (i >= 0) all[i] = sub;
  else all.unshift(sub);
  write(KEYS.submissions, all);
}
export function deleteSubmission(id: string) {
  write(KEYS.submissions, getSubmissions().filter((s) => s.id !== id));
}

// ── Pogingen (per browser) ──────────────────────────────────────────────────

export function getAttemptCount(widgetId: string, studentName: string): number {
  const map = read<Record<string, number>>(KEYS.attempts, {});
  return map[`${widgetId}::${studentName.trim().toLowerCase()}`] ?? 0;
}
export function bumpAttemptCount(widgetId: string, studentName: string) {
  const map = read<Record<string, number>>(KEYS.attempts, {});
  const key = `${widgetId}::${studentName.trim().toLowerCase()}`;
  map[key] = (map[key] ?? 0) + 1;
  write(KEYS.attempts, map);
}

// ── Live activiteit (zelfde toestel/browser) ────────────────────────────────

export interface LiveEntry {
  widgetId: string;
  studentName: string;
  startedAt: number;
}

export function markStarted(widgetId: string, studentName: string) {
  const all = read<LiveEntry[]>(KEYS.live, []);
  const name = studentName.trim() || 'Anoniem';
  const filtered = all.filter((e) => !(e.widgetId === widgetId && e.studentName === name));
  filtered.push({ widgetId, studentName: name, startedAt: Date.now() });
  // oude entries (ouder dan 12u) opruimen
  write(KEYS.live, filtered.filter((e) => Date.now() - e.startedAt < 12 * 3600 * 1000));
}

export function getLiveEntries(widgetId: string): LiveEntry[] {
  return read<LiveEntry[]>(KEYS.live, []).filter((e) => e.widgetId === widgetId);
}

// ── Voorkeuren ──────────────────────────────────────────────────────────────

export interface Prefs {
  theme: 'light' | 'dark' | 'auto';
  teacherName: string;
  seeded: boolean;
}
export function getPrefs(): Prefs {
  return read<Prefs>(KEYS.prefs, { theme: 'auto', teacherName: '', seeded: false });
}
export function savePrefs(p: Prefs) {
  write(KEYS.prefs, p);
}
