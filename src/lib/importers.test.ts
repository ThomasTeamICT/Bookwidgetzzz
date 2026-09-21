import { describe, expect, it } from 'vitest';
import {
  ImportError, baseName, fromPastedText, markdownToCourse, mergeSourcesToCourse, runInToBlock,
} from './importers';
import type { HeadingBlock, TableBlock, TextBlock } from './courseTypes';

function blocksOf(course: ReturnType<typeof markdownToCourse>, chapter = 0, section = 0) {
  return course.chapters[chapter].sections[section].blocks;
}

describe('baseName', () => {
  it('haalt een leesbare titel uit een bestandsnaam', () => {
    expect(baseName('hoofdstuk-3_water.docx')).toBe('hoofdstuk 3 water');
    expect(baseName('losse tekst')).toBe('losse tekst');
  });
});

describe('markdownToCourse — structuur', () => {
  const md = [
    '# De waterkringloop',
    '',
    'Een korte inleiding.',
    '',
    '## Verdamping',
    '',
    'Water verdampt door de **zon**.',
    '',
    '### Voorbeeld uit de keuken',
    '',
    '- kokend water',
    '- natte was',
    '',
    '## Condensatie',
    '',
    'Waterdamp koelt af.',
    '',
    '# Neerslag',
    '',
    '## Regen',
    '',
    'De druppels vallen.',
  ].join('\n');

  const course = markdownToCourse(md, 'bestandsnaam');

  it('neemt de titel uit de eerste #', () => {
    expect(course.title).toBe('De waterkringloop');
  });

  it('maakt van # hoofdstukken en van ## secties', () => {
    expect(course.chapters.map((c) => c.title)).toEqual(['De waterkringloop', 'Neerslag']);
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Inleiding', 'Verdamping', 'Condensatie']);
    expect(course.chapters[1].sections.map((s) => s.title)).toEqual(['Regen']);
  });

  it('zet tekst vóór de eerste ## in een sectie "Inleiding"', () => {
    const blocks = blocksOf(course, 0, 0);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as TextBlock).markdown).toBe('Een korte inleiding.');
  });

  it('maakt van ### een tussenkop op niveau 3 en houdt lijsten als markdown', () => {
    const blocks = blocksOf(course, 0, 1);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'heading', 'text']);
    expect((blocks[1] as HeadingBlock).text).toBe('Voorbeeld uit de keuken');
    expect((blocks[1] as HeadingBlock).level).toBe(3);
    expect((blocks[2] as TextBlock).markdown).toBe('- kokend water\n- natte was');
  });

  it('geeft elk blok en elke sectie een eigen id en behoudt de cursusinstellingen', () => {
    const ids = course.chapters.flatMap((c) => [c.id, ...c.sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(course.settings.accentColor).toBeTruthy();
    expect(course.code).toMatch(/\w/);
  });
});

describe('markdownToCourse — zonder koppen', () => {
  it('maakt één hoofdstuk met één sectie en valt terug op de meegegeven titel', () => {
    const course = markdownToCourse('Gewoon wat tekst.\nOp twee regels.\n\nEn een tweede alinea.', 'Mijn notities');
    expect(course.title).toBe('Mijn notities');
    expect(course.chapters).toHaveLength(1);
    expect(course.chapters[0].sections).toHaveLength(1);
    expect(course.chapters[0].sections[0].title).toBe('Inleiding');
    const blocks = blocksOf(course);
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as TextBlock).markdown).toBe('Gewoon wat tekst.\nOp twee regels.');
    expect((blocks[1] as TextBlock).markdown).toBe('En een tweede alinea.');
  });
});

describe('markdownToCourse — lege secties', () => {
  it('laat secties en hoofdstukken zonder inhoud weg', () => {
    const course = markdownToCourse('# Een\n\n## Leeg\n\n## Vol\n\nTekst.\n\n# Helemaal leeg\n\n## Ook leeg\n');
    expect(course.chapters.map((c) => c.title)).toEqual(['Een']);
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Vol']);
  });

  it('houdt een bruikbare cursus over als er niets in de tekst staat', () => {
    const course = markdownToCourse('   \n\n', 'Leeg document');
    expect(course.title).toBe('Leeg document');
    expect(course.chapters).toHaveLength(1);
    expect(course.chapters[0].sections).toHaveLength(1);
  });
});

