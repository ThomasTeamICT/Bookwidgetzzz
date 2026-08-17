import type { Question, QuizConfig } from './types';
import { extractGaps } from './grading';

export interface LintWarning {
  /** Vraagnummer (1-gebaseerd, zonder infoblokken) of null voor widget-brede signalen. */
  questionNo: number | null;
  text: string;
}

/**
 * Vraag-linter: signaleert bekende constructiefouten uit de toetsliteratuur.
 * Signalen, geen wetten — de leerkracht beslist.
 */
export function lintQuiz(config: QuizConfig): LintWarning[] {
  const warnings: LintWarning[] = [];
  const gradable = config.questions.filter((q) => q.type !== 'info');

  gradable.forEach((q, i) => {
    const no = i + 1;
    const add = (text: string) => warnings.push({ questionNo: no, text });

    // dubbele ontkenning in de vraagstam
    const negations = (q.prompt.toLowerCase().match(/\b(niet|geen|nooit|niemand)\b/g) ?? []).length;
    if (negations >= 2) add('Dubbele ontkenning in de vraag — herformuleer positief voor betere validiteit.');

    if (q.type === 'mc' || q.type === 'multi') {
      const opts = q.options.filter((o) => o.trim());
      if (opts.length < 3) add('Minder dan 3 antwoordopties — gokkans is groot.');
      const correctIdx = q.type === 'mc' ? [q.correctIndex] : q.correctIndices;
      const correct = correctIdx.map((ci) => q.options[ci] ?? '').filter(Boolean);
      const wrong = q.options.filter((_, oi) => !correctIdx.includes(oi)).filter((o) => o.trim());
      if (correct.length > 0 && wrong.length > 0) {
        const avgWrong = wrong.reduce((a, o) => a + o.length, 0) / wrong.length;
        if (correct.some((c) => c.length > avgWrong * 1.7 && c.length > 20)) {
          add('Het juiste antwoord is opvallend langer dan de afleiders — een bekende weggever.');
        }
      }
      if (q.options.some((o) => /\b(alle bovenstaande|geen van bovenstaande|alle antwoorden)\b/i.test(o))) {
        add('“Alle/geen van bovenstaande” meet vaak testwijsheid in plaats van kennis.');
      }
    }

    if (q.type === 'gap' && extractGaps(q.text).length === 0) {
      add('Invuloefening zonder gaten — zet woorden tussen [vierkante haken].');
    }
    // rating/likert staan per ontwerp op 0 punten (geen juist/fout) — daar is 0 geen fout.
    if (q.points === 0 && q.type !== 'rating' && q.type !== 'likert') add('Deze vraag staat op 0 punten — bedoeling?');
  });

  // widget-brede signalen
  if (gradable.length >= 4) {
    const allRecognition = gradable.every((q) => q.type === 'mc' || q.type === 'multi' || q.type === 'tf');
    if (allRecognition) {
      warnings.push({ questionNo: null, text: 'Alle vragen zijn herkenvragen (meerkeuze/juist-onjuist). Overweeg ook productieve vragen (kort antwoord, open vraag) voor dieper leren.' });
    }
    const withExplanation = gradable.filter((q) => q.explanation?.trim()).length;
    if (withExplanation / gradable.length < 0.3) {
      warnings.push({ questionNo: null, text: 'Weinig vragen hebben uitleg bij de feedback — juist die uitleg maakt van een fout een leermoment.' });
    }
  }

  return warnings;
}
