import { describe, expect, it } from 'vitest';
import { aggregateGoalScores, courseGoalCodes, goalPct, scoresPerGoal, widgetGoalCodes } from './goals';
import type { Submission, Widget } from './types';
import type { Course } from './courseTypes';

const widget = {
  id: 'w1', type: 'quiz', title: 'q', folderId: null, code: 'ABC123', createdAt: 0, updatedAt: 0,
  settings: {} as Widget['settings'],
  config: { questions: [
    { id: 'a', goalCode: 'wis 2.3' }, { id: 'b', goalCode: 'WIS 2.3' }, { id: 'c', goalCode: 'WIS 1.1' }, { id: 'd' },
  ] },
} as unknown as Widget;

const sub = {
  id: 's', widgetId: 'w1', widgetCode: 'ABC123', studentName: 'Jan', startedAt: 0, submittedAt: 0, durationSec: 0,
  answers: {}, totalEarned: 3, totalMax: 4, status: 'submitted',
  itemScores: { a: { earned: 1, max: 1, mode: 'auto' }, b: { earned: 0, max: 1, mode: 'auto' }, c: { earned: 1, max: 1, mode: 'auto' }, d: { earned: 1, max: 1, mode: 'auto' } },
} as unknown as Submission;

describe('doelcodes', () => {
  it('normaliseert codes (spaties, hoofdletters) en ontdubbelt', () => {
    expect(widgetGoalCodes(widget)).toEqual(['WIS 2.3', 'WIS 1.1']);
  });
  it('telt scores per doel op; vragen zonder code tellen niet mee', () => {
    const per = scoresPerGoal(sub, widget);
    expect(per).toEqual([
      { code: 'WIS 2.3', earned: 1, max: 2, items: 2 },
      { code: 'WIS 1.1', earned: 1, max: 1, items: 1 },
    ]);
    expect(goalPct(per[0])).toBe(50);
    expect(goalPct(undefined)).toBeNull();
  });
  it('voegt lijsten samen over inzendingen heen', () => {
    const agg = aggregateGoalScores([scoresPerGoal(sub, widget), scoresPerGoal(sub, widget)]);
    expect(agg.get('WIS 2.3')).toEqual({ code: 'WIS 2.3', earned: 2, max: 4, items: 4 });
  });
  it('verzamelt cursusdoelen uit secties en meegegeven widgets', () => {
    const course = { chapters: [{ id: 'c', title: '', emoji: '', sections: [{ id: 's', title: '', blocks: [], goalCodes: ['wis  3.1', 'WIS 2.3'] }] }] } as unknown as Course;
    expect(courseGoalCodes(course, [widget])).toEqual(['WIS 3.1', 'WIS 2.3', 'WIS 1.1']);
  });
});
