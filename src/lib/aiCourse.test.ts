import { describe, expect, it } from 'vitest';
import {
  buildNewCoursePrompt, buildOptimizePrompt, buildSectionExercisesPrompt, sanitizeAICourse,
} from './aiCourse';
import type { Course, CourseSection } from './courseTypes';
import type { CurriculumGoal } from './curriculumTypes';

const goals: CurriculumGoal[] = [
  { id: 'g1', code: 'NW 1.1', text: 'Waterkringloop beschrijven', theme: 'Systeem aarde' },
  { id: 'g2', code: 'NW 2.2', text: 'Toestandsveranderingen', theme: 'Materie', level: 'uitbreiding' },
];

const aiAnswer = {
  course: {
    title: 'De waterkringloop',
    coverEmoji: '💧',
    chapters: [
      {
        title: 'Verdamping',
        sections: [
          {
            title: 'In de zon',
            goals: ['Ik kan uitleggen wat verdamping is'],
            goalCodes: ['nw  1.1', 'NW 1.1', 'ZZ 9.9'],
            blocks: [{ type: 'text', markdown: 'Water verdampt.' }],
          },
          { title: 'Verdieping', optional: true, goalCodes: ['nw 2.2'], blocks: [{ type: 'text', markdown: 'Meer.' }] },
        ],
      },
    ],
  },
};

describe('sanitizeAICourse en de doelcodes', () => {
  it('normaliseert, ontdubbelt en weert codes buiten het leerplan', () => {
    const res = sanitizeAICourse(aiAnswer, { curriculumId: 'cur1', allowedGoalCodes: ['NW 1.1', 'nw 2.2'] });
    const sections = res.course.chapters[0].sections;
    expect(sections[0].goalCodes).toEqual(['NW 1.1']);
    expect(sections[1].goalCodes).toEqual(['NW 2.2']);
    expect(res.course.curriculumId).toBe('cur1');
    expect(res.warnings.some((w) => w.includes('niet in je leerplan'))).toBe(true);
  });

  it('laat alle codes staan als er geen lijst meegegeven is', () => {
    const res = sanitizeAICourse(aiAnswer);
    expect(res.course.chapters[0].sections[0].goalCodes).toEqual(['NW 1.1', 'ZZ 9.9']);
    expect(res.course.curriculumId).toBeUndefined();
    expect(res.warnings).toEqual([]);
  });

  it('neemt het leerplan van de bestaande cursus over bij herwerken', () => {
    const base = sanitizeAICourse(aiAnswer, { curriculumId: 'cur1' }).course;
    const res = sanitizeAICourse(aiAnswer, { base });
    expect(res.course.id).toBe(base.id);
    expect(res.course.curriculumId).toBe('cur1');
  });

  it('laat de doelcodes van de oefenquizzen door dezelfde filter gaan', () => {
    const withQuiz = {
      ...aiAnswer,
      widgets: [{
        type: 'quiz',
        title: 'Quiz',
        config: {
          questions: [
            { type: 'mc', prompt: 'Wat verdampt?', options: ['water', 'steen'], correctIndex: 0, goalCode: 'nw  1.1' },
            { type: 'tf', prompt: 'Verzonnen code.', answer: true, goalCode: 'ZZ 9.9' },
          ],
        },
      }],
    };
    const res = sanitizeAICourse(withQuiz, { allowedGoalCodes: ['NW 1.1'] });
    const quiz = res.quizzes[0]!;
    const questions = (quiz.config as { questions: { goalCode?: string }[] }).questions;
    expect(questions[0].goalCode).toBe('NW 1.1');
    expect(questions[1].goalCode).toBeUndefined();
  });

  it('geeft een bruikbare cursus terug bij een onbruikbaar antwoord', () => {
    const res = sanitizeAICourse({ course: { title: 'Kapot' } });
    expect(res.course.chapters.length).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.includes('bruikbare cursusstructuur'))).toBe(true);
  });
});

describe('prompts met leerplandoelen', () => {
  it('eist goalCodes uit de lijst en dekking van alle doelen', () => {
    const { prompt } = buildNewCoursePrompt({ goals: '', curriculumGoals: goals, withQuizzes: true, title: 'Water' });
    expect(prompt).toContain('NW 1.1 — Waterkringloop beschrijven');
    expect(prompt).toContain('"goalCodes"');
    expect(prompt).toContain('ALLE 2 doelen');
    expect(prompt).toContain('"goalCode"'); // per quizvraag
    expect(prompt).toContain('samenvattingssectie');
    expect(prompt).toContain('Water');
  });

  it('werkt ook met alleen bronmateriaal (zonder leerplandoelen)', () => {
    const { prompt } = buildNewCoursePrompt({ goals: '', sourceText: 'Mijn cursustekst' });
    expect(prompt).toContain('BRONMATERIAAL');
    expect(prompt).not.toContain('ALLE 2 doelen');
  });

  it('bouwt de hiaten-optimalisatie op de herwerkprompt', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const { prompt } = buildOptimizePrompt({
      course, presets: ['hiaten'], wishes: 'kort houden',
      uncovered: [goals[1]], curriculumGoals: goals,
    });
    expect(prompt).toContain('Herwerk de onderstaande bestaande cursus');
    expect(prompt).toContain('HIATEN');
    expect(prompt).toContain('NW 2.2 — Toestandsveranderingen');
    expect(prompt).toContain('kort houden');
    expect(prompt).toContain('keep'); // mediablokken blijven behouden
  });

  it('vraagt oefeningen op basis van de sectie-inhoud en haar doelen', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const section: CourseSection = course.chapters[0].sections[0];
    const { prompt } = buildSectionExercisesPrompt({
      course: course as Course, section, chapterTitle: 'Verdamping', goals: [goals[0]], count: 2,
    });
    expect(prompt).toContain('Maak 2 oefening(en)');
    expect(prompt).toContain('Water verdampt.');
    expect(prompt).toContain('NW 1.1');
    expect(prompt).toContain('"widgets"');
  });
});
