import { describe, expect, it } from 'vitest';
import { importTopicsJson, sanitizeTopic } from './study';

// De opslaglaag zelf leunt op localStorage; deze test dekt het inlezen, want
// dáár komt vreemde invoer binnen (een bestand van een ander toestel, of een
// oudere versie van de app).

describe('inlezen van leerstof', () => {
  it('weigert wat geen leerstof is', () => {
    expect(importTopicsJson('geen json')).toBeNull();
    expect(importTopicsJson('null')).toBeNull();
    expect(importTopicsJson('{"v":1,"kind":"leerstof","t":{}}')).toBeNull(); // geen titel
    expect(importTopicsJson('{"v":1,"kind":"leerstof","t":[]}')).toBeNull();
  });

  it('leest één onderdeel en een bundel', () => {
    const een = importTopicsJson(JSON.stringify({ v: 1, kind: 'leerstof', t: { titel: 'Breuken' } }));
    expect(een).toHaveLength(1);
    expect(een?.[0].titel).toBe('Breuken');

    const bundel = importTopicsJson(JSON.stringify({
      v: 1, kind: 'leerstof-bundel', t: [{ titel: 'Breuken' }, { titel: 'Frans les 3' }, { geenTitel: true }],
    }));
    expect(bundel?.map((t) => t.titel)).toEqual(['Breuken', 'Frans les 3']);
  });

  it('gooit rommel uit de lijsten en vult ontbrekende id\'s aan', () => {
    const topic = sanitizeTopic({
      titel: 'Transformaties',
      kleur: 'javascript:alert(1)',
      doelen: [{ tekst: 'iets kennen' }, { tekst: '   ' }, null, 'tekst'],
      vragen: [{ vraag: 'Wat is een dekpunt?', antwoord: 'Een punt dat zichzelf als beeld heeft.' }, { antwoord: 'zonder vraag' }],
      secties: [{ titel: 'Theorie', markdown: 'tekst', figuur: 'raket' }],
      fotos: [{ url: '' }],
      gearchiveerd: 'ja',
    });
    expect(topic).not.toBeNull();
    expect(topic?.doelen).toHaveLength(1);
    expect(topic?.doelen[0].id).toBeTruthy();
    expect(topic?.vragen).toHaveLength(1);
    expect(topic?.fotos).toHaveLength(0);
    // Een onbekende figuurnaam mag nooit in het model belanden.
    expect(topic?.secties[0].figuur).toBeUndefined();
    // Een kleur die geen hexkleur is, wordt niet overgenomen (zou in style landen).
    expect(topic?.kleur).toMatch(/^#[0-9a-f]{6}$/i);
    // Alleen een echte true telt als gearchiveerd.
    expect(topic?.gearchiveerd).toBe(false);
  });

  it('behoudt de id van een bestaand onderdeel, zodat opnieuw inlezen bijwerkt', () => {
    const topic = sanitizeTopic({ id: 'abc123', titel: 'Breuken' });
    expect(topic?.id).toBe('abc123');
  });
});
