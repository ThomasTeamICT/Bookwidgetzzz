import { describe, expect, it } from 'vitest';
import { buildCurriculumPrompt, sanitizeAICurriculum, subjectAbbrev } from './aiCurriculum';

describe('afkorting voor zelfgemaakte codes', () => {
  it('neemt initialen bij meerdere woorden en drie letters bij één woord', () => {
    expect(subjectAbbrev('Project algemene vakken')).toBe('PAV');
    expect(subjectAbbrev('Natuurwetenschappen')).toBe('NAT');
    expect(subjectAbbrev('  ')).toBe('DOEL');
    expect(subjectAbbrev(undefined)).toBe('DOEL');
  });
});

describe('sanering van een AI-doelenlijst', () => {
  it('normaliseert codes, ontdubbelt en laat lege doelen vallen', () => {
    const res = sanitizeAICurriculum({
      goals: [
        { code: ' nw  1.1 ', text: '  De leerlingen   beschrijven de waterkringloop. ', theme: 'Systeem aarde' },
        { code: 'NW 1.1', text: 'Dubbele code — moet wegvallen.', theme: 'Systeem aarde' },
        { code: 'NW 1.2', text: '   ', theme: 'Systeem aarde' },
        { code: 'nw 1.3', text: 'Verdiepingsdoel.', theme: 'Systeem aarde', level: 'uitbreiding', note: 'Enkel A-stroom.' },
        'geen object',
      ],
    });
    expect(res.goals.map((g) => g.code)).toEqual(['NW 1.1', 'NW 1.3']);
    expect(res.goals[0].text).toBe('De leerlingen beschrijven de waterkringloop.');
    expect(res.goals[0].level).toBeUndefined();
    expect(res.goals[1].level).toBe('uitbreiding');
    expect(res.goals[1].note).toBe('Enkel A-stroom.');
    expect(res.goals[0].id).toBeTruthy();
    expect(res.warnings.some((w) => w.includes('weggelaten'))).toBe(true);
  });

  it('maakt zelf codes per thema als de AI er geen gaf', () => {
    const res = sanitizeAICurriculum(
      {
        doelen: [
          { text: 'Doel A', theme: 'Materie' },
          { text: 'Doel B', theme: 'Materie' },
          { text: 'Doel C', theme: 'Energie' },
          { text: 'Doel D' },
        ],
      },
      { subject: 'Natuurwetenschappen' }
    );
    expect(res.goals.map((g) => g.code)).toEqual(['NAT 1.1', 'NAT 1.2', 'NAT 2.1', 'NAT 3.1']);
  });

  it('aanvaardt een kale array en Nederlandse veldnamen', () => {
    const res = sanitizeAICurriculum([{ nummer: 'MD 6.12', doel: 'De leerlingen rekenen.', thema: 'Getallen' }]);
    expect(res.goals).toHaveLength(1);
    expect(res.goals[0]).toMatchObject({ code: 'MD 6.12', text: 'De leerlingen rekenen.', theme: 'Getallen' });
  });

  it('geeft een nette melding bij rommel in plaats van te crashen', () => {
    for (const bad of [null, undefined, 'tekst', {}, { goals: 'nope' }, 42]) {
      const res = sanitizeAICurriculum(bad);
      expect(res.goals).toEqual([]);
      expect(res.warnings.length).toBeGreaterThan(0);
    }
  });

  it('laat een lijst zonder bruikbare doelen niet als succes doorgaan', () => {
    const res = sanitizeAICurriculum({ goals: [{ code: 'A 1', text: '' }] });
    expect(res.goals).toEqual([]);
    expect(res.warnings.some((w) => w.includes('bruikbaar'))).toBe(true);
  });
});

describe('prompt voor leerplanstructurering', () => {
  it('vraagt de officiële codes te behouden en geeft de vakafkorting mee', () => {
    const { system, prompt } = buildCurriculumPrompt({ text: 'x'.repeat(100), subject: 'Natuurwetenschappen', level: '1e graad' });
    expect(system).toContain('LETTERLIJK');
    expect(prompt).toContain('NAT <themanummer>.<volgnummer>');
    expect(prompt).toContain('"goals"');
    expect(prompt).toContain('1e graad');
  });

  it('knipt heel lange teksten af', () => {
    const { prompt } = buildCurriculumPrompt({ text: 'a'.repeat(80000) });
    expect(prompt.length).toBeLessThan(45000);
  });
});
