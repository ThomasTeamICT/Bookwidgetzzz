import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStudentList, assignmentsForClass, dueBadge, emptyClassContext, goalScoresForStudent, matchesStudent,
  parseStudentList, sortedStudents, statusForAssignment, statusSummary, studentsToText, upsertAssignment,
  type ClassDataContext,
} from './classes';
import type { Assignment, ClassStudent } from './classTypes';
import type { Course, CourseProgress } from './courseTypes';
import type { Submission, Widget } from './types';

// ── Nep-localStorage: de opslaglaag van de app draait hier in het geheugen ───

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const emma: ClassStudent = { id: 'st-emma', name: 'Emma Peeters', number: 1 };
const noah: ClassStudent = { id: 'st-noah', name: 'Noah Claes', number: 2 };

function widget(id: string, code: string, questions: unknown[] = []): Widget {
  return {
    id, type: 'quiz', title: `Widget ${id}`, folderId: null, code,
    config: { questions }, settings: {} as Widget['settings'],
    createdAt: 0, updatedAt: 0,
  };
}

function submission(over: Partial<Submission> & Pick<Submission, 'widgetId' | 'studentName'>): Submission {
  return {
    id: `sub-${Math.random().toString(36).slice(2)}`,
    widgetCode: 'ABC123',
    startedAt: 1000,
    submittedAt: 2000,
    durationSec: 10,
    answers: {},
    itemScores: null,
    totalEarned: 0,
    totalMax: 0,
    status: 'graded',
    ...over,
  } as Submission;
}

function course(id: string, sectionIds: string[], optional: string[] = []): Course {
  return {
    id, title: `Cursus ${id}`, author: '', coverEmoji: '📘', code: 'CRS001',
    chapters: [{
      id: 'ch1', title: 'H1',
      sections: sectionIds.map((sid) => ({ id: sid, title: sid, blocks: [], optional: optional.includes(sid) })),
    }],
    settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
    createdAt: 0, updatedAt: 0,
  };
}

function progress(over: Partial<CourseProgress> & Pick<CourseProgress, 'courseId' | 'studentName'>): CourseProgress {
  return {
    courseCode: 'CRS001',
    sections: {},
    lastSeenAt: 5000,
    startedAt: 1000,
    ...over,
  } as CourseProgress;
}

const widgetAssignment: Assignment = {
  id: 'a-w', classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: null, createdAt: 0,
};
const courseAssignment: Assignment = {
  id: 'a-c', classId: 'k1', kind: 'course', targetId: 'c1', dueAt: null, createdAt: 0,
};

function ctxWith(over: Partial<ClassDataContext>): ClassDataContext {
  return { ...emptyClassContext(), ...over };
}

// ── Klaslijst inlezen ───────────────────────────────────────────────────────

describe('klaslijst uit geplakte tekst', () => {
  it('leest de vormen die leerkrachten echt plakken', () => {
    const lijst = parseStudentList(
      [
        'Emma Peeters',
        '12 Noah Claes',
        '3. Olivia Maes',
        'Lucas Janssens;7',
        '8;Mila De Smet',
        '- Arthur Willems',
        '\t9\tJulia Vermeulen',
        '',
        '   ',
      ].join('\n')
    );
    expect(lijst.map((s) => [s.name, s.number])).toEqual([
      ['Emma Peeters', undefined],
      ['Noah Claes', 12],
      ['Olivia Maes', 3],
      ['Lucas Janssens', 7],
      ['Mila De Smet', 8],
      ['Arthur Willems', undefined],
      ['Julia Vermeulen', 9],
    ]);
    expect(lijst.every((s) => s.id.length > 0)).toBe(true);
  });

  it('houdt een naam met komma heel en ontdubbelt hoofdletterongevoelig', () => {
    const lijst = parseStudentList('Peeters, Emma\nPEETERS, EMMA\nDe Smet, Mila, 8');
    expect(lijst.map((s) => s.name)).toEqual(['Peeters, Emma', 'De Smet, Mila']);
    expect(lijst[1].number).toBe(8);
  });

  it('behoudt bestaande ids bij het opnieuw plakken (werk blijft gekoppeld)', () => {
    const bestaand = [emma, noah];
    const nieuw = applyStudentList(bestaand, '3 emma peeters\nLotte Coppens');
    expect(nieuw[0].id).toBe(emma.id); // zelfde leerling, nieuwe schrijfwijze en nummer
    expect(nieuw[0].name).toBe('emma peeters');
    expect(nieuw[0].number).toBe(3);
    expect(nieuw).toHaveLength(2);
    expect(nieuw[1].name).toBe('Lotte Coppens');
    expect(nieuw.some((s) => s.id === noah.id)).toBe(false); // weggelaten = weg
  });

  it('zet de lijst weer om naar plakbare tekst', () => {
    expect(studentsToText([emma, { id: 'x', name: 'Zonder nummer' }])).toBe('1 Emma Peeters\nZonder nummer');
  });

  it('sorteert op klasnummer, daarna alfabetisch', () => {
    const zonder = { id: 'z', name: 'Aaron Zonder' };
    expect(sortedStudents([noah, zonder, emma]).map((s) => s.name)).toEqual([
      'Emma Peeters', 'Noah Claes', 'Aaron Zonder',
    ]);
  });
});

