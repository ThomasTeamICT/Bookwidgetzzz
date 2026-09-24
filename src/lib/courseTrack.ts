// ── Oefeningen van een cursus, gegroepeerd per hoofdstuk ────────────────────
//
// Gebruikt door CourseTrackPage: in plaats van één lange lijst van alle
// ingebedde widget-oefeningen, groeperen we ze per hoofdstuk, in de volgorde
// van de cursus. Een widget die (zeldzaam) in meerdere hoofdstukken zit, telt
// bij het eerste hoofdstuk waarin hij voorkomt — zo klopt de totaaltelling.

import type { Course, CourseChapter } from './courseTypes';

export interface ChapterExerciseGroup {
  chapter: CourseChapter;
  widgetIds: string[];
}

/** Groepeert de widget-ids van een cursus per hoofdstuk, in cursusvolgorde. */
export function groupWidgetIdsByChapter(course: Course): ChapterExerciseGroup[] {
  const seen = new Set<string>();
  const groups: ChapterExerciseGroup[] = [];
  for (const chapter of course.chapters) {
    const widgetIds: string[] = [];
    for (const section of chapter.sections) {
      for (const block of section.blocks) {
        if (block.type === 'widget' && block.widgetId && !seen.has(block.widgetId)) {
          seen.add(block.widgetId);
          widgetIds.push(block.widgetId);
        }
      }
    }
    if (widgetIds.length > 0) groups.push({ chapter, widgetIds });
  }
  return groups;
}

/**
 * Filtert de gegroepeerde oefeningen op titel. `titleOf` levert de titel van
 * een widget-id (of undefined als de widget niet meer bestaat — die valt dan
 * weg bij een actieve zoekterm). Een lege zoekterm geeft de groepen ongewijzigd
 * terug; hoofdstukken zonder overblijvende oefening verdwijnen uit het resultaat.
 */
export function filterChapterGroups(
  groups: ChapterExerciseGroup[],
  query: string,
  titleOf: (widgetId: string) => string | undefined
): ChapterExerciseGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, widgetIds: g.widgetIds.filter((id) => (titleOf(id) ?? '').toLowerCase().includes(q)) }))
    .filter((g) => g.widgetIds.length > 0);
}
