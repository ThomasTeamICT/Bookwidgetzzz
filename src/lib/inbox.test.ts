import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { processCodes, splitCodes, summarizeReport, type InboxDeps } from './inbox';
import { encodeCourseProgress } from './courses';
import type { ClassGroup } from './classTypes';
import type { Course, CourseProgress } from './courseTypes';
import type { Submission, Widget } from './types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const klas: ClassGroup = {
  id: 'k1', name: '1A', code: 'KLAS01', students: [
    { id: 'st1', name: 'Emma Peeters', number: 1 },
    { id: 'st2', name: 'Noah Claes', number: 2 },
  ],
  createdAt: 0, updatedAt: 0,
};

const quiz: Widget = {
  id: 'w1', type: 'quiz', title: 'Quiz over België', folderId: null, code: 'WQUIZ1',
  config: { questions: [] }, settings: {} as Widget['settings'], createdAt: 0, updatedAt: 0,
};

const cursus: Course = {
  id: 'c1', title: 'De waterkringloop', author: '', coverEmoji: '💧', code: 'CWATER',
  chapters: [{
    id: 'ch1', title: 'H1',
    sections: [
      { id: 's1', title: 'S1', blocks: [] },
      { id: 's2', title: 'S2', blocks: [] },
    ],
  }],
  settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
  createdAt: 0, updatedAt: 0,
};

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub1', widgetId: 'w1', widgetCode: 'WQUIZ1', studentName: 'Emma Peeters',
    startedAt: 1000, submittedAt: 2000, durationSec: 30, answers: { q1: true },
    itemScores: null, totalEarned: 7, totalMax: 10, status: 'graded',
    ...over,
  };
}

/** Zelfde vorm als lib/share.ts: WF1. + lz-string. */
function resultCode(sub: Submission): string {
  return 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(sub));
}

function progress(over: Partial<CourseProgress> = {}): CourseProgress {
  return {
    courseId: 'c1', courseCode: 'CWATER', studentName: 'Noah Claes',
    sections: { s1: { openedAt: 1, completedAt: 2, secondsSpent: 60 } },
    lastSeenAt: 5000, startedAt: 1000,
    ...over,
  };
}

/** Deps met alles in het geheugen; `saved` legt vast wat er bewaard werd. */
function makeDeps(over: Partial<InboxDeps> = {}) {
  const savedSubs: Submission[] = [];
  const savedProgress: CourseProgress[] = [];
  const bestaand: Submission[] = (over.submissions ?? []) as Submission[];
  const deps: InboxDeps = {
    classes: [klas],
    submissions: bestaand,
    findWidget: (sub) => (sub.widgetId === quiz.id || sub.widgetCode === quiz.code ? quiz : undefined),
    findCourse: (p) => (p.courseId === cursus.id || p.courseCode === cursus.code ? cursus : undefined),
    findProgress: (courseId, studentName) =>
      savedProgress.find((p) => p.courseId === courseId && p.studentName.toLowerCase() === studentName.toLowerCase()),
    saveSubmission: (s) => { savedSubs.push(s); },
    saveProgress: (p) => { savedProgress.push(p); },
    newId: () => 'nieuw-id',
    ...over,
  };
  return { deps, savedSubs, savedProgress };
}

// ── Codes uit tekst halen ───────────────────────────────────────────────────

describe('splitCodes', () => {
  it('vist codes uit een geplakt bericht met begeleidende tekst', () => {
    const codes = splitCodes('Dag juf! Hier is mijn code: "WF1.AAA", en die van de cursus (WFC1.BBB).\nWF1.CCC');
    expect(codes).toEqual(['WF1.AAA', 'WFC1.BBB', 'WF1.CCC']);
  });

  it('negeert alles wat geen code is', () => {
    expect(splitCodes('geen enkele code hier')).toEqual([]);
    expect(splitCodes('')).toEqual([]);
  });
});

// ── Verwerking ──────────────────────────────────────────────────────────────