// ── Status per opdracht ─────────────────────────────────────────────────────

describe('statusForAssignment — widgetopdracht', () => {
  it('geeft "niet gestart" zonder inzending', () => {
    const st = statusForAssignment(widgetAssignment, emma, ctxWith({ widgets: new Map([['w1', widget('w1', 'ABC123')]]) }));
    expect(st.state).toBe('niet gestart');
    expect(st.attempts).toBe(0);
    expect(st.scorePct).toBeNull();
    expect(statusSummary(st)).toBe('niet gestart');
  });

  it('koppelt op studentId en toont beste score en aantal pogingen', () => {
    const ctx = ctxWith({
      widgets: new Map([['w1', widget('w1', 'ABC123')]]),
      submissions: [
        submission({ widgetId: 'w1', studentName: 'iemand anders getypt', studentId: emma.id, totalEarned: 4, totalMax: 10, submittedAt: 2000 }),
        submission({ widgetId: 'w1', studentName: 'Emma', studentId: emma.id, totalEarned: 8, totalMax: 10, submittedAt: 3000 }),
        submission({ widgetId: 'w1', studentName: 'Noah Claes', studentId: noah.id, totalEarned: 2, totalMax: 10 }),
      ],
    });
    const st = statusForAssignment(widgetAssignment, emma, ctx);
    expect(st.state).toBe('ingediend');
    expect(st.attempts).toBe(2);
    expect(st.scorePct).toBe(80);
    expect(st.earned).toBe(8);
    expect(st.lastAt).toBe(3000);
    expect(statusSummary(st)).toBe('80% · 2 pogingen');
  });

  it('valt terug op de naam (hoofdletter- en spatieongevoelig) zonder studentId', () => {
    const ctx = ctxWith({
      widgets: new Map([['w1', widget('w1', 'ABC123')]]),
      submissions: [submission({ widgetId: 'w1', studentName: '  emma   PEETERS ', totalEarned: 5, totalMax: 5 })],
    });
    expect(statusForAssignment(widgetAssignment, emma, ctx).state).toBe('ingediend');
  });

  it('koppelt nooit op naam wanneer er een ander studentId op staat', () => {
    const ctx = ctxWith({
      widgets: new Map([['w1', widget('w1', 'ABC123')]]),
      submissions: [submission({ widgetId: 'w1', studentName: 'Emma Peeters', studentId: 'iemand-anders' })],
    });
    expect(statusForAssignment(widgetAssignment, emma, ctx).state).toBe('niet gestart');
    expect(matchesStudent({ studentId: 'iemand-anders', studentName: 'Emma Peeters' }, emma)).toBe(false);
  });

  it('herkent een inzending die via de widgetcode binnenkwam (ander id na een deellink)', () => {
    const ctx = ctxWith({
      widgets: new Map([['w1', widget('w1', 'ABC123')]]),
      submissions: [submission({ widgetId: 'andere-id', widgetCode: 'ABC123', studentName: 'Emma Peeters', totalEarned: 3, totalMax: 4 })],
    });
    expect(statusForAssignment(widgetAssignment, emma, ctx).scorePct).toBe(75);
  });

  it('meldt werk dat nog nagekeken moet worden', () => {
    const ctx = ctxWith({
      widgets: new Map([['w1', widget('w1', 'ABC123')]]),
      submissions: [submission({ widgetId: 'w1', studentId: emma.id, studentName: 'Emma', status: 'submitted', totalEarned: 1, totalMax: 4 })],
    });
    expect(statusForAssignment(widgetAssignment, emma, ctx).needsGrading).toBe(true);
  });

  it('toont "bezig" zolang er alleen live activiteit is', () => {
    const ctx = ctxWith({
      widgets: new Map([['w1', widget('w1', 'ABC123')]]),
      live: [{ widgetId: 'w1', studentName: 'emma peeters', startedAt: 1234 }],
    });
    const st = statusForAssignment(widgetAssignment, emma, ctx);
    expect(st.state).toBe('bezig');
    expect(st.lastAt).toBe(1234);
  });
});