describe('markdownToCourse — tabellen', () => {
  it('maakt een tabelblok met kopregel', () => {
    const course = markdownToCourse('| Land | Hoofdstad |\n| --- | --- |\n| België | Brussel |\n| Frankrijk | Parijs |');
    const block = blocksOf(course)[0] as TableBlock;
    expect(block.type).toBe('table');
    expect(block.header).toBe(true);
    expect(block.rows).toEqual([
      ['Land', 'Hoofdstad'],
      ['België', 'Brussel'],
      ['Frankrijk', 'Parijs'],
    ]);
  });

  it('werkt zonder scheidingsregel en vult kortere rijen aan', () => {
    const course = markdownToCourse('| a | b |\n| c |');
    const block = blocksOf(course)[0] as TableBlock;
    expect(block.header).toBe(false);
    expect(block.rows).toEqual([['a', 'b'], ['c', '']]);
  });

  it('laat een ontsnapte pipe in de cel staan', () => {
    const course = markdownToCourse('| a\\|b | c |\n| --- | --- |\n| d | e |');
    const block = blocksOf(course)[0] as TableBlock;
    expect(block.rows[0]).toEqual(['a|b', 'c']);
  });

  it('scheidt een tabel netjes van de tekst eromheen', () => {
    const course = markdownToCourse('Voor.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nNa.');
    expect(blocksOf(course).map((b) => b.type)).toEqual(['text', 'table', 'text']);
  });

  it('maakt van --- een scheidingslijn, niet van een lijst', () => {
    const course = markdownToCourse('Tekst.\n\n---\n\n- item');
    expect(blocksOf(course).map((b) => b.type)).toEqual(['text', 'divider', 'text']);
  });
});

describe('fromPastedText', () => {
  it('weigert lege tekst', () => {
    expect(() => fromPastedText('   ')).toThrow(ImportError);
  });

  it('geeft gewone tekst terug als tekstbron', () => {
    const src = fromPastedText('Wat leerstof.', 'Plakbord');
    expect(src.kind).toBe('text');
    expect(src.origin).toBe('plakbord');
    expect(src.text).toBe('Wat leerstof.');
    expect(src.warnings).toEqual([]);
  });

  it('waarschuwt bij erg lange tekst', () => {
    const src = fromPastedText('a'.repeat(60001));
    expect(src.warnings).toHaveLength(1);
    expect(src.warnings[0]).toMatch(/lang/i);
  });

  it('behandelt json die niet van Boosterz is gewoon als tekst', () => {
    const src = fromPastedText('{"iets": 1}');
    expect(src.kind).toBe('text');
  });

  it('herkent een cursusbestand', () => {
    const json = JSON.stringify({
      app: 'boosterz',
      course: {
        title: 'Gedeelde cursus',
        chapters: [{ title: 'H1', sections: [{ title: 'S1', blocks: [{ type: 'text', markdown: 'hoi' }] }] }],
      },
    });
    const src = fromPastedText(json);
    expect(src.kind).toBe('course');
    expect(src.title).toBe('Gedeelde cursus');
    expect(src.course?.course.chapters).toHaveLength(1);
  });

  it('herkent een vakgroeppakket', () => {
    const json = JSON.stringify({
      app: 'boosterz',
      kind: 'pakket',
      meta: { naam: 'Vakgroep Frans' },
      widgets: [{ type: 'quiz', title: 'Toets', config: { questions: [] } }],
    });
    const src = fromPastedText(json);
    expect(src.kind).toBe('pack');
    expect(src.title).toBe('Vakgroep Frans');
    expect(src.pack?.widgets).toHaveLength(1);
  });

  it('herkent een widgetbestand', () => {
    const json = JSON.stringify({ app: 'boosterz', widget: { type: 'flashcards', title: 'Kaarten', config: { cards: [] } } });
    const src = fromPastedText(json);
    expect(src.kind).toBe('widget');
    expect(src.widget?.type).toBe('flashcards');
  });
});

