import { describe, expect, it } from 'vitest';
import { filterChapterGroups, groupWidgetIdsByChapter } from './courseTrack';
import type { Course } from './courseTypes';

function chapter(id: string, title: string, widgetIds: (string | null)[]) {
  return {
    id,
    title,
    sections: [
      {
        id: `${id}-s1`,
        title: 'Sectie',
        blocks: widgetIds.map((wid, i) =>
          wid
            ? { id: `${id}-b${i}`, type: 'widget' as const, widgetId: wid }
            : { id: `${id}-b${i}`, type: 'heading' as const, text: 'Kop', level: 2 as const }
        ),
      },
    ],
  };
}

const course = {
  id: 'c1',
  title: 'Water',
  chapters: [
    chapter('ch1', 'Verdamping', ['w1', 'w2', null]),
    chapter('ch2', 'Neerslag', [null]), // geen oefeningen
    chapter('ch3', 'Kringloop', ['w3', 'w1']), // w1 komt al voor bij ch1
  ],
} as unknown as Course;

describe('groupWidgetIdsByChapter', () => {
  const groups = groupWidgetIdsByChapter(course);

  it('groepeert in cursusvolgorde en laat hoofdstukken zonder oefeningen weg', () => {
    expect(groups.map((g) => g.chapter.id)).toEqual(['ch1', 'ch3']);
  });

  it('houdt de widgets van elk hoofdstuk in sectievolgorde', () => {
    expect(groups[0].widgetIds).toEqual(['w1', 'w2']);
  });

  it('telt een widget maar één keer, bij het eerste hoofdstuk waarin hij voorkomt', () => {
    expect(groups[1].widgetIds).toEqual(['w3']);
  });
});

describe('filterChapterGroups', () => {
  const groups = groupWidgetIdsByChapter(course);
  const titles: Record<string, string> = { w1: 'Begrippenquiz', w2: 'Koppelspel', w3: 'Invuloefening' };
  const titleOf = (id: string) => titles[id];

  it('geeft alles terug bij een lege zoekterm', () => {
    expect(filterChapterGroups(groups, '', titleOf)).toEqual(groups);
    expect(filterChapterGroups(groups, '   ', titleOf)).toEqual(groups);
  });

  it('filtert op (deel van de) titel, ongeacht hoofdletters', () => {
    const res = filterChapterGroups(groups, 'quiz', titleOf);
    expect(res).toEqual([{ chapter: course.chapters[0], widgetIds: ['w1'] }]);
  });

  it('laat een hoofdstuk zonder overblijvende oefening weg', () => {
    const res = filterChapterGroups(groups, 'invuloefening', titleOf);
    expect(res.map((g) => g.chapter.id)).toEqual(['ch3']);
  });

  it('een widget zonder titel (verwijderd) matcht geen zoekterm', () => {
    const res = filterChapterGroups(groups, 'onbestaand', () => undefined);
    expect(res).toEqual([]);
  });
});