describe('statusForAssignment — cursusopdracht', () => {
  const c = course('c1', ['s1', 's2', 's3'], ['s3']); // s3 is een keuzesectie

  it('geeft "niet gestart" zonder voortgang', () => {
    const st = statusForAssignment(courseAssignment, emma, ctxWith({ courses: new Map([['c1', c]]) }));
    expect(st.state).toBe('niet gestart');
    expect(st.progressPct).toBeNull();
  });

  it('rekent leesvoortgang in procent van de verplichte secties', () => {
    const ctx = ctxWith({
      courses: new Map([['c1', c]]),
      progress: [progress({
        courseId: 'c1', studentName: 'Emma Peeters', studentId: emma.id,
        sections: { s1: { openedAt: 1, completedAt: 2, secondsSpent: 60 }, s2: { openedAt: 3, secondsSpent: 20 } },
      })],
    });
    const st = statusForAssignment(courseAssignment, emma, ctx);
    expect(st.state).toBe('bezig');
    expect(st.progressPct).toBe(50);
    expect(statusSummary(st)).toBe('50% gelezen');
  });

  it('geeft "ingediend" zodra alle verplichte secties gelezen zijn', () => {
    const ctx = ctxWith({
      courses: new Map([['c1', c]]),
      progress: [progress({
        courseId: 'c1', studentName: 'EMMA peeters',
        sections: {
          s1: { openedAt: 1, completedAt: 2, secondsSpent: 60 },
          s2: { openedAt: 3, completedAt: 4, secondsSpent: 60 },
        },
      })],
    });
    const st = statusForAssignment(courseAssignment, emma, ctx);
    expect(st.state).toBe('ingediend');
    expect(st.progressPct).toBe(100);
  });
});

// ── Score per leerplandoel ──────────────────────────────────────────────────

describe('goalScoresForStudent', () => {
  it('telt de doelen op over losse widgets én oefeningen in een cursus', () => {
    const quiz = widget('w1', 'ABC123', [
      { id: 'q1', goalCode: 'wis 2.3' },
      { id: 'q2', goalCode: 'WIS 2.3' },
      { id: 'q3' },
    ]);
    const embedded = widget('w9', 'ZZZ999', [{ id: 'q1', goalCode: 'WIS 1.1' }]);
    const cursus: Course = {
      ...course('c1', ['s1']),
      chapters: [{
        id: 'ch1', title: 'H1',
        sections: [{ id: 's1', title: 'S1', blocks: [{ id: 'b1', type: 'widget', widgetId: 'w9' }] }],
      }],
    };
    const ctx = ctxWith({
      widgets: new Map([['w1', quiz], ['w9', embedded]]),
      courses: new Map([['c1', cursus]]),
      submissions: [
        submission({
          widgetId: 'w1', studentName: 'Emma Peeters', studentId: emma.id,
          itemScores: { q1: { earned: 1, max: 1, mode: 'auto' }, q2: { earned: 0, max: 1, mode: 'auto' }, q3: { earned: 1, max: 1, mode: 'auto' } },
        }),
        submission({
          widgetId: 'w9', widgetCode: 'ZZZ999', studentName: 'Emma Peeters', studentId: emma.id,
          itemScores: { q1: { earned: 2, max: 4, mode: 'auto' } },
        }),
        submission({
          widgetId: 'w1', studentName: 'Noah Claes', studentId: noah.id,
          itemScores: { q1: { earned: 1, max: 1, mode: 'auto' } },
        }),
      ],
    });
    const goals = goalScoresForStudent([widgetAssignment, courseAssignment], emma, ctx);
    expect(goals.get('WIS 2.3')).toEqual({ code: 'WIS 2.3', earned: 1, max: 2, items: 2 });
    expect(goals.get('WIS 1.1')).toEqual({ code: 'WIS 1.1', earned: 2, max: 4, items: 1 });
  });
});

