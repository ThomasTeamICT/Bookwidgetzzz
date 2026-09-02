// Unittests op de acht zelfscorende uitgebreide vraagtypes
// (formTypes.tsx: dropdown, rating, likert, upload —
//  interactTypes.tsx: marktext, sort, imagepoint, table).
//
// Elke test legt de PUNTENTELLING vast: volledig juist, volledig fout, de exacte
// deelfractie, een leeg antwoord en een lege/kapotte configuratie. De graders
// zijn pure functies, dus er is geen DOM nodig.

import { describe, expect, it } from 'vitest';
import { EXTRA_QTYPES } from './index';
import type {
  DropdownQuestion, ImagePointQuestion, ItemScore, LikertQuestion, MarkTextQuestion, Question,
  QuestionType, RatingQuestion, SortQuestion, TableQuestion, UploadQuestion,
} from '../../lib/types';

/** Grader van een geregistreerd vraagtype ophalen (faalt luid als het ontbreekt). */
function graderVoor(type: QuestionType): (q: Question, answer: unknown) => ItemScore | null {
  const def = EXTRA_QTYPES[type];
  if (!def) throw new Error(`Vraagtype "${type}" is niet geregistreerd in EXTRA_QTYPES.`);
  return def.grade;
}

const UITGEBREIDE_TYPES: QuestionType[] = [
  'dropdown', 'rating', 'likert', 'upload', 'marktext', 'sort', 'imagepoint', 'table',
];

// ═══════════════════════════════════════════════════════════════════════════
// dropdown — keuzelijst in zin
// ═══════════════════════════════════════════════════════════════════════════

