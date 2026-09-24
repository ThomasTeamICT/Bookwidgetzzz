import { describe, expect, it } from 'vitest';
import { firstHeadingTitle, suggestCourseTitle } from './importTitle';

describe('firstHeadingTitle', () => {
  it('vindt een kop van niveau 1', () => {
    expect(firstHeadingTitle('# De waterkringloop\n\nTekst.')).toBe('De waterkringloop');
  });

  it('vindt een kop van een dieper niveau als er geen hogere is', () => {
    expect(firstHeadingTitle('Wat inleidende tekst.\n\n## Verdamping\n\nMeer tekst.')).toBe('Verdamping');
  });

  it('negeert een afsluitende reeks #-tekens', () => {
    expect(firstHeadingTitle('# Titel ##')).toBe('Titel');
  });

  it('geeft undefined als er geen kop is', () => {
    expect(firstHeadingTitle('Gewone tekst.\nNog een zin.')).toBeUndefined();
  });

  it('geeft undefined voor lege of ontbrekende tekst', () => {
    expect(firstHeadingTitle('')).toBeUndefined();
  });
});

describe('suggestCourseTitle', () => {
  it('gebruikt de eerste kop als die er is', () => {
    expect(suggestCourseTitle('# Hoofdstuk 3: Materie\n\nTekst.', 'hoofdstuk 3')).toBe('Hoofdstuk 3: Materie');
  });

  it('valt terug op de meegegeven titel zonder kop', () => {
    expect(suggestCourseTitle('Gewone tekst zonder kop.', 'hoofdstuk 3')).toBe('hoofdstuk 3');
  });

  it('valt terug op "Nieuwe cursus" als beide leeg zijn', () => {
    expect(suggestCourseTitle('', '  ')).toBe('Nieuwe cursus');
  });
});