describe('markdownToCourse — sectieniveau 3 en callouts', () => {
  const md = [
    '# Hoofdstuk 1: Kennismaken',
    '',
    'Inleidende tekst.',
    '',
    '## Kennismaking met natuurwetenschappen',
    '',
    '### 1.1 Hoe stel je een goede onderzoeksvraag?',
    '',
    '**Theoretische uitleg:** Elk onderzoek start met een vraag.',
    '',
    '**Voorbeeld:** Beschimmelen boterhammen sneller in de koelkast?',
    '',
    '**Oefening: Bedenk zelf een vraag** en controleer ze.',
    '',
    '### 1.2 Hoe bedenk je een hypothese?',
    '',
    'Een hypothese is een voorlopig antwoord.',
    '',
    '**Weetje:** Meerdere hypothesen zijn mogelijk.',
  ].join('\n');

  it('maakt genummerde tussentitels tot secties en de bredere titel tot tussenkop', () => {
    const course = markdownToCourse(md, 'x', { sectionLevel: 3 });
    expect(course.chapters).toHaveLength(1);
    const titles = course.chapters[0].sections.map((s) => s.title);
    expect(titles).toEqual(['Inleiding', '1.1 Hoe stel je een goede onderzoeksvraag?', '1.2 Hoe bedenk je een hypothese?']);
    const first = course.chapters[0].sections[1];
    expect(first.blocks[0]).toMatchObject({ type: 'heading', level: 2, text: 'Kennismaking met natuurwetenschappen' });
  });

  it('zet vette run-in-labels om in callouts en laat "uitleg" als tekst', () => {
    const course = markdownToCourse(md, 'x', { sectionLevel: 3 });
    const blocks = course.chapters[0].sections[1].blocks.slice(1);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'callout', 'callout']);
    expect(blocks[0]).toMatchObject({ type: 'text', markdown: 'Elk onderzoek start met een vraag.' });
    expect(blocks[1]).toMatchObject({ type: 'callout', kind: 'info', title: 'Voorbeeld', text: 'Beschimmelen boterhammen sneller in de koelkast?' });
    expect(blocks[2]).toMatchObject({ type: 'callout', kind: 'goal', title: 'Oefening' });
    expect(runInToBlock('**Oefening (invuloefening):** vul in')).toMatchObject({ type: 'callout', kind: 'goal', title: 'Oefening (invuloefening)', text: 'vul in' });
    // het vet dat door het label doormidden werd gesneden, is opgeruimd
    expect((blocks[2] as { text: string }).text).toBe('Bedenk zelf een vraag en controleer ze.');
    const weetje = course.chapters[0].sections[2].blocks[1];
    expect(weetje).toMatchObject({ type: 'callout', kind: 'tip', title: 'Weetje' });
  });

  it('standaard (niveau 2) blijft ongewijzigd: ## is een sectie, ### een tussenkop', () => {
    const course = markdownToCourse(md, 'x');
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Inleiding', 'Kennismaking met natuurwetenschappen']);
    expect(course.chapters[0].sections[1].blocks[0]).toMatchObject({ type: 'heading', level: 3 });
  });

  it('runInToBlock negeert onbekende labels', () => {
    expect(runInToBlock('**Hallo:** wereld')).toBeNull();
    expect(runInToBlock('Gewone tekst')).toBeNull();
  });
});

describe('mergeSourcesToCourse', () => {
  it('maakt van elk bestand een hoofdstuk en gebruikt een eigen #-titel als die er is', () => {
    const course = mergeSourcesToCourse(
      [
        { title: 'Hoofdstuk_1.pdf', text: '# Hoofdstuk 1: Kennismaken\n\n## Sectie A\n\nTekst a.' },
        { title: 'Ecologie', text: 'Zonder eigen titel.\n\n## Biotoop\n\nTekst b.' },
        { title: 'Leeg', text: '   ' },
      ],
      'Natuurwetenschappen 1e graad'
    );
    expect(course.title).toBe('Natuurwetenschappen 1e graad');
    expect(course.chapters.map((c) => c.title)).toEqual(['Hoofdstuk 1: Kennismaken', 'Ecologie']);
    expect(course.chapters[1].sections.map((s) => s.title)).toEqual(['Inleiding', 'Biotoop']);
  });
});

describe('markdownToCourse — niveau 3 zonder genummerde tussentitels', () => {
  it('houdt de ##-titels als secties wanneer er geen ### volgt', () => {
    const md = '# H9\n\n## Insecten\n\nTekst a.\n\n## Vissen\n\nTekst b.';
    const course = markdownToCourse(md, 'x', { sectionLevel: 3 });
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Insecten', 'Vissen']);
    expect(course.chapters[0].sections[0].blocks[0]).toMatchObject({ type: 'text', markdown: 'Tekst a.' });
  });
});