describe('dropdown — keuzelijst in zin', () => {
  const grade = graderVoor('dropdown');
  const q = (o: Partial<DropdownQuestion> = {}): DropdownQuestion => ({
    id: 'q-dd', type: 'dropdown', prompt: 'Vul aan.', points: 2,
    text: 'De hoofdstad is {Brussel|Antwerpen|Gent} en de rivier is {Schelde|Maas}.',
    shuffle: true, ...o,
  });

  it('geeft de volle punten als elk keuzelijstje op de juiste optie staat', () => {
    expect(grade(q(), { 0: 'Brussel', 1: 'Schelde' })).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('geeft 0 als elke keuze fout is', () => {
    expect(grade(q(), { 0: 'Gent', 1: 'Maas' })?.earned).toBe(0);
  });

  it('telt de fractie juiste gaten: 1 van 2 is de helft van de punten', () => {
    expect(grade(q(), { 0: 'Brussel', 1: 'Maas' })?.earned).toBe(1);
  });

  it('rondt de fractie af op 2 decimalen (1 van 3 gaten op 1 punt = 0,33)', () => {
    const drie = q({ points: 1, text: '{a|b} {c|d} {e|f}' });
    expect(grade(drie, { 0: 'a' })?.earned).toBe(0.33);
  });

  it('geeft 0 zonder crash als er niets gekozen is', () => {
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 2, mode: 'auto' });
    expect(grade(q(), {})?.earned).toBe(0);
  });

  it('geeft 0 zonder crash bij een antwoord van de verkeerde vorm', () => {
    expect(grade(q(), ['Brussel', 'Schelde'])?.earned).toBe(0);
    expect(grade(q(), 'Brussel')?.earned).toBe(0);
  });

  it('houdt het maximum op 0 als de tekst geen enkel keuzelijstje bevat', () => {
    expect(grade(q({ text: 'Een zin zonder accolades.' }), {})).toEqual({ earned: 0, max: 0, mode: 'auto' });
    expect(grade(q({ text: '' }), {})).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('negeert spaties rond de opties bij het vergelijken', () => {
    expect(grade(q({ points: 1, text: 'Kies { Brussel | Gent }.' }), { 0: 'Brussel' })?.earned).toBe(1);
  });

  it('scoort identiek met en zonder afleiders door elkaar (shuffle mag de score niet raken)', () => {
    const antwoord = { 0: 'Brussel', 1: 'Schelde' };
    expect(grade(q({ shuffle: true }), antwoord)).toEqual(grade(q({ shuffle: false }), antwoord));
  });

  it('rekent alleen de eerste optie als juist, ook al staat ze verderop in de lijst', () => {
    expect(grade(q({ points: 1, text: 'Kies {juist|fout}.' }), { 0: 'fout' })?.earned).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// rating & likert — meningsvragen, nooit beoordeeld
// ═══════════════════════════════════════════════════════════════════════════

describe('rating — beoordeling met sterren', () => {
  const grade = graderVoor('rating');
  const q = (o: Partial<RatingQuestion> = {}): RatingQuestion => ({
    id: 'q-rt', type: 'rating', prompt: 'Hoe vlot ging het?', points: 0, scale: 5, ...o,
  });

  it('levert nooit punten op — het is een mening, geen juist of fout', () => {
    expect(grade(q(), 5)).toEqual({ earned: 0, max: 0, mode: 'auto' });
    expect(grade(q(), 1)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('houdt het maximum op 0, ook als de leerkracht er per ongeluk punten op zet', () => {
    expect(grade(q({ points: 4 }), 5)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('scoort zonder crash als er geen beoordeling gegeven is', () => {
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

describe('likert — stellingenmatrix', () => {
  const grade = graderVoor('likert');
  const q = (o: Partial<LikertQuestion> = {}): LikertQuestion => ({
    id: 'q-lk', type: 'likert', prompt: 'Wat vind je?', points: 0,
    statements: [{ id: 's1', text: 'Ik werk graag samen.' }, { id: 's2', text: 'Ik plan vooruit.' }],
    options: ['Oneens', 'Neutraal', 'Eens'], ...o,
  });

  it('levert nooit punten op, ook niet bij een volledig ingevulde matrix', () => {
    expect(grade(q(), { s1: 2, s2: 0 })).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('houdt het maximum op 0, ook als de leerkracht er punten op zet', () => {
    expect(grade(q({ points: 3 }), { s1: 2 })).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('scoort zonder crash bij een leeg antwoord', () => {
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// upload — bestand inleveren
// ═══════════════════════════════════════════════════════════════════════════

describe('upload — bestand inleveren', () => {
  const grade = graderVoor('upload');
  const q = (o: Partial<UploadQuestion> = {}): UploadQuestion => ({
    id: 'q-up', type: 'upload', prompt: 'Lever je verslag in.', points: 4, accept: '', maxMb: 2, ...o,
  });

  it('scoort automatisch 0 op het volledige maximum als er geen bestand is', () => {
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 4, mode: 'auto' });
  });

  it('zet een ingeleverd bestand op manueel nakijken (null = pending)', () => {
    expect(grade(q(), { name: 'verslag.pdf', size: 12345, fileId: 'f-1' })).toBeNull();
  });

  it('aanvaardt ook het oudere formaat met een data-URL als ingeleverd bestand', () => {
    expect(grade(q(), { name: 'foto.png', size: 900, dataUrl: 'data:image/png;base64,AAA' })).toBeNull();
  });

  it('scoort een half kapot antwoord (naam zonder bestand) automatisch op 0', () => {
    expect(grade(q(), { name: 'verslag.pdf', size: 12345 })).toEqual({ earned: 0, max: 4, mode: 'auto' });
    expect(grade(q(), { name: 'verslag.pdf', size: 12345, fileId: '' })).toEqual({ earned: 0, max: 4, mode: 'auto' });
    expect(grade(q(), { name: 'verslag.pdf', size: 12345, dataUrl: 'http://elders/f.pdf' }))
      .toEqual({ earned: 0, max: 4, mode: 'auto' });
  });

  it('scoort zonder crash bij een antwoord van de verkeerde vorm', () => {
    expect(grade(q(), 'verslag.pdf')).toEqual({ earned: 0, max: 4, mode: 'auto' });
    expect(grade(q(), ['verslag.pdf'])).toEqual({ earned: 0, max: 4, mode: 'auto' });
  });

  it('houdt het maximum op 0 als de vraag op 0 punten staat', () => {
    expect(grade(q({ points: 0 }), undefined)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// marktext — woorden markeren
// ═══════════════════════════════════════════════════════════════════════════

describe('marktext — woorden markeren', () => {
  const grade = graderVoor('marktext');
  // tokens: 0 "De" · 1 "zon" (doel) · 2 "verwarmt" · 3 "het" · 4 "water." (doel)
  const q = (o: Partial<MarkTextQuestion> = {}): MarkTextQuestion => ({
    id: 'q-mt', type: 'marktext', prompt: 'Markeer de juiste woorden.', points: 2,
    text: 'De [zon] verwarmt het [water].', penalizeWrong: false, ...o,
  });

  it('geeft de volle punten als alle doelwoorden gemarkeerd zijn', () => {
    expect(grade(q(), [1, 4])).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('geeft 0 als er niets gemarkeerd is', () => {
    expect(grade(q(), [])).toEqual({ earned: 0, max: 2, mode: 'auto' });
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('telt per juist gemarkeerd woord: 1 van 2 is de helft van de punten', () => {
    expect(grade(q(), [1])?.earned).toBe(1);
  });

  it('negeert foute markeringen zolang puntenaftrek uit staat', () => {
    expect(grade(q(), [0, 1, 2, 3, 4])?.earned).toBe(2);
  });

  it('trekt met puntenaftrek elke foute markering af van de juiste', () => {
    // 2 juist, 1 fout, 2 doelwoorden → (2 − 1) / 2 × 2 punten = 1
    expect(grade(q({ penalizeWrong: true }), [1, 4, 0])?.earned).toBe(1);
  });

  it('laat de fractie met puntenaftrek nooit onder 0 zakken', () => {
    expect(grade(q({ penalizeWrong: true }), [0, 2, 3])).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('rondt de fractie af op 2 decimalen (1 van 3 doelwoorden op 1 punt = 0,33)', () => {
    const drie = q({ points: 1, text: '[a] [b] [c] d' });
    expect(grade(drie, [0])?.earned).toBe(0.33);
  });

  it('telt hetzelfde woord dubbel aanklikken maar één keer', () => {
    expect(grade(q({ penalizeWrong: true }), [1, 1, 1])?.earned).toBe(1);
  });

  it('negeert markeringen buiten de tekst en waarden van het verkeerde soort', () => {
    expect(grade(q({ penalizeWrong: true }), [1, 99, -1, 'x', 2.5])?.earned).toBe(1);
  });

  it('markeert elk woord binnen één haakpaar als doelwoord', () => {
    // "[de zon]" → tokens 0 "de" (doel) en 1 "zon" (doel)
    const meerwoordig = q({ points: 2, text: '[de zon] schijnt' });
    expect(grade(meerwoordig, [0, 1])?.earned).toBe(2);
    expect(grade(meerwoordig, [0])?.earned).toBe(1);
  });

  it('houdt het maximum op 0 als er geen enkel doelwoord in de tekst staat', () => {
    expect(grade(q({ text: 'Een zin zonder haken.' }), [0, 1])).toEqual({ earned: 0, max: 0, mode: 'auto' });
    expect(grade(q({ text: '' }), [])).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// sort — sorteren in categorieën
// ═══════════════════════════════════════════════════════════════════════════

describe('sort — sorteren in categorieën', () => {
  const grade = graderVoor('sort');
  const q = (o: Partial<SortQuestion> = {}): SortQuestion => ({
    id: 'q-so', type: 'sort', prompt: 'Sorteer.', points: 4,
    categories: [{ id: 'c-zoog', name: 'Zoogdieren' }, { id: 'c-vogel', name: 'Vogels' }],
    items: [
      { id: 'i1', text: 'koe', categoryId: 'c-zoog' },
      { id: 'i2', text: 'mus', categoryId: 'c-vogel' },
      { id: 'i3', text: 'vleermuis', categoryId: 'c-zoog' },
      { id: 'i4', text: 'uil', categoryId: 'c-vogel' },
    ], ...o,
  });

  it('geeft de volle punten als elk item in de juiste categorie ligt', () => {
    const antwoord = { i1: 'c-zoog', i2: 'c-vogel', i3: 'c-zoog', i4: 'c-vogel' };
    expect(grade(q(), antwoord)).toEqual({ earned: 4, max: 4, mode: 'auto' });
  });

  it('geeft 0 als elk item in de verkeerde categorie ligt', () => {
    const antwoord = { i1: 'c-vogel', i2: 'c-zoog', i3: 'c-vogel', i4: 'c-zoog' };
    expect(grade(q(), antwoord)?.earned).toBe(0);
  });

  it('telt per juist geplaatst item: 2 van 4 levert de helft op', () => {
    const antwoord = { i1: 'c-zoog', i2: 'c-vogel', i3: 'c-vogel', i4: 'c-zoog' };
    expect(grade(q(), antwoord)?.earned).toBe(2);
  });

  it('telt een onbeplaatst item als fout', () => {
    expect(grade(q(), { i1: 'c-zoog', i2: 'c-vogel', i3: 'c-zoog' })?.earned).toBe(3);
  });

  it('geeft 0 zonder crash als er niets gesorteerd is', () => {
    expect(grade(q(), {})).toEqual({ earned: 0, max: 4, mode: 'auto' });
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 4, mode: 'auto' });
  });

  it('geeft 0 zonder crash bij een antwoord van de verkeerde vorm', () => {
    expect(grade(q(), ['c-zoog', 'c-vogel'])?.earned).toBe(0);
    expect(grade(q(), null)?.earned).toBe(0);
  });

  it('telt een item dat in een verwijderde categorie gelegd is als fout', () => {
    const antwoord = { i1: 'c-weg', i2: 'c-vogel', i3: 'c-zoog', i4: 'c-vogel' };
    expect(grade(q(), antwoord)?.earned).toBe(3);
  });

  it('rekent een item dat naar een verwijderde categorie verwijst nergens juist', () => {
    // Kapotte configuratie (bv. via import): categoryId bestaat niet meer.
    const kapot = q({ points: 2, items: [
      { id: 'i1', text: 'koe', categoryId: 'c-zoog' },
      { id: 'i2', text: 'mus', categoryId: 'c-weg' },
    ] });
    expect(grade(kapot, { i1: 'c-zoog', i2: 'c-zoog' })?.earned).toBe(1);
    expect(grade(kapot, { i1: 'c-zoog', i2: 'c-vogel' })?.earned).toBe(1);
  });

  it('rondt de fractie af op 2 decimalen (1 van 3 items op 1 punt = 0,33)', () => {
    const drie = q({ points: 1, items: [
      { id: 'i1', text: 'a', categoryId: 'c-zoog' },
      { id: 'i2', text: 'b', categoryId: 'c-zoog' },
      { id: 'i3', text: 'c', categoryId: 'c-vogel' },
    ] });
    expect(grade(drie, { i1: 'c-zoog' })?.earned).toBe(0.33);
  });

  it('houdt het maximum op 0 als er geen items te sorteren zijn', () => {
    expect(grade(q({ items: [] }), {})).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// imagepoint — aanduiden op een afbeelding
// ═══════════════════════════════════════════════════════════════════════════

describe('imagepoint — aanduiden op een afbeelding', () => {
  const grade = graderVoor('imagepoint');
  const q = (o: Partial<ImagePointQuestion> = {}): ImagePointQuestion => ({
    id: 'q-ip', type: 'imagepoint', prompt: 'Klik de juiste plekken aan.', points: 2,
    image: 'data:image/png;base64,AAA',
    targets: [
      { id: 't1', x: 20, y: 20, r: 10, label: 'Links' },
      { id: 't2', x: 80, y: 80, r: 10, label: 'Rechts' },
    ],
    maxClicks: 2, ...o,
  });

  it('geeft de volle punten als elke zone aangeklikt is', () => {
    expect(grade(q(), [{ x: 20, y: 20 }, { x: 80, y: 80 }])).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('geeft 0 als er alleen naast de zones geklikt is', () => {
    expect(grade(q(), [{ x: 50, y: 50 }, { x: 0, y: 99 }])).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('telt per geraakte zone: 1 van 2 levert de helft op', () => {
    expect(grade(q(), [{ x: 20, y: 20 }])?.earned).toBe(1);
  });

  it('rekent een klik op de rand van de zone (afstand = straal) nog juist', () => {
    expect(grade(q({ points: 1, targets: [{ id: 't1', x: 50, y: 50, r: 10 }] }), [{ x: 60, y: 50 }])?.earned).toBe(1);
    expect(grade(q({ points: 1, targets: [{ id: 't1', x: 50, y: 50, r: 10 }] }), [{ x: 60.5, y: 50 }])?.earned).toBe(0);
  });

  it('laat één klik in twee overlappende zones maar één zone claimen', () => {
    const overlappend = q({ targets: [
      { id: 't1', x: 50, y: 50, r: 10 },
      { id: 't2', x: 55, y: 50, r: 10 },
    ] });
    expect(grade(overlappend, [{ x: 52, y: 50 }])).toEqual({ earned: 1, max: 2, mode: 'auto' });
  });

  it('claimt per zone maar één klik: twee keer dezelfde zone blijft de helft', () => {
    expect(grade(q(), [{ x: 20, y: 20 }, { x: 21, y: 21 }])?.earned).toBe(1);
  });

  it('koppelt gulzig in klikvolgorde: de tweede klik neemt de resterende zone', () => {
    // beide klikken liggen het dichtst bij t1, maar t1 is na de eerste klik bezet
    const dichtbij = q({ targets: [
      { id: 't1', x: 10, y: 10, r: 20 },
      { id: 't2', x: 30, y: 10, r: 20 },
    ] });
    expect(grade(dichtbij, [{ x: 20, y: 10 }, { x: 12, y: 10 }])?.earned).toBe(2);
  });

  it('geeft 0 zonder crash als er niet geklikt is', () => {
    expect(grade(q(), [])).toEqual({ earned: 0, max: 2, mode: 'auto' });
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('negeert markeringen zonder geldige coördinaten', () => {
    expect(grade(q(), [null, { x: '20', y: 20 }, { x: 20 }, { x: 20, y: 20 }])?.earned).toBe(1);
  });

  it('houdt het maximum op 0 als er geen zones ingesteld zijn', () => {
    expect(grade(q({ targets: [] }), [{ x: 20, y: 20 }])).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('rondt de fractie af op 2 decimalen (1 van 3 zones op 1 punt = 0,33)', () => {
    const drie = q({ points: 1, targets: [
      { id: 't1', x: 10, y: 10, r: 5 },
      { id: 't2', x: 50, y: 50, r: 5 },
      { id: 't3', x: 90, y: 90, r: 5 },
    ] });
    expect(grade(drie, [{ x: 10, y: 10 }])?.earned).toBe(0.33);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// table — invultabel
// ═══════════════════════════════════════════════════════════════════════════

describe('table — invultabel', () => {
  const grade = graderVoor('table');
  const q = (o: Partial<TableQuestion> = {}): TableQuestion => ({
    id: 'q-tb', type: 'table', prompt: 'Vul de tabel aan.', points: 2,
    columns: ['Land', 'Hoofdstad'],
    rows: [
      { id: 'r1', cells: ['België', ''], answers: [null, 'Brussel|Bruxelles'] },
      { id: 'r2', cells: ['Frankrijk', ''], answers: [null, 'Parijs'] },
    ],
    caseSensitive: false, ...o,
  });

  it('geeft de volle punten als elke invulcel juist is', () => {
    const antwoord = { r1: { 1: 'Brussel' }, r2: { 1: 'Parijs' } };
    expect(grade(q(), antwoord)).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('aanvaardt elk |-alternatief in dezelfde cel', () => {
    expect(grade(q(), { r1: { 1: 'Bruxelles' }, r2: { 1: 'Parijs' } })?.earned).toBe(2);
    expect(grade(q(), { r1: { 1: 'Brussel' }, r2: { 1: 'Parijs' } })?.earned).toBe(2);
  });

  it('geeft 0 als elke invulcel fout is', () => {
    expect(grade(q(), { r1: { 1: 'Gent' }, r2: { 1: 'Lyon' } })?.earned).toBe(0);
  });

  it('telt per juiste cel: 1 van 2 levert de helft op', () => {
    expect(grade(q(), { r1: { 1: 'Brussel' }, r2: { 1: 'Lyon' } })?.earned).toBe(1);
  });

  it('negeert standaard hoofdletters, spaties en accenten', () => {
    expect(grade(q(), { r1: { 1: '  bruxelles ' }, r2: { 1: 'PARIJS' } })?.earned).toBe(2);
  });

  it('respecteert hoofdlettergevoeligheid wanneer die aan staat', () => {
    const streng = q({ caseSensitive: true });
    expect(grade(streng, { r1: { 1: 'brussel' }, r2: { 1: 'Parijs' } })?.earned).toBe(1);
    expect(grade(streng, { r1: { 1: 'Brussel' }, r2: { 1: 'Parijs' } })?.earned).toBe(2);
  });

  it('behandelt een vaste cel (answers[i] === null) niet als invulcel', () => {
    // 2 kolommen, maar maar één invulcel: die juist invullen = volle punten
    expect(grade(q({ points: 2, rows: [{ id: 'r1', cells: ['België', ''], answers: [null, 'Brussel'] }] }),
      { r1: { 1: 'Brussel' } })).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('behandelt ook een lege vaste cel niet als invulcel', () => {
    // rij met een lege vaste cel (cells[0] === '' én answers[0] === null)
    const metLegeVasteCel = q({ points: 1, rows: [{ id: 'r1', cells: ['', ''], answers: [null, 'Brussel'] }] });
    expect(grade(metLegeVasteCel, { r1: { 1: 'Brussel' } })).toEqual({ earned: 1, max: 1, mode: 'auto' });
    expect(grade(metLegeVasteCel, { r1: { 0: 'wat dan ook', 1: 'Brussel' } })?.earned).toBe(1);
  });

  it('geeft 0 zonder crash als de tabel niet ingevuld is', () => {
    expect(grade(q(), {})).toEqual({ earned: 0, max: 2, mode: 'auto' });
    expect(grade(q(), undefined)).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('geeft 0 zonder crash bij een antwoord van de verkeerde vorm', () => {
    expect(grade(q(), [['Brussel'], ['Parijs']])?.earned).toBe(0);
    expect(grade(q(), { r1: 'Brussel' })?.earned).toBe(0);
    expect(grade(q(), { r1: { 1: 42 } })?.earned).toBe(0);
  });

  it('rondt de fractie af op 2 decimalen (1 van 3 cellen op 1 punt = 0,33)', () => {
    const drie = q({ points: 1, columns: ['a', 'b', 'c'], rows: [
      { id: 'r1', cells: ['', '', ''], answers: ['x', 'y', 'z'] },
    ] });
    expect(grade(drie, { r1: { 0: 'x' } })?.earned).toBe(0.33);
  });

  it('houdt het maximum op 0 als de tabel geen enkele invulcel heeft', () => {
    const zonder = q({ rows: [{ id: 'r1', cells: ['België', 'Brussel'], answers: [null, null] }] });
    expect(grade(zonder, {})).toEqual({ earned: 0, max: 0, mode: 'auto' });
    expect(grade(q({ rows: [] }), {})).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  // ── Regressietest: invulcel zonder ingevuld juist antwoord ────────────────
  // De 🔒→✏️-knop in de editor maakt van een lege vaste cel een invulcel met
  // een leeg juist antwoord. Die kan een leerling nooit juist hebben, dus ze
  // mag de noemer niet opblazen — anders haalde een perfect ingevulde tabel
  // maar 1 op 2.
  it('telt een invulcel zonder juist antwoord niet mee in de noemer', () => {
    const metLegeInvulcel = q({ points: 2, rows: [
      { id: 'r1', cells: ['', ''], answers: ['Brussel', ''] },
    ] });
    expect(grade(metLegeInvulcel, { r1: { 0: 'Brussel', 1: '' } })).toEqual({ earned: 2, max: 2, mode: 'auto' });
    expect(grade(metLegeInvulcel, { r1: { 0: 'Brussel', 1: 'wat dan ook' } })?.earned).toBe(2);
  });

  it('geeft max 0 als élke invulcel een leeg juist antwoord heeft', () => {
    const leeg = q({ points: 2, rows: [{ id: 'r1', cells: ['', ''], answers: ['', ''] }] });
    expect(grade(leeg, { r1: { 0: 'x', 1: 'y' } })).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Overkoepelend
// ═══════════════════════════════════════════════════════════════════════════

describe('alle uitgebreide vraagtypes samen', () => {
  it('registreert precies de acht uitgebreide vraagtypes', () => {
    expect(Object.keys(EXTRA_QTYPES).sort()).toEqual([...UITGEBREIDE_TYPES].sort());
  });

  it('geeft voor een net aangemaakte, lege vraag nooit verdiende punten', () => {
    for (const type of UITGEBREIDE_TYPES) {
      const def = EXTRA_QTYPES[type];
      if (!def) throw new Error(`Vraagtype "${type}" ontbreekt.`);
      const leeg = def.make({ id: `q-${type}`, prompt: '', points: 5 });
      expect(def.grade(leeg, undefined)?.earned ?? 0, type).toBe(0);
    }
  });

  it('houdt het maximum van een lege vraag op 0 — behalve bij upload, waar het bestand ontbreekt', () => {
    for (const type of UITGEBREIDE_TYPES) {
      const def = EXTRA_QTYPES[type];
      if (!def) throw new Error(`Vraagtype "${type}" ontbreekt.`);
      const leeg = def.make({ id: `q-${type}`, prompt: '', points: 5 });
      expect(def.grade(leeg, undefined)?.max ?? 0, type).toBe(type === 'upload' ? 5 : 0);
    }
  });

  it('crasht op geen enkel vraagtype bij een antwoord van het verkeerde soort', () => {
    const rommel: unknown[] = [undefined, null, 0, '', 'tekst', [], {}, [{ x: 1 }], { a: 1 }, true];
    for (const type of UITGEBREIDE_TYPES) {
      const def = EXTRA_QTYPES[type];
      if (!def) throw new Error(`Vraagtype "${type}" ontbreekt.`);
      const leeg = def.make({ id: `q-${type}`, prompt: '', points: 3 });
      for (const antwoord of rommel) {
        const score = def.grade(leeg, antwoord);
        expect(score === null || score.earned === 0, `${type} met ${JSON.stringify(antwoord)}`).toBe(true);
      }
    }
  });
});
