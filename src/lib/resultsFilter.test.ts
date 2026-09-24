import { describe, expect, it } from 'vitest';
import { filterSubmissionsByClass, isValidClassFilter } from './resultsFilter';
import type { Submission } from './types';

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub1', widgetId: 'w1', widgetCode: 'WQUIZ1', studentName: 'Emma Peeters',
    startedAt: 1000, submittedAt: 2000, durationSec: 30, answers: {},
    itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted',
    ...over,
  };
}

describe('filterSubmissionsByClass', () => {
  const inKlasA = submission({ id: 's1', classId: 'k1', studentId: 'st1' });
  const inKlasB = submission({ id: 's2', classId: 'k2', studentId: 'st2' });
  const zonderKlas = submission({ id: 's3' });
  const alle = [inKlasA, inKlasB, zonderKlas];

  it('geeft alles terug bij "all"', () => {
    expect(filterSubmissionsByClass(alle, 'all')).toEqual(alle);
  });

  it('houdt bij "none" enkel inzendingen zonder classId over', () => {
    expect(filterSubmissionsByClass(alle, 'none')).toEqual([zonderKlas]);
  });

  it('houdt bij een klasId enkel de inzendingen van die klas over', () => {
    expect(filterSubmissionsByClass(alle, 'k1')).toEqual([inKlasA]);
    expect(filterSubmissionsByClass(alle, 'k2')).toEqual([inKlasB]);
  });

  it('geeft een lege lijst voor een klas zonder inzendingen', () => {
    expect(filterSubmissionsByClass(alle, 'k3')).toEqual([]);
  });

  it('laat een lege lijst gewoon leeg', () => {
    expect(filterSubmissionsByClass([], 'all')).toEqual([]);
    expect(filterSubmissionsByClass([], 'none')).toEqual([]);
  });
});

describe('isValidClassFilter', () => {
  const classIds = ['k1', 'k2'];

  it('aanvaardt "all" en "none" altijd', () => {
    expect(isValidClassFilter('all', [])).toBe(true);
    expect(isValidClassFilter('none', [])).toBe(true);
  });

  it('aanvaardt een bestaand klasId', () => {
    expect(isValidClassFilter('k1', classIds)).toBe(true);
  });

  it('wijst een onbekend of verwijderd klasId af', () => {
    expect(isValidClassFilter('k9', classIds)).toBe(false);
  });
});