describe('markdownToCourse: los label neemt de volgende alinea op', () => {
  it('"**Voorbeeld:**" op een eigen regel wordt een callout met de alinea erna als tekst', () => {
    const md = ['# Hoofdstuk 1', '', '## 1.1 Onderzoeksvraag', '', '**Voorbeeld:**', '', 'Een *slechte* onderzoeksvraag zou kunnen zijn: "Beschimmelen boterhammen snel?"', '', 'Gewone alinea erna.', ''].join('\n');
    const course = markdownToCourse(md, 'x');
    const blocks = course.chapters[0].sections[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(['callout', 'text']);
    const c = blocks[0];
    if (c.type !== 'callout') throw new Error('geen callout');
    expect(c.title).toBe('Voorbeeld');
    expect(c.text).toContain('Een *slechte* onderzoeksvraag');
    const t = blocks[1];
    if (t.type !== 'text') throw new Error('geen tekst');
    expect(t.markdown).toBe('Gewone alinea erna.');
  });

  it('een kop tussen label en alinea breekt de koppeling', () => {
    const md = ['# H', '', '## S', '', '**Oefening:**', '', '### Kopje', '', 'Alinea.', ''].join('\n');
    const blocks = markdownToCourse(md, 'x').chapters[0].sections[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(['callout', 'heading', 'text']);
  });
});

describe('termsFromSection: begrippenlijst → termenblok', () => {
  it('"**Term** uitleg"-alinea\'s in een sectie Kernbegrippen worden één termenblok', () => {
    const md = ['# H', '', '## Kernbegrippen', '', '**Thema 1: Kennismaking**', '', '**Onderzoeksvraag** De vraag die je onderzoekt.', '', '**Hypothese** Een voorlopige voorspelling.', '', '**Werkwijze:** Een stappenplan.', ''].join('\n');
    const sec = markdownToCourse(md, 'x').chapters[0].sections[0];
    expect(sec.blocks.map((b) => b.type)).toEqual(['text', 'terms']);
    const t = sec.blocks[1];
    if (t.type !== 'terms') throw new Error('geen termen');
    expect(t.items.map((i) => [i.term, i.uitleg])).toEqual([
      ['Onderzoeksvraag', 'De vraag die je onderzoekt.'],
      ['Hypothese', 'Een voorlopige voorspelling.'],
      ['Werkwijze', 'Een stappenplan.'],
    ]);
  });

  it('term op eigen regel met de uitleg in de alinea erna', () => {
    const md = ['# H', '', '## Begrippenlijst', '', '**Ecologie**', '', 'De wetenschap die samenleven bestudeert.', '', '**Biotoop**', '', 'Een afgebakend leefgebied.', '', '**Voedselrelatie**', '', 'Wie eet wie.', ''].join('\n');
    const sec = markdownToCourse(md, 'x').chapters[0].sections[0];
    expect(sec.blocks).toHaveLength(1);
    const t = sec.blocks[0];
    if (t.type !== 'terms') throw new Error('geen termen');
    expect(t.items).toHaveLength(3);
    expect(t.items[1]).toMatchObject({ term: 'Biotoop', uitleg: 'Een afgebakend leefgebied.' });
  });

  it('minder dan drie paren: niets veranderd', () => {
    const few = ['# H', '', '## Kernbegrippen', '', '**A** b.', '', '**C** d.', ''].join('\n');
    expect(markdownToCourse(few, 'x').chapters[0].sections[0].blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('termsFromSection: begrippenreeks zonder eigen titel', () => {
  it('drie of meer opeenvolgende "**Term** uitleg"-alinea\'s in een gewone sectie worden een termenblok op die plek', () => {
    const md = ['# H', '', '## Mindmap', '', 'Mindmap', '', '**Kracht** Een duw of een trek.', '', '**Contactkracht** Werkt bij aanraking.', '', '**Veerkracht** Kracht van een veer.', '', 'Slotzin.', ''].join('\n');
    const sec = markdownToCourse(md, 'x').chapters[0].sections[0];
    expect(sec.blocks.map((b) => b.type)).toEqual(['text', 'terms', 'text']);
    const t = sec.blocks[1];
    if (t.type !== 'terms') throw new Error('geen termen');
    expect(t.items.map((i) => i.term)).toEqual(['Kracht', 'Contactkracht', 'Veerkracht']);
  });

  it('twee losse definities blijven tekst', () => {
    const md = ['# H', '', '## Uitleg', '', '**Kracht** Een duw of een trek.', '', '**Massa** Hoeveelheid stof.', '', 'Tekst.', ''].join('\n');
    expect(markdownToCourse(md, 'x').chapters[0].sections[0].blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('termsFromSection: tussenkoppen zijn geen definities', () => {
  it('vette kopjes boven lange alinea\'s blijven tekst', () => {
    const long = 'Dit is een lange alinea. '.repeat(20).trim();
    const md = ['# H', '', '## 1. Voortplanting', '', `**Mannelijk voortplantingsstelsel** ${long}`, '', `**Kort samengevat** ${long}`, '', `**Vrouwelijk voortplantingsstelsel** ${long}`, ''].join('\n');
    expect(markdownToCourse(md, 'x').chapters[0].sections[0].blocks.every((b) => b.type === 'text')).toBe(true);
  });
});
