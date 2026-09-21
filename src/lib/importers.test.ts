import { describe, expect, it } from 'vitest';
import { baseName, fromPastedText, ImportError, markdownToCourse } from './importers';
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
