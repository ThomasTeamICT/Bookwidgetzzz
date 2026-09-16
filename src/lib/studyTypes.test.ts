import { describe, expect, it } from 'vitest';
import type { StudyProgress, StudyTopic } from './studyTypes';
import {
  countdown, daysUntil, emptyProgress, overallMastery, parseDateOnly, questionMastery,
  sortTopics, studyState, termMastery, usedLearners, usedSubjects,
} from './studyTypes';

// Vaste "nu": 9 september 2026, 10:30 lokale tijd.
const NU = new Date(2026, 8, 9, 10, 30).getTime();

function topic(over: Partial<StudyTopic> = {}): StudyTopic {
  return {
    id: 't1', leerling: 'Will', vak: 'Wiskunde', titel: 'Transformaties',
    emoji: '📐', kleur: '#4f46e5',
    doelen: [], secties: [], notaties: [], begrippen: [], valkuilen: [], vragen: [], fotos: [],
    createdAt: 1, updatedAt: 1,
    ...over,
  };
}

function stand(over: Partial<StudyProgress> = {}): StudyProgress {
  return { ...emptyProgress('t1'), ...over };
}

const gekend = (ja: boolean) => ({ goed: ja ? 1 : 0, fout: ja ? 0 : 1, gekend: ja, laatst: NU });

describe('datums', () => {
  it('leest een geldige datum en weigert onzin', () => {
    expect(parseDateOnly('2026-09-15')?.getDate()).toBe(15);
    expect(parseDateOnly('2026-02-31')).toBeNull(); // rolt door naar maart: bestaat niet
    expect(parseDateOnly('15/09/2026')).toBeNull();
    expect(parseDateOnly('')).toBeNull();
  });

  it('telt in hele kalenderdagen, ongeacht het uur', () => {
    expect(daysUntil('2026-09-09', NU)).toBe(0);
    expect(daysUntil('2026-09-10', NU)).toBe(1);
    expect(daysUntil('2026-09-16', NU)).toBe(7);
    expect(daysUntil('2026-09-08', NU)).toBe(-1);
    expect(daysUntil(undefined, NU)).toBeNull();
  });

  it('telt ook over een maandgrens en een zomertijdwissel heen', () => {
    // 25 oktober 2026 is de nacht waarin de klok een uur terugvalt (EU).
    const eindOktober = new Date(2026, 9, 24, 12, 0).getTime();
    expect(daysUntil('2026-10-26', eindOktober)).toBe(2);
    expect(daysUntil('2026-11-02', eindOktober)).toBe(9);
  });

  it('zet het aantal dagen om in taal en urgentie', () => {
    expect(countdown('2026-09-09', NU)).toMatchObject({ label: 'vandaag', toon: 'urgent' });
    expect(countdown('2026-09-10', NU)).toMatchObject({ label: 'morgen', toon: 'urgent' });
    expect(countdown('2026-09-13', NU)).toMatchObject({ label: 'over 4 dagen', toon: 'dichtbij' });
    expect(countdown('2026-10-01', NU)).toMatchObject({ toon: 'ver' });
    expect(countdown('2026-09-08', NU)).toMatchObject({ label: 'gisteren geweest', toon: 'voorbij' });
    expect(countdown('2026-09-06', NU)).toMatchObject({ label: '3 dagen geleden geweest', toon: 'voorbij' });
    expect(countdown(undefined, NU)).toBeNull();
  });
});