// ── Opdracht toewijzen zonder dubbels ────────────────────────────────────────

describe('upsertAssignment', () => {
  it('maakt een nieuwe opdracht aan als er nog geen bestaat', () => {
    const { assignment, created } = upsertAssignment({
      classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: 1000, note: 'Eerste keer',
    });
    expect(created).toBe(true);
    expect(assignment.classId).toBe('k1');
    expect(assignment.dueAt).toBe(1000);
    expect(assignment.note).toBe('Eerste keer');
    expect(assignmentsForClass('k1')).toHaveLength(1);
  });

  it('werkt de bestaande opdracht bij (deadline en instructie) in plaats van een tweede aan te maken', () => {
    const eerste = upsertAssignment({ classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: 1000, note: 'Oude instructie' });
    const tweede = upsertAssignment({ classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: 2000, note: 'Nieuwe instructie' });
    expect(tweede.created).toBe(false);
    expect(tweede.assignment.id).toBe(eerste.assignment.id);
    expect(tweede.assignment.dueAt).toBe(2000);
    expect(tweede.assignment.note).toBe('Nieuwe instructie');
    expect(assignmentsForClass('k1')).toHaveLength(1);
  });

  it('maakt een aparte opdracht aan voor een andere klas', () => {
    upsertAssignment({ classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: null });
    const { created } = upsertAssignment({ classId: 'k2', kind: 'widget', targetId: 'w1', dueAt: null });
    expect(created).toBe(true);
    expect(assignmentsForClass('k1')).toHaveLength(1);
    expect(assignmentsForClass('k2')).toHaveLength(1);
  });

  it('maakt een aparte opdracht aan voor een andere soort (cursus i.p.v. widget) op hetzelfde doel-id', () => {
    upsertAssignment({ classId: 'k1', kind: 'widget', targetId: 'x1', dueAt: null });
    const { created } = upsertAssignment({ classId: 'k1', kind: 'course', targetId: 'x1', dueAt: null });
    expect(created).toBe(true);
    expect(assignmentsForClass('k1')).toHaveLength(2);
  });

  it('wist de deadline wanneer dueAt expliciet null is', () => {
    upsertAssignment({ classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: 1000, note: 'iets' });
    const { assignment } = upsertAssignment({ classId: 'k1', kind: 'widget', targetId: 'w1', dueAt: null, note: 'iets' });
    expect(assignment.dueAt).toBeNull();
  });
});

// ── Deadlines ───────────────────────────────────────────────────────────────

describe('dueBadge', () => {
  const nu = new Date('2026-03-10T09:00:00').getTime();

  it('kent geen deadline', () => {
    expect(dueBadge(null, nu)).toBeNull();
    expect(dueBadge(undefined, nu)).toBeNull();
  });

  it('zegt het in mensentaal', () => {
    expect(dueBadge(new Date('2026-03-10T23:59:00').getTime(), nu)?.label).toBe('vandaag');
    expect(dueBadge(new Date('2026-03-11T23:59:00').getTime(), nu)?.label).toBe('morgen');
    expect(dueBadge(new Date('2026-03-13T23:59:00').getTime(), nu)?.label).toBe('over 3 dagen');
    const telaat = dueBadge(new Date('2026-03-09T23:59:00').getTime(), nu);
    expect(telaat?.label).toBe('te laat');
    expect(telaat?.overdue).toBe(true);
    expect(telaat?.tone).toBe('err');
  });

  it('valt terug op een datum wanneer het nog ver is', () => {
    expect(dueBadge(new Date('2026-04-20T23:59:00').getTime(), nu)?.label).toMatch(/20/);
  });
});
