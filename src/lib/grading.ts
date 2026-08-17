import type { GapQuestion, ItemScore, Question, QuizConfig } from './types';
import { EXTRA_QTYPES } from '../widgets/qtypes';
import { normalizeAnswer } from './utils';

/** Gaten uit een gap-tekst halen: "De [kat] slaapt" → ["kat"]. */
export function extractGaps(text: string): string[] {
  const out: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** Splits gap-tekst in segmenten: tekst en gaten, in volgorde. */
export function splitGapText(text: string): { type: 'text' | 'gap'; value: string; gapIndex?: number }[] {
  const parts: { type: 'text' | 'gap'; value: string; gapIndex?: number }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let gi = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'gap', value: m[1], gapIndex: gi++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/** Eén quizvraag automatisch beoordelen. Antwoordvormen zijn per type gedocumenteerd in de speler. */
export function gradeQuestion(q: Question, answer: unknown): ItemScore {
  const max = q.type === 'info' ? 0 : q.points;
  const wrong: ItemScore = { earned: 0, max, mode: 'auto' };
  const right: ItemScore = { earned: max, max, mode: 'auto' };

  // Uitgebreide vraagtypes scoren zichzelf; null = manueel na te kijken.
  const extra = EXTRA_QTYPES[q.type];
  if (extra) return extra.grade(q, answer) ?? { earned: 0, max, mode: 'pending' };

  switch (q.type) {
    case 'info':
      return { earned: 0, max: 0, mode: 'auto' };
    case 'mc':
      return answer === q.correctIndex ? right : wrong;
    case 'tf':
      return answer === q.answer ? right : wrong;
    case 'multi': {
      const sel = Array.isArray(answer) ? (answer as number[]).slice().sort((a, b) => a - b) : [];
      const cor = q.correctIndices.slice().sort((a, b) => a - b);
      const ok = sel.length === cor.length && sel.every((v, i) => v === cor[i]);
      return ok ? right : wrong;
    }
    case 'short': {
      const given = typeof answer === 'string' ? answer : '';
      // blanco is nooit juist, en lege regels in de antwoordenlijst tellen niet mee
      if (normalizeAnswer(given) === '') return wrong;
      const ok = q.accepted
        .filter((a) => normalizeAnswer(a) !== '')
        .some((a) => normalizeAnswer(a, q.caseSensitive) === normalizeAnswer(given, q.caseSensitive));
      return ok ? right : wrong;
    }
    case 'number': {
      const n = typeof answer === 'number' ? answer : parseFloat(String(answer ?? '').replace(',', '.'));
      if (Number.isNaN(n)) return wrong;
      return Math.abs(n - q.answer) <= q.tolerance ? right : wrong;
    }
    case 'slider': {
      const n = typeof answer === 'number' ? answer : NaN;
      if (Number.isNaN(n)) return wrong;
      return Math.abs(n - q.answer) <= q.tolerance ? right : wrong;
    }
    case 'gap': {
      const gaps = extractGaps(q.text);
      const given = Array.isArray(answer) ? (answer as string[]) : [];
      if (gaps.length === 0) return { earned: 0, max: 0, mode: 'auto' };
      let good = 0;
      gaps.forEach((g, i) => {
        const options = g.split('|'); // meerdere juiste alternatieven per gat
        if (options.some((o) => normalizeAnswer(o) === normalizeAnswer(given[i] ?? ''))) good++;
      });
      const earned = Math.round((good / gaps.length) * max * 100) / 100;
      return { earned, max, mode: 'auto' };
    }
    case 'match': {
      // antwoord: rechts-index gekozen per links-index
      const given = Array.isArray(answer) ? (answer as (number | null)[]) : [];
      const n = q.pairs.length;
      if (n === 0) return { earned: 0, max: 0, mode: 'auto' };
      let good = 0;
      for (let i = 0; i < n; i++) if (given[i] === i) good++;
      const earned = Math.round((good / n) * max * 100) / 100;
      return { earned, max, mode: 'auto' };
    }
    case 'order': {
      // antwoord: permutatie-array met originele indexen in gekozen volgorde
      const given = Array.isArray(answer) ? (answer as number[]) : [];
      const n = q.items.length;
      if (n === 0) return { earned: 0, max: 0, mode: 'auto' };
      let good = 0;
      for (let i = 0; i < n; i++) if (given[i] === i) good++;
      const earned = Math.round((good / n) * max * 100) / 100;
      return { earned, max, mode: 'auto' };
    }
    case 'long':
      // open vragen wachten op manuele beoordeling
      return { earned: 0, max, mode: 'pending' };
    default:
      return wrong;
  }
}

export function gradeQuiz(config: QuizConfig, answers: Record<string, unknown>) {
  const itemScores: Record<string, ItemScore> = {};
  let earned = 0;
  let max = 0;
  for (const q of config.questions) {
    const score = gradeQuestion(q, answers[q.id]);
    itemScores[q.id] = score;
    earned += score.earned;
    max += score.max;
  }
  const hasPending = Object.values(itemScores).some((s) => s.mode === 'pending');
  return { itemScores, earned: Math.round(earned * 100) / 100, max, hasPending };
}

/** Maximale score van een quiz-configuratie. */
export function quizMaxScore(config: QuizConfig): number {
  return config.questions.reduce((sum, q) => sum + (q.type === 'info' ? 0 : q.points), 0);
}

/** Voorbeeldweergave van een gap-vraag zonder de antwoorden. */
export function gapPreview(q: GapQuestion): string {
  return q.text.replace(/\[([^\]]+)\]/g, '_____');
}
