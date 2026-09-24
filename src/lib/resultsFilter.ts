// ── Klasfilter voor de resultatenpagina's ───────────────────────────────────
//
// Zonder klassen liepen parallelklassen door elkaar in /resultaten, ook als
// een leerling via een klaslink binnenkwam (Submission.classId). Dit bestand
// bevat de pure filterlogica, apart van de React-hook (useResultsClassFilter)
// die de keuze uit de URL en sessionStorage haalt — zo blijft dit stuk zonder
// DOM te testen.

import type { Submission } from './types';

/**
 * 'all' = alle inzendingen, 'none' = inzendingen zonder klas (losse code, of
 * van vóór er klassen bestonden), anders het id van precies één klas.
 */
export type ResultsClassFilter = 'all' | 'none' | string;

export const RESULTS_CLASS_FILTER_KEY = 'wf.resultatenKlasfilter.v1';

/** Filtert inzendingen op klas. */
export function filterSubmissionsByClass(subs: Submission[], filter: ResultsClassFilter): Submission[] {
  if (filter === 'all') return subs;
  if (filter === 'none') return subs.filter((s) => !s.classId);
  return subs.filter((s) => s.classId === filter);
}

/**
 * Is deze keuze nog zinvol? Voorkomt dat een verwijderde klas (oude
 * sessiewaarde of een verouderde `?klas=`-link) alles laat verdwijnen.
 */
export function isValidClassFilter(filter: string, classIds: string[]): boolean {
  return filter === 'all' || filter === 'none' || classIds.includes(filter);
}

export function readStoredClassFilter(): string | null {
  try {
    return sessionStorage.getItem(RESULTS_CLASS_FILTER_KEY);
  } catch {
    return null;
  }
}

export function writeStoredClassFilter(value: ResultsClassFilter): void {
  try {
    sessionStorage.setItem(RESULTS_CLASS_FILTER_KEY, value);
  } catch {
    // best effort: hoogstens onthoudt de sessie de keuze niet
  }
}