describe('processCodes — resultaatcodes', () => {
  it('bewaart een nieuwe inzending en beschrijft ze met klas en score', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(resultCode(submission({ classId: 'k1', studentId: 'st1', studentName: 'emma' })), deps);
    expect(report.nieuw).toBe(1);
    expect(savedSubs).toHaveLength(1);
    const row = report.rows[0];
    expect(row.outcome).toBe('nieuw');
    expect(row.kind).toBe('widget');
    expect(row.saved).toBe(true);
    // naam uit de klaslijst, niet wat de leerling typte
    expect(row.studentName).toBe('Emma Peeters');
    expect(row.className).toBe('1A');
    expect(row.title).toBe('Quiz over België');
    expect(row.detail).toBe('7/10 · 70%');
  });

  it('ontdubbelt binnen dezelfde plakbeurt', () => {
    const code = resultCode(submission());
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(`${code}\n${code}`, deps);
    expect(report.nieuw).toBe(1);
    expect(report.dubbel).toBe(1);
    expect(savedSubs).toHaveLength(1);
    expect(report.rows[1].message).toMatch(/stond hier al/i);
  });

  it('herkent werk dat hier al staat (zelfde widget, naam en indienmoment)', () => {
    const { deps, savedSubs } = makeDeps({ submissions: [submission({ id: 'ander-id' })] });
    const report = processCodes(resultCode(submission()), deps);
    expect(report.dubbel).toBe(1);
    expect(report.nieuw).toBe(0);
    expect(savedSubs).toHaveLength(0);
  });

  it('geeft een nieuw id wanneer dat id hier al bestaat (nooit iets overschrijven)', () => {
    const { deps, savedSubs } = makeDeps({ submissions: [submission({ submittedAt: 999 })] });
    const report = processCodes(resultCode(submission({ submittedAt: 3000 })), deps);
    expect(report.nieuw).toBe(1);
    expect(savedSubs[0].id).toBe('nieuw-id');
  });

  it('zet de inzending op het widget-id van dit toestel (ander id na een deellink)', () => {
    const { deps, savedSubs } = makeDeps();
    processCodes(resultCode(submission({ widgetId: 'id-van-thuis', widgetCode: 'WQUIZ1' })), deps);
    expect(savedSubs[0].widgetId).toBe('w1');
  });

  it('bewaart werk voor een onbekende widget, maar zegt het erbij', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(resultCode(submission({ widgetId: 'onbekend', widgetCode: 'XXXXXX' })), deps);
    expect(report.onbekend).toBe(1);
    expect(report.rows[0].saved).toBe(true);
    expect(report.rows[0].title).toBeNull();
    expect(report.rows[0].message).toMatch(/staat niet op dit toestel/i);
    expect(savedSubs).toHaveLength(1);
  });

  it('meldt een beschadigde of onvolledige code', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes('WF1.dit-is-afgekapt', deps);
    expect(report.ongeldig).toBe(1);
    expect(report.rows[0].message).toMatch(/onvolledig of beschadigd/i);
    expect(savedSubs).toHaveLength(0);
  });
});

describe('processCodes — voortgangscodes', () => {
  it('bewaart leesvoortgang, met percentage en klas', () => {
    const { deps, savedProgress } = makeDeps();
    const report = processCodes(encodeCourseProgress(progress({ studentId: 'st2', classId: 'k1' })), deps);
    expect(report.nieuw).toBe(1);
    expect(savedProgress).toHaveLength(1);
    const row = report.rows[0];
    expect(row.kind).toBe('course');
    expect(row.studentName).toBe('Noah Claes');
    expect(row.className).toBe('1A');
    expect(row.title).toBe('De waterkringloop');
    expect(row.detail).toBe('50% gelezen (1/2 secties)');
    // classId en studentId overleven de voortgangscode
    expect(savedProgress[0].classId).toBe('k1');
    expect(savedProgress[0].studentId).toBe('st2');
  });

  it('werkt niets bij als dezelfde voortgang al binnen is', () => {
    const { deps, savedProgress } = makeDeps();
    const code = encodeCourseProgress(progress());
    const eerste = processCodes(code, deps);
    expect(eerste.nieuw).toBe(1);
    const tweede = processCodes(code, deps);
    expect(tweede.dubbel).toBe(1);
    expect(savedProgress).toHaveLength(1);
  });

  it('neemt nieuwere voortgang van dezelfde leerling wél over', () => {
    const { deps, savedProgress } = makeDeps();
    processCodes(encodeCourseProgress(progress()), deps);
    const later = progress({
      lastSeenAt: 9000,
      sections: {
        s1: { openedAt: 1, completedAt: 2, secondsSpent: 60 },
        s2: { openedAt: 3, completedAt: 4, secondsSpent: 60 },
      },
    });
    const report = processCodes(encodeCourseProgress(later), deps);
    expect(report.nieuw).toBe(1);
    expect(savedProgress).toHaveLength(2);
    expect(report.rows[0].detail).toBe('100% gelezen (2/2 secties)');
  });

  it('bewaart voortgang van een cursus die hier niet staat', () => {
    const { deps, savedProgress } = makeDeps();
    const report = processCodes(encodeCourseProgress(progress({ courseId: 'weg', courseCode: 'ZZZZZZ' })), deps);
    expect(report.onbekend).toBe(1);
    expect(savedProgress).toHaveLength(1);
  });
});

describe('samenvatting', () => {
  it('vat een gemengde beurt kort samen', () => {
    const { deps } = makeDeps();
    const code = resultCode(submission());
    const report = processCodes(`${code} ${code} WF1.kapot`, deps);
    expect(summarizeReport(report)).toBe('1 nieuw, 1 al aanwezig, 1 ongeldig');
    expect(summarizeReport({ rows: [], nieuw: 0, dubbel: 0, onbekend: 0, ongeldig: 0 })).toBe('Geen codes gevonden.');
  });
});
