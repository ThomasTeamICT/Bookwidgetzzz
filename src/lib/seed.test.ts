import { beforeEach, describe, expect, it } from 'vitest';
import { ensureExampleCurriculum } from './seed';
import { EXAMPLE_CURRICULUM_ID, getCurriculum, saveCurriculum } from './curriculum';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

describe('ensureExampleCurriculum', () => {
  it('plaatst het voorbeeldleerplan met alle thema\'s van de voorbeeldcursus', () => {
    const cur = ensureExampleCurriculum();
    expect(cur?.id).toBe(EXAMPLE_CURRICULUM_ID);
    const themes = new Set(cur?.goals.map((g) => g.theme));
    for (const t of ['Wetenschappelijke vaardigheden', 'Materie', 'Energie', 'Systeem aarde', 'Organismen en stelsels', 'Ecologie', 'Krachten en beweging']) {
      expect(themes.has(t)).toBe(true);
    }
    expect(cur?.goals.map((g) => g.code)).toContain('NW 5.1');
  });

  it('vult een ouder voorbeeld aan met de nieuwe doelen zonder de bestaande te overschrijven', () => {
    const first = ensureExampleCurriculum();
    if (!first) throw new Error('geen voorbeeld');
    // Oudere versie nabootsen: alleen de eerste vier doelen, één ervan aangepast.
    const old = { ...first, goals: first.goals.slice(0, 4).map((g, i) => (i === 0 ? { ...g, text: 'Eigen tekst van de leerkracht' } : g)) };
    saveCurriculum(old);
    const updated = ensureExampleCurriculum();
    expect(updated?.goals.length).toBe(first.goals.length);
    expect(updated?.goals[0].text).toBe('Eigen tekst van de leerkracht');
    expect(updated?.goals[0].id).toBe(first.goals[0].id);
    expect(getCurriculum(EXAMPLE_CURRICULUM_ID)?.goals.length).toBe(first.goals.length);
  });

  it('raakt een voorbeeld dat de leerkracht overnam (example: false) niet aan', () => {
    const first = ensureExampleCurriculum();
    if (!first) throw new Error('geen voorbeeld');
    saveCurriculum({ ...first, example: false, goals: first.goals.slice(0, 3) });
    expect(ensureExampleCurriculum()?.goals.length).toBe(3);
  });
});
