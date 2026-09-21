// ── Score per leerplandoel: de lijm tussen widgets, cursussen en klassen ────
//
// Vragen dragen een goalCode (leerplan) en/of een vrije goal-tag. Een inzending
// heeft itemScores per vraag-id. Hier tellen we die op per doelcode, zodat
// resultaten, cursusdekking en het klasoverzicht dezelfde cijfers tonen.

import type { Submission, Widget } from './types';
import type { Course } from './courseTypes';
import { allSections } from './courseTypes';
import { normalizeGoalCode } from './curriculum';

export interface GoalScore {
  code: string;
  earned: number;
  max: number;
  /** Aantal vragen dat meetelde. */
  items: number;
}

interface QuestionLike { id: string; goalCode?: string; goal?: string }

/** Vragen uit een widgetconfig, als die er zijn (quiz, gesplitst werkblad, …). */
export function questionsOf(widget: Widget): QuestionLike[] {
  const cfg = widget.config as { questions?: unknown };
  if (!cfg || !Array.isArray(cfg.questions)) return [];
  return (cfg.questions as unknown[]).filter(
    (q): q is QuestionLike => !!q && typeof q === 'object' && typeof (q as QuestionLike).id === 'string'
  );
}

/** Alle doelcodes waar een widget aan werkt (genormaliseerd, uniek). */
export function widgetGoalCodes(widget: Widget): string[] {
  const out = new Set<string>();
  for (const q of questionsOf(widget)) if (q.goalCode?.trim()) out.add(normalizeGoalCode(q.goalCode));
  return [...out];
}

/** Alle doelcodes waar een cursus aan werkt (secties + ingebedde widgets die je meegeeft). */
export function courseGoalCodes(course: Course, widgets: Widget[] = []): string[] {
  const out = new Set<string>();
  for (const { section } of allSections(course)) {
    for (const c of section.goalCodes ?? []) if (c.trim()) out.add(normalizeGoalCode(c));
  }
  for (const w of widgets) for (const c of widgetGoalCodes(w)) out.add(c);
  return [...out];
}

/** Score per doelcode voor één inzending. Vragen zonder code tellen niet mee. */
export function scoresPerGoal(submission: Submission, widget: Widget): GoalScore[] {
  if (!submission.itemScores) return [];
  const map = new Map<string, GoalScore>();
  for (const q of questionsOf(widget)) {
    if (!q.goalCode?.trim()) continue;
    const s = submission.itemScores[q.id];
    if (!s || s.max <= 0) continue;
    const code = normalizeGoalCode(q.goalCode);
    const cur = map.get(code) ?? { code, earned: 0, max: 0, items: 0 };
    cur.earned += s.earned;
    cur.max += s.max;
    cur.items += 1;
    map.set(code, cur);
  }
  return [...map.values()];
}

/** Meerdere lijsten samenvoegen (bv. alle inzendingen van één leerling). */
export function aggregateGoalScores(lists: GoalScore[][]): Map<string, GoalScore> {
  const map = new Map<string, GoalScore>();
  for (const list of lists) {
    for (const g of list) {
      const cur = map.get(g.code) ?? { code: g.code, earned: 0, max: 0, items: 0 };
      cur.earned += g.earned;
      cur.max += g.max;
      cur.items += g.items;
      map.set(g.code, cur);
    }
  }
  return map;
}

/** Percentage (0–100) of null zonder meetbare punten. */
export function goalPct(g: GoalScore | undefined): number | null {
  if (!g || g.max <= 0) return null;
  return Math.round((g.earned / g.max) * 100);
}
