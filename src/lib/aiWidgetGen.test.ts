import { describe, expect, it } from 'vitest';
import { buildWidgetGenPrompt, sanitizeGeneratedWidgets, sanitizeQuestion, sanitizeQuestions } from './aiWidgetGen';
import type { QuizConfig } from './types';

const mc = (extra: Record<string, unknown> = {}) => ({
  type: 'mc',
  prompt: 'Wat verdampt er?',
  options: ['water', 'steen'],
  correctIndex: 0,
  ...extra,
});

describe('sanitizeQuestion — goalCode', () => {
  it('laat het veld weg als de AI niets meegaf', () => {
    expect(sanitizeQuestion(mc())?.goalCode).toBeUndefined();
    expect(sanitizeQuestion(mc({ goalCode: '   ' }))?.goalCode).toBeUndefined();
  });

  it('normaliseert de code (hoofdletters, dubbele spaties)', () => {
    expect(sanitizeQuestion(mc({ goalCode: ' wis  2.3 ' }))?.goalCode).toBe('WIS 2.3');
  });

  it('bewaart een code die in de toegelaten lijst staat, ook anders geschreven', () => {
    const q = sanitizeQuestion(mc({ goalCode: 'nw 4.1' }), { allowedGoalCodes: ['NW 4.1', 'NW 2.2'] });
    expect(q?.goalCode).toBe('NW 4.1');
  });

  it('laat een verzonnen code vallen als er een lijst is', () => {
    const q = sanitizeQuestion(mc({ goalCode: 'ZZZ 9.9' }), { allowedGoalCodes: ['NW 4.1'] });
    expect(q?.goalCode).toBeUndefined();
    // de vraag zelf blijft wél bruikbaar
    expect(q?.prompt).toBe('Wat verdampt er?');
  });

  it('laat alles door als de lijst leeg of afwezig is', () => {
    expect(sanitizeQuestion(mc({ goalCode: 'X 1' }), { allowedGoalCodes: [] })?.goalCode).toBe('X 1');
    expect(sanitizeQuestion(mc({ goalCode: 'X 1' }), {})?.goalCode).toBe('X 1');
  });

  it('raakt het vrije doelveld niet aan', () => {
    const q = sanitizeQuestion(mc({ goal: 'Werkwoordspelling', goalCode: 'NW 4.1' }), { allowedGoalCodes: ['NW 4.1'] });
    expect(q?.goal).toBe('Werkwoordspelling');
    expect(q?.goalCode).toBe('NW 4.1');
  });

  it('geeft de lijst door aan sanitizeQuestions', () => {
    const qs = sanitizeQuestions([mc({ goalCode: 'NW 4.1' }), mc({ goalCode: 'fout' })], {
      allowedGoalCodes: ['NW 4.1'],
    });
    expect(qs.map((q) => q.goalCode)).toEqual(['NW 4.1', undefined]);
  });
});

describe('sanitizeGeneratedWidgets — goalCode', () => {
  it('geeft de toegelaten codes door tot in de vragen van de widget', () => {
    const res = sanitizeGeneratedWidgets(
      { widgets: [{ type: 'quiz', title: 'Toets', config: { questions: [mc({ goalCode: 'nw 4.1' }), mc({ goalCode: 'verzonnen' })] } }] },
      { allowedGoalCodes: ['NW 4.1'] }
    );
    expect(res.widgets).toHaveLength(1);
    const questions = (res.widgets[0].config as QuizConfig).questions;
    expect(questions.map((q) => q.goalCode)).toEqual(['NW 4.1', undefined]);
  });
});

describe('buildWidgetGenPrompt — leerplandoelen', () => {
  it('zet de doelenlijst met codes in de prompt', () => {
    const { prompt } = buildWidgetGenPrompt({
      source: 'Water verdampt.',
      wish: '',
      types: ['quiz'],
      goalCodes: [{ code: 'NW 4.1', text: 'De leerling legt verdamping uit.' }],
    });
    expect(prompt).toContain('NW 4.1: De leerling legt verdamping uit.');
    expect(prompt).toContain('goalCode');
  });

  it('vermeldt geen doelenlijst als er geen is', () => {
    const { prompt } = buildWidgetGenPrompt({ source: '', wish: 'iets', types: ['quiz'] });
    expect(prompt).not.toContain('Leerplandoelen:');
  });
});

describe('sanitizeQuestion: varianten van het antwoordveld (gezien bij Gemini)', () => {
  const opts = ['De dunne darm', 'De maag', 'De slokdarm', 'De dikke darm'];
  it('mc: "correctAnswer" als nummer, als optietekst of als letter', () => {
    const a = sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, correctAnswer: 0 });
    const b = sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, correctAnswer: 'de maag' });
    const c = sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, answer: 'C' });
    expect(a && a.type === 'mc' && a.correctIndex).toBe(0);
    expect(b && b.type === 'mc' && b.correctIndex).toBe(1);
    expect(c && c.type === 'mc' && c.correctIndex).toBe(2);
  });
  it('mc: een antwoord dat bij geen optie past, keurt de vraag af', () => {
    expect(sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, correctAnswer: 'de lever' })).toBeNull();
    expect(sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts })).toBeNull();
  });
  it('multi: "correctAnswers" met optieteksten', () => {
    const q = sanitizeQuestion({ type: 'multi', prompt: 'p', options: opts, correctAnswers: ['De maag', 'De dunne darm'] });
    expect(q && q.type === 'multi' && q.correctIndices).toEqual([0, 1]);
  });
  it('tf: "correct", "waar"/"onjuist" worden herkend; zonder antwoord valt de vraag weg in plaats van stil "onjuist"', () => {
    const t1 = sanitizeQuestion({ type: 'tf', prompt: 'p', correct: true });
    const t2 = sanitizeQuestion({ type: 'tf', prompt: 'p', answer: 'waar' });
    const t3 = sanitizeQuestion({ type: 'tf', prompt: 'p', correctAnswer: 'onjuist' });
    expect(t1 && t1.type === 'tf' && t1.answer).toBe(true);
    expect(t2 && t2.type === 'tf' && t2.answer).toBe(true);
    expect(t3 && t3.type === 'tf' && t3.answer).toBe(false);
    expect(sanitizeQuestion({ type: 'tf', prompt: 'p' })).toBeNull();
  });
});