describe('voortgang', () => {
  const vol = topic({
    doelen: [{ id: 'd1', tekst: 'a' }, { id: 'd2', tekst: 'b' }],
    vragen: [
      { id: 'v1', vraag: 'x', antwoord: 'y' },
      { id: 'v2', vraag: 'x', antwoord: 'y' },
      { id: 'v3', vraag: 'x', antwoord: 'y' },
    ],
    begrippen: [{ id: 'b1', term: 't', uitleg: 'u' }],
  });

  it('telt per onderdeel wat gekend is', () => {
    const p = stand({
      doelen: ['d1'],
      vragen: { v1: gekend(true), v2: gekend(false) },
      begrippen: { b1: gekend(true) },
    });
    expect(questionMastery(vol, p)).toEqual({ gekend: 1, totaal: 3, percent: 33 });
    expect(termMastery(vol, p)).toEqual({ gekend: 1, totaal: 1, percent: 100 });
    // 1 doel + 1 vraag + 1 begrip van 2 + 3 + 1 = 3 van 6
    expect(overallMastery(vol, p)).toEqual({ gekend: 3, totaal: 6, percent: 50 });
  });

  it('geeft 0% zonder voortgang en deelt nooit door nul', () => {
    expect(overallMastery(vol, undefined)).toEqual({ gekend: 0, totaal: 6, percent: 0 });
    expect(overallMastery(topic(), undefined)).toEqual({ gekend: 0, totaal: 0, percent: 0 });
    expect(questionMastery(topic(), stand())).toEqual({ gekend: 0, totaal: 0, percent: 0 });
  });

  it('laat een onderdeel pas "klaar" zijn vanaf 90 procent', () => {
    expect(studyState(vol, undefined)).toBe('nieuw');
    // Gestudeerd, maar nog niet alles gekend.
    expect(studyState(vol, stand({ laatstGestudeerd: NU, doelen: ['d1'] }))).toBe('bezig');
    const bijna = stand({
      laatstGestudeerd: NU,
      doelen: ['d1', 'd2'],
      vragen: { v1: gekend(true), v2: gekend(true), v3: gekend(true) },
      begrippen: { b1: gekend(true) },
    });
    expect(studyState(vol, bijna)).toBe('klaar');
  });

  it('een leeg onderdeel blijft "nieuw", ook na een studiebeurt', () => {
    expect(studyState(topic(), stand({ laatstGestudeerd: NU }))).toBe('nieuw');
  });
});

describe('volgorde op het overzicht', () => {
  it('zet de eerstvolgende toets vooraan, daarna zonder datum, dan voorbij, dan archief', () => {
    const morgen = topic({ id: 'morgen', toetsDatum: '2026-09-10' });
    const volgendeWeek = topic({ id: 'week', toetsDatum: '2026-09-16' });
    const zonder = topic({ id: 'zonder', updatedAt: 500 });
    const voorbij = topic({ id: 'voorbij', toetsDatum: '2026-09-01' });
    const archief = topic({ id: 'archief', toetsDatum: '2026-09-11', gearchiveerd: true });

    const volgorde = sortTopics([archief, voorbij, zonder, volgendeWeek, morgen], NU).map((t) => t.id);
    expect(volgorde).toEqual(['morgen', 'week', 'zonder', 'voorbij', 'archief']);
  });

  it('zet bij gelijke situatie het recentst bijgewerkte onderdeel eerst', () => {
    const oud = topic({ id: 'oud', updatedAt: 100 });
    const nieuw = topic({ id: 'nieuw', updatedAt: 900 });
    expect(sortTopics([oud, nieuw], NU).map((t) => t.id)).toEqual(['nieuw', 'oud']);
  });

  it('raakt de originele lijst niet aan', () => {
    const lijst = [topic({ id: 'a', toetsDatum: '2026-09-20' }), topic({ id: 'b', toetsDatum: '2026-09-10' })];
    sortTopics(lijst, NU);
    expect(lijst.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('filters', () => {
  it('verzamelt vakken en leerlingen zonder dubbels, alfabetisch', () => {
    const lijst = [
      topic({ vak: 'Wiskunde', leerling: 'Will' }),
      topic({ vak: 'Frans', leerling: 'Will' }),
      topic({ vak: 'Wiskunde', leerling: 'Anna' }),
      topic({ vak: '  ', leerling: '' }),
    ];
    expect(usedSubjects(lijst)).toEqual(['Frans', 'Wiskunde']);
    expect(usedLearners(lijst)).toEqual(['Anna', 'Will']);
  });
});
