// Opslaan & hervatten: antwoorden van een leerling tussentijds bewaren zodat
// een herlaad/stroomonderbreking geen werk kost.

interface AutosaveData {
  answers: Record<string, unknown>;
  idx: number;
  savedAt: number;
  /** Vraag-ids in de getoonde volgorde, zodat schudden/vragenpool stabiel hervat. */
  order?: string[];
  /** Status van getrapte controle per vraag, zodat gecheckte vragen vergrendeld blijven. */
  step?: Record<string, 'retry' | 'locked'>;
}

const key = (widgetId: string, studentName: string) =>
  `wf.autosave.${widgetId}.${studentName.trim().toLowerCase()}`;

export function saveProgress(
  widgetId: string,
  studentName: string,
  answers: Record<string, unknown>,
  idx: number,
  order?: string[],
  step?: Record<string, 'retry' | 'locked'>
) {
  try {
    localStorage.setItem(key(widgetId, studentName), JSON.stringify({ answers, idx, order, step, savedAt: Date.now() } satisfies AutosaveData));
  } catch {
    // opslag vol — stil negeren, autosave is best-effort
  }
}

export function loadProgress(widgetId: string, studentName: string): AutosaveData | null {
  try {
    const raw = localStorage.getItem(key(widgetId, studentName));
    if (!raw) return null;
    const data = JSON.parse(raw) as AutosaveData;
    // ouder dan 7 dagen → weggooien
    if (Date.now() - data.savedAt > 7 * 24 * 3600 * 1000) {
      clearProgress(widgetId, studentName);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function hasProgress(widgetId: string, studentName: string): boolean {
  return loadProgress(widgetId, studentName) !== null;
}

export function clearProgress(widgetId: string, studentName: string) {
  try {
    localStorage.removeItem(key(widgetId, studentName));
  } catch {
    // negeren
  }
}
