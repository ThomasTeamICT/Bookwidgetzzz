import { describe, expect, it } from 'vitest';
import {
  buildNewCoursePrompt, buildOptimizeChapterPrompt, buildOptimizePrompt, buildSectionExercisesPrompt,
  buildSectionPrompt, checkMissingTopics, extractTopicKeywords, sanitizeAIChapter, sanitizeAICourse,
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

  it('herkent een code ook zonder de spatie die het model soms weglaat', () => {
    const answer = {
      course: {
        title: 'Krachten',
        chapters: [{
          title: 'Krachten', sections: [
            { title: 'Zwaartekracht', goalCodes: ['NW7.1'], blocks: [{ type: 'text', markdown: 'Zwaartekracht trekt alles naar beneden.' }] },
          ],
        }],
      },
    };
    const res = sanitizeAICourse(answer, { allowedGoalCodes: ['NW 7.1', 'NW 7.2'] });
    expect(res.course.chapters[0].sections[0].goalCodes).toEqual(['NW7.1']);
    expect(res.warnings.some((w) => w.includes('niet in je leerplan'))).toBe(false);
  });
});

describe('buildSectionPrompt: aanvullen zonder te herhalen', () => {
  it('stuurt de bestaande tekst van de sectie mee, niet enkel de bloktypes', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const section: CourseSection = { ...course.chapters[0].sections[0], blocks: [{ id: 'b1', type: 'text', markdown: 'De zon warmt het wateroppervlak op.' }] };
    const { prompt } = buildSectionPrompt({ course, section, wishes: 'leg verdamping verder uit' });
    expect(prompt).toContain('De zon warmt het wateroppervlak op.');
    expect(prompt).toContain('herhaal');
    expect(prompt.toUpperCase()).toContain('VUL AAN');
  });

  it('werkt ook voor een lege sectie (geen "bestaat al"-instructie)', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const section: CourseSection = { ...course.chapters[0].sections[0], blocks: [] };
    const { prompt } = buildSectionPrompt({ course, section, wishes: 'leg uit wat verdamping is' });
    expect(prompt).not.toContain('BESTAANDE INHOUD');
  });
});

describe('optimaliseren per hoofdstuk', () => {
  const course = sanitizeAICourse({
    course: {
      title: 'Krachten en beweging',
      chapters: [
        { title: 'Krachten', sections: [{ title: 'Zwaartekracht', blocks: [{ type: 'text', markdown: 'Zwaartekracht trekt naar beneden.' }] }] },
        { title: 'Beweging', sections: [{ title: 'Snelheid', blocks: [{ type: 'text', markdown: 'Snelheid is afstand per tijd.' }] }] },
      ],
    },
  }).course;

  it('bouwt een prompt voor precies één hoofdstuk, met hoofdstuknummer en context', () => {
    const { prompt } = buildOptimizeChapterPrompt({
      course, chapter: course.chapters[0], chapterIndex: 1, chapterCount: 2, presets: ['taal'], wishes: '',
    });
    expect(prompt).toContain('hoofdstuk 1 van 2');
    expect(prompt).toContain('Krachten');
    expect(prompt).toContain('TAAL');
    expect(prompt).toContain('Herwerk ALLEEN hoofdstuk');
    expect(prompt).not.toContain('Snelheid'); // het andere hoofdstuk gaat niet mee
  });

  it('sanitizeAIChapter geeft een geldig hoofdstuk terug met hetzelfde id', () => {
    const raw = { chapter: { title: 'Krachten (eenvoudiger)', sections: [{ title: 'Zwaartekracht', goalCodes: ['NW 7.1'], blocks: [{ type: 'text', markdown: 'Zwaartekracht trekt je naar de grond.' }] }] } };
    const res = sanitizeAIChapter(raw, { base: course, chapterId: course.chapters[0].id, allowedGoalCodes: ['NW 7.1'] });
    expect(res.chapter).not.toBeNull();
    expect(res.chapter!.id).toBe(course.chapters[0].id);
    expect(res.chapter!.sections[0].goalCodes).toEqual(['NW 7.1']);
  });

  it('een mediablok van een ANDER hoofdstuk telt niet mee als "weggevallen"', () => {
    const withImage: Course = {
      ...course,
      chapters: [
        course.chapters[0],
        {
          ...course.chapters[1],
          sections: [{ ...course.chapters[1].sections[0], blocks: [...course.chapters[1].sections[0].blocks, { id: 'img-1', type: 'image', url: 'x' }] }],
        },
      ],
    };
    const raw = { chapter: { title: 'Krachten', sections: [{ title: 'Zwaartekracht', blocks: [{ type: 'text', markdown: 'Tekst.' }] }] } };
    const res = sanitizeAIChapter(raw, { base: withImage, chapterId: withImage.chapters[0].id });
    expect(res.warnings.some((w) => w.includes('weggevallen') || w.includes('kwam niet terug'))).toBe(false);
  });

  it('geeft null met waarschuwing bij een onbruikbaar antwoord', () => {
    const res = sanitizeAIChapter(null, { base: course, chapterId: course.chapters[0].id });
    expect(res.chapter).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe('checkMissingTopics', () => {
  it('haalt kernwoorden (≥6 letters, geen stopwoorden) uit een titel', () => {
    expect(extractTopicKeywords('Massa, volume en massadichtheid')).toEqual(['volume', 'massadichtheid']);
  });

  it('negeert hoofdletters en accenten, en ontdubbelt', () => {
    expect(extractTopicKeywords('Écologie en ecologie')).toEqual(['ecologie']);
  });

  it('signaleert een kernwoord dat nergens in de cursus voorkomt', () => {
    const course = sanitizeAICourse({
      course: {
        title: 'Massa, volume en massadichtheid',
        chapters: [{ title: 'Massa', sections: [{ title: 'Wat is massa?', blocks: [{ type: 'text', markdown: 'Massa is de hoeveelheid stof in een voorwerp. Volume is de ruimte die het inneemt.' }] }] }],
      },
    }).course;
    const check = checkMissingTopics('Massa, volume en massadichtheid', course);
    expect(check.keywords).toEqual(['volume', 'massadichtheid']);
    expect(check.missing).toEqual(['massadichtheid']);
  });

  it('geeft geen missende kernwoorden als alles terugkomt', () => {
    const course = sanitizeAICourse({
      course: {
        title: 'Massa, volume en massadichtheid',
        chapters: [{ title: 'Massadichtheid', sections: [{ title: 'Massadichtheid', blocks: [{ type: 'text', markdown: 'De massadichtheid is de verhouding tussen massa en volume.' }] }] }],
      },
    }).course;
    expect(checkMissingTopics('Massa, volume en massadichtheid', course).missing).toEqual([]);
  });

  it('geeft geen kernwoorden (en dus geen waarschuwing) bij een titel zonder lange woorden', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    expect(checkMissingTopics('De les', course)).toEqual({ keywords: [], missing: [] });
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
