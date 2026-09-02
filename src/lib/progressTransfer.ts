import type { ItemScore, Submission } from './types';
import { getSubmissions, saveSubmission } from './storage';
import { uid } from './utils';
import { inlineMedia } from './mediaStore';

/**
 * Voortgang meenemen naar een ander toestel (klas-pc ↔ thuis).
 *
 * De inzendingen leven per toestel in localStorage; met een klein JSON-bestand
 * kan een leerling zijn eigen pogingen exporteren en elders weer importeren.
 * Er is bewust géén server: het bestand is van de leerling zelf.
 */

const KIND = 'voortgang';

interface ProgressFile {
  app: 'widgetfabriek';
  kind: typeof KIND;
  v: 1;
  naam: string;
  /** ISO-datum van export. */
  datum: string;
  submissions: Submission[];
}

/**
 * Alle inzendingen van deze naam (hoofdletterongevoelig) als downloadbaar JSON.
 * Async: tekeningen en ingeleverde afbeeldingen staan in IndexedDB en gaan als
 * data-URL mee (lib/mediaStore), anders zijn ze op het andere toestel weg.
 */
export async function exportProgress(studentName: string): Promise<string> {
  const naam = studentName.trim();
  const key = naam.toLowerCase();
  const submissions = getSubmissions().filter(
    (s) => s.studentName.trim().toLowerCase() === key
  );
  const file: ProgressFile = {
    app: 'widgetfabriek',
    kind: KIND,
    v: 1,
    naam,
    datum: new Date().toISOString(),
    submissions: await inlineMedia(submissions),
  };
  return JSON.stringify(file, null, 2);
}

/** Sleutel om dubbele pogingen te herkennen (zelfde widget, naam en indienmoment). */
function dupKey(widgetId: unknown, studentName: unknown, submittedAt: unknown): string {
  return `${String(widgetId)}::${String(studentName).trim().toLowerCase()}::${String(submittedAt)}`;
}

/**
 * Leest een voortgangsbestand defensief in en bewaart alleen de pogingen die
 * hier nog niet staan (dubbele worden herkend op widget + naam + indienmoment,
 * zowel tegenover de bestaande opslag als binnen het bestand zelf).
 * Geeft null terug wanneer het geen geldig voortgangsbestand is.
 */
export function importProgress(json: string): { naam: string; imported: number } | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || data.kind !== KIND) return null;
    if (!Array.isArray(data.submissions)) return null;

    const bestaand = getSubmissions();
    const bestaandeIds = new Set(bestaand.map((s) => s.id));
    const gezien = new Set(bestaand.map((s) => dupKey(s.widgetId, s.studentName, s.submittedAt)));

    let imported = 0;
    let eersteNaam = '';
    for (const raw of data.submissions as unknown[]) {
      const s = raw as Record<string, unknown> | null;
      // minimale vorm: id, widgetId, studentName en answers moeten kloppen
      if (!s || typeof s !== 'object') continue;
      if (typeof s.id !== 'string' || !s.id) continue;
      if (typeof s.widgetId !== 'string' || !s.widgetId) continue;
      if (typeof s.studentName !== 'string' || !s.studentName.trim()) continue;
      if (!s.answers || typeof s.answers !== 'object' || Array.isArray(s.answers)) continue;

      const key = dupKey(s.widgetId, s.studentName, s.submittedAt);
      if (gezien.has(key)) continue;
      gezien.add(key);

      const sub: Submission = {
        // origineel id behouden, tenzij dat hier al bestaat (dan een nieuw id)
        id: bestaandeIds.has(s.id) ? uid() : s.id,
        widgetId: s.widgetId,
        widgetCode: typeof s.widgetCode === 'string' ? s.widgetCode : '',
        studentName: s.studentName,
        startedAt: typeof s.startedAt === 'number' ? s.startedAt : Date.now(),
        submittedAt: typeof s.submittedAt === 'number' ? s.submittedAt : Date.now(),
        durationSec: typeof s.durationSec === 'number' ? s.durationSec : 0,
        answers: s.answers as Record<string, unknown>,
        itemScores:
          s.itemScores && typeof s.itemScores === 'object' && !Array.isArray(s.itemScores)
            ? (s.itemScores as Record<string, ItemScore>)
            : null,
        totalEarned: typeof s.totalEarned === 'number' ? s.totalEarned : 0,
        totalMax: typeof s.totalMax === 'number' ? s.totalMax : 0,
        status: s.status === 'graded' ? 'graded' : 'submitted',
        ...(typeof s.teacherFeedback === 'string' ? { teacherFeedback: s.teacherFeedback } : {}),
        ...(typeof s.focusLosses === 'number' ? { focusLosses: s.focusLosses } : {}),
      };
      bestaandeIds.add(sub.id);
      saveSubmission(sub);
      imported++;
      if (!eersteNaam) eersteNaam = sub.studentName.trim();
    }

    const naam =
      typeof data.naam === 'string' && data.naam.trim() ? data.naam.trim() : eersteNaam;
    return { naam, imported };
  } catch {
    return null;
  }
}
