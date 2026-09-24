import { beforeEach, describe, expect, it } from 'vitest';
import type { Course, CourseBlock } from './courseTypes';
import type { Folder, Widget, WidgetTypeId } from './types';
import { createWidget, WIDGET_TYPES } from '../widgets/registry';
import {
  buildLibraryIndex, buildLibraryView, CATEGORY_CHIPS, chapterLabel, countByType, courseUsage, deleteWarning,
  EXAMPLE_COURSE_ID, EXAMPLE_FOLDER_ID, exampleInstallMessage, isExampleWidget, isLoose, joinNl, libraryCounts,
  matchesQuery, MIN_GROUP_SIZE, parseScope, planExampleFolder, scopeSearch, SEED_WIDGET_TITLES, typeCountLabel,
  typeSummary,
} from './library';

// ── Hulpjes ─────────────────────────────────────────────────────────────────

let clock = 1_000;
function widget(type: WidgetTypeId, title: string, extra: Partial<Widget> = {}): Widget {
  const w = createWidget(type, title);
  clock += 10;
  return { ...w, id: extra.id ?? `${type}-${title}`, updatedAt: clock, ...extra };
}

function wb(widgetId: string): CourseBlock {
  return { id: `b-${widgetId}-${Math.random()}`, type: 'widget', widgetId };
}

function course(id: string, title: string, chapters: { title: string; widgetIds: string[] }[]): Course {
  return {
    id, title, author: '', coverEmoji: '', code: id.toUpperCase().slice(0, 6),
    settings: { accentColor: '#000000', requireName: true, showProgressToStudent: true },
    createdAt: 0, updatedAt: 0,
    chapters: chapters.map((ch, i) => ({
      id: `${id}-h${i}`, title: ch.title,
      sections: [{ id: `${id}-s${i}`, title: 'Sectie', blocks: [{ id: 'txt', type: 'text', markdown: 'x' }, ...ch.widgetIds.map(wb)] }],
    })),
  };
}

function folder(id: string, name: string): Folder {
  return { id, name, color: '#123456', createdAt: 0 };
}

const none = { query: '', category: null } as const;

// ── Cursusgebruik ───────────────────────────────────────────────────────────

describe('courseUsage: welke widgets in welke cursus zitten', () => {
  it('vindt elke widget per cursus en hoofdstuk, zonder dubbels', () => {
    const a = course('a', 'Natuur', [
      { title: 'Hoofdstuk 1: Materie', widgetIds: ['q1', 'q2'] },
      { title: 'Energie', widgetIds: ['q2', 'q3'] },
    ]);
    const b = course('b', 'Herhaling', [{ title: 'Alles', widgetIds: ['q2', 'q2'] }]);
    const usage = courseUsage([a, b]);
    expect(usage.get('q1')).toEqual([{ courseId: 'a', courseTitle: 'Natuur', chapters: ['Hoofdstuk 1: Materie'] }]);
    expect(usage.get('q2')).toEqual([
      { courseId: 'a', courseTitle: 'Natuur', chapters: ['Hoofdstuk 1: Materie', 'Hoofdstuk 2: Energie'] },
      { courseId: 'b', courseTitle: 'Herhaling', chapters: ['Hoofdstuk 1: Alles'] },
    ]);
    expect(usage.has('onbekend')).toBe(false);
  });

  it('negeert widgetblokken zonder widget-id', () => {
    const a = course('a', 'Leeg', [{ title: 'H', widgetIds: [''] }]);
    expect(courseUsage([a]).size).toBe(0);
  });

  it('hoofdstuklabel: een titel die al met "Hoofdstuk" begint blijft staan', () => {
    expect(chapterLabel('Hoofdstuk 10b: Voortplanting', 11)).toBe('Hoofdstuk 10b: Voortplanting');
    expect(chapterLabel('Energie', 2)).toBe('Hoofdstuk 3: Energie');
    expect(chapterLabel('  ', 0)).toBe('Hoofdstuk 1');
  });
});

describe('deleteWarning: waarschuwing bij verwijderen', () => {
  it('geen cursus → geen waarschuwing', () => {
    expect(deleteWarning(undefined)).toBeNull();
    expect(deleteWarning([])).toBeNull();
  });

  it('één cursus: noemt cursus en hoofdstuk', () => {
    const msg = deleteWarning([{ courseId: 'a', courseTitle: 'Natuurwetenschappen 1e graad', chapters: ['Hoofdstuk 3: Materie'] }]);
    expect(msg).toBe('Deze oefening zit in “Natuurwetenschappen 1e graad” (Hoofdstuk 3: Materie). Verwijder je ze, dan toont die cursus een lege plek.');
  });

  it('meerdere cursussen: noemt ze allemaal', () => {
    const msg = deleteWarning([
      { courseId: 'a', courseTitle: 'A', chapters: ['Hoofdstuk 1', 'Hoofdstuk 2'] },
      { courseId: 'b', courseTitle: 'B', chapters: [] },
    ]);
    expect(msg).toBe('Deze oefening zit in 2 cursussen: “A” (Hoofdstuk 1 en Hoofdstuk 2) en “B”. Verwijder je ze, dan tonen die cursussen een lege plek.');
  });
});

// ── Telling per soort ───────────────────────────────────────────────────────

describe('telling per soort voor de melding', () => {
  it('elke soort heeft een meervoud dat niet gewoon de naam is (behalve waar dat klopt)', () => {
    for (const t of WIDGET_TYPES) {
      const many = typeCountLabel(t.id, 2);
      expect(many.startsWith('2 '), t.id).toBe(true);
      expect(many.length, t.id).toBeGreaterThan(2);
      expect(typeCountLabel(t.id, 1).startsWith('1 '), t.id).toBe(true);
    }
    expect(typeCountLabel('quiz', 57)).toBe('57 quizzen');
    expect(typeCountLabel('quiz', 1)).toBe('1 quiz');
    expect(typeCountLabel('worksheet', 96)).toBe('96 werkbladen');
    expect(typeCountLabel('exitticket', 1)).toBe('1 exit-ticket');
    expect(typeCountLabel('flashcards', 14)).toBe('14 sets flitskaarten');
    expect(typeCountLabel('flashcards', 1)).toBe('1 set flitskaarten');
    expect(typeCountLabel('bestaat-niet', 3)).toBe('3 × bestaat-niet');
  });

  it('telt per soort, grootste eerst, gelijke stand in registryvolgorde', () => {
    const ws = [
      ...Array(3).fill({ type: 'pairs' }), ...Array(3).fill({ type: 'quiz' }), ...Array(5).fill({ type: 'worksheet' }),
    ] as { type: WidgetTypeId }[];
    expect(countByType(ws)).toEqual([
      { type: 'worksheet', count: 5 }, { type: 'quiz', count: 3 }, { type: 'pairs', count: 3 },
    ]);
  });

  it('noemt de drie grootste soorten plus "en meer"', () => {
    const ws = [
      ...Array(96).fill({ type: 'worksheet' }), ...Array(57).fill({ type: 'quiz' }),
      ...Array(14).fill({ type: 'exitticket' }), ...Array(14).fill({ type: 'flashcards' }),
    ] as { type: WidgetTypeId }[];
    expect(typeSummary(ws)).toBe('96 werkbladen, 57 quizzen, 14 exit-tickets en meer');
    expect(typeSummary(ws.slice(0, 153))).toBe('96 werkbladen en 57 quizzen');
    expect(typeSummary([])).toBe('');
  });

  it('de melding telt oefeningen, niet "flitskaartensets"', () => {
    const ws = [{ type: 'quiz' }, { type: 'quiz' }, { type: 'memory' }] as { type: WidgetTypeId }[];
    expect(exampleInstallMessage({ chapters: 14, widgets: ws, reinstalled: false }))
      .toBe('Voorbeeldcursus geladen: 14 hoofdstukken, 3 oefeningen (2 quizzen en 1 memory)');
    expect(exampleInstallMessage({ chapters: 1, widgets: [], reinstalled: true }))
      .toBe('Voorbeeldcursus opnieuw geladen: 1 hoofdstuk');
  });

  it('joinNl', () => {
    expect(joinNl([])).toBe('');
    expect(joinNl(['a'])).toBe('a');
    expect(joinNl(['a', 'b', 'c'])).toBe('a, b en c');
  });

  it('filterchips volgen CATEGORIES met korte namen', () => {
    expect(CATEGORY_CHIPS.map((c) => c.label)).toEqual(['Toetsen', 'Spelletjes', 'Beeld', 'Rekenen', 'Klashulpjes']);
  });
});

// ── Zoeken ──────────────────────────────────────────────────────────────────

describe('matchesQuery: zoeken op titel, soort of code', () => {
  const w = { title: 'Voorbeeld: quiz over België', type: 'quiz' as const, code: 'K7P2QD' };
  it('titel, zonder accenten en hoofdletters', () => {
    expect(matchesQuery(w, 'belgie')).toBe(true);
    expect(matchesQuery(w, 'BELGIË')).toBe(true);
    expect(matchesQuery(w, 'frankrijk')).toBe(false);
  });
  it('soortnaam en meerdere woorden', () => {
    expect(matchesQuery({ ...w, title: 'Materie' }, 'quiz materie')).toBe(true);
    expect(matchesQuery({ ...w, title: 'Materie' }, 'werkblad materie')).toBe(false);
  });
  it('code: volledig of vanaf 3 tekens', () => {
    expect(matchesQuery(w, 'k7p2qd')).toBe(true);
    expect(matchesQuery(w, 'K7P')).toBe(true);
    expect(matchesQuery(w, 'K7')).toBe(false);
  });
  it('lege zoekterm past altijd', () => {
    expect(matchesQuery(w, '   ')).toBe(true);
  });
});

// ── Groeperen ───────────────────────────────────────────────────────────────

describe('bibliotheek groeperen', () => {
  // Een grote cursus (5 oefeningen), een kleine (1), eigen widgets en mappen.
  const own = widget('memory', 'Memory hoofdsteden');
  const inFolder = widget('quiz', 'Toets Frans', { folderId: 'frans' });
  const big = ['w1', 'w2', 'w3', 'w4', 'w5'].map((id, i) =>
    widget(i < 3 ? 'worksheet' : 'quiz', `Oefening ${id}`, { id, folderId: EXAMPLE_FOLDER_ID }));
  // w5 zit ook in een eigen map: die moet los blijven verschijnen.
  big[4] = { ...big[4], folderId: 'frans' };
  const small = widget('exitticket', 'Exit water', { id: 'x1' });
  const seed = widget('quiz', SEED_WIDGET_TITLES[0], { id: 'seed1' });
  const widgets = [own, inFolder, ...big, small, seed];
  const courses = [
    course(EXAMPLE_COURSE_ID, 'Natuurwetenschappen 1e graad', [
      { title: 'Hoofdstuk 1: Materie', widgetIds: ['w1', 'w2', 'verdwenen'] },
      { title: 'Hoofdstuk 2: Energie', widgetIds: ['w2', 'w3', 'w4', 'w5'] },
    ]),
    course('klein', 'Waterkringloop', [{ title: 'Neerslag', widgetIds: ['x1'] }]),
    course('leeg', 'Zonder oefeningen', [{ title: 'H', widgetIds: [] }]),
  ];
  const folders = [folder('frans', 'Frans'), folder(EXAMPLE_FOLDER_ID, 'Voorbeeld: natuurwetenschappen'), folder('leeg', 'Lege map')];
  const index = buildLibraryIndex(widgets, courses, folders);

  it('index: groepen alleen met bestaande widgets, zonder dubbels, per hoofdstuk van eerste voorkomen', () => {
    expect(index.groups.map((g) => g.courseId)).toEqual([EXAMPLE_COURSE_ID, 'klein']);
    const g = index.groups[0];
    expect(g.widgetIds).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(g.chapters.map((c) => c.widgetIds)).toEqual([['w1', 'w2'], ['w3', 'w4', 'w5']]);
    expect(index.usage.has('verdwenen')).toBe(false);
    expect(index.bundled.has(EXAMPLE_COURSE_ID)).toBe(true);
    expect(index.bundled.has('klein')).toBe(false);
    expect(MIN_GROUP_SIZE).toBe(3);
  });

  it('samenvouwen: cursusoefeningen verdwijnen achter één regel, behalve in een eigen map', () => {
    expect(isLoose(index, big[0])).toBe(false); // voorbeeldmap telt niet als eigen map
    expect(isLoose(index, big[4])).toBe(true); // ook in map "Frans"
    expect(isLoose(index, small)).toBe(true); // kleine cursus vouwt niet samen
    expect(isLoose(index, own)).toBe(true);

    const view = buildLibraryView(index, { kind: 'all' }, none);
    expect(view.flat).toBe(false);
    expect(view.rows).toEqual([
      { kind: 'course', id: EXAMPLE_COURSE_ID, title: 'Natuurwetenschappen 1e graad', count: 5, types: ['worksheet', 'quiz'] },
    ]);
    const shown = view.sections[0].widgets.map((w) => w.id);
    expect(shown).toContain(own.id);
    expect(shown).toContain('w5');
    expect(shown).toContain('x1');
    expect(shown).not.toContain('w1');
    expect(view.matched).toBe(widgets.length);
  });

  it('elke widget blijft vindbaar: als kaart of achter een cursusregel', () => {
    const view = buildLibraryView(index, { kind: 'all' }, none);
    const cards = new Set(view.sections.flatMap((s) => s.widgets.map((w) => w.id)));
    const behindRow = new Set(view.rows.flatMap((r) => index.groups.find((g) => g.courseId === r.id)?.widgetIds ?? []));
    for (const w of widgets) expect(cards.has(w.id) || behindRow.has(w.id), w.id).toBe(true);
  });

  it('zoeken vindt ook samengevouwen oefeningen, plat', () => {
    const view = buildLibraryView(index, { kind: 'all' }, { query: 'oefening w1', category: null });
    expect(view.flat).toBe(true);
    expect(view.rows).toEqual([]);
    expect(view.sections[0].widgets.map((w) => w.id)).toEqual(['w1']);
  });

  it('soortfilter telt mee in regels en kaarten', () => {
    const view = buildLibraryView(index, { kind: 'all' }, { query: '', category: 'game' });
    expect(view.rows).toEqual([]);
    expect(view.sections[0].widgets.map((w) => w.id)).toEqual([own.id]);
    const tests = buildLibraryView(index, { kind: 'all' }, { query: '', category: 'test' });
    expect(tests.rows[0].count).toBe(5);
  });

  it('één cursus: kaarten per hoofdstuk in cursusvolgorde', () => {
    const view = buildLibraryView(index, { kind: 'course', id: EXAMPLE_COURSE_ID }, none);
    expect(view.sections.map((s) => s.title)).toEqual(['Hoofdstuk 1: Materie', 'Hoofdstuk 2: Energie']);
    expect(view.sections[1].widgets.map((w) => w.id)).toEqual(['w3', 'w4', 'w5']);
  });

  it('in cursussen: een regel per cursus, ook kleine', () => {
    const view = buildLibraryView(index, { kind: 'courses' }, none);
    expect(view.rows.map((r) => [r.id, r.count])).toEqual([[EXAMPLE_COURSE_ID, 5], ['klein', 1]]);
    expect(view.sections).toEqual([]);
  });

  it('mappen: ook lege mappen, plus "Zonder map"; een map toont alles plat', () => {
    const view = buildLibraryView(index, { kind: 'folders' }, none);
    expect(view.rows.map((r) => [r.kind, r.title, r.count])).toEqual([
      ['folder', 'Frans', 2], ['folder', 'Voorbeeld: natuurwetenschappen', 4], ['folder', 'Lege map', 0], ['nofolder', 'Zonder map', 3],
    ]);
    const frans = buildLibraryView(index, { kind: 'folder', id: 'frans' }, none);
    expect(frans.sections[0].widgets.map((w) => w.id).sort()).toEqual([inFolder.id, 'w5'].sort());
    const noFolder = buildLibraryView(index, { kind: 'nofolder' }, none);
    expect(noFolder.sections[0].widgets.map((w) => w.id).sort()).toEqual([own.id, small.id, seed.id].sort());
  });

  it('een widget met een map die niet (meer) bestaat, staat bij "Zonder map"', () => {
    const orphan = widget('quiz', 'Wees', { folderId: 'weg' });
    const idx = buildLibraryIndex([orphan], [], folders);
    expect(buildLibraryView(idx, { kind: 'nofolder' }, none).sections[0].widgets).toHaveLength(1);
    expect(libraryCounts(idx).noFolder).toBe(1);
  });

  it('voorbeelden: seed, voorbeeldcursus en voorbeeldmap', () => {
    expect([...index.exampleIds].sort()).toEqual(['seed1', 'w1', 'w2', 'w3', 'w4', 'w5'].sort());
    const view = buildLibraryView(index, { kind: 'examples' }, none);
    expect(view.rows.map((r) => r.id)).toEqual([EXAMPLE_COURSE_ID]);
    expect(view.sections[0].widgets.map((w) => w.id).sort()).toEqual(['seed1', 'w5'].sort());
  });

  it('tellers voor de zijkolom', () => {
    const c = libraryCounts(index);
    expect(c.all).toBe(widgets.length);
    expect(c.examples).toBe(6);
    expect(c.inCourses).toBe(6);
    expect(c.perCourse.get(EXAMPLE_COURSE_ID)).toBe(5);
    expect(c.perFolder.get('frans')).toBe(2);
    expect(c.perFolder.get('leeg')).toBe(0);
    expect(c.noFolder).toBe(3);
    expect(c.inFolders).toBe(6);
  });

  it('de nieuwste widget staat eerst', () => {
    expect(index.widgets[0].id).toBe(seed.id);
  });

  it('filter uit de URL, en terug', () => {
    const p = (s: string) => parseScope(new URLSearchParams(s), index);
    expect(p('')).toEqual({ kind: 'all' });
    expect(p('toon=voorbeelden')).toEqual({ kind: 'examples' });
    expect(p(`cursus=${EXAMPLE_COURSE_ID}`)).toEqual({ kind: 'course', id: EXAMPLE_COURSE_ID });
    expect(p('cursus=bestaat-niet')).toEqual({ kind: 'all' });
    expect(p('map=frans')).toEqual({ kind: 'folder', id: 'frans' });
    expect(p('map=weg')).toEqual({ kind: 'all' });
    for (const s of [{ kind: 'folders' }, { kind: 'nofolder' }, { kind: 'courses' }, { kind: 'folder', id: 'frans' }] as const) {
      expect(p(scopeSearch(s).slice(1))).toEqual(s);
    }
  });
});

// ── Voorbeeldmateriaal herkennen ────────────────────────────────────────────

describe('isExampleWidget', () => {
  it('seedtitel, voorbeeldcursus of voorbeeldmap; een kopie niet', () => {
    const ids = new Set(['vb1']);
    expect(isExampleWidget(widget('quiz', 'Voorbeeld: quiz over België'), ids)).toBe(true);
    expect(isExampleWidget(widget('quiz', 'Voorbeeld: quiz over België (kopie)'), ids)).toBe(false);
    expect(isExampleWidget(widget('quiz', 'Eigen', { id: 'vb1' }), ids)).toBe(true);
    expect(isExampleWidget(widget('quiz', 'Eigen', { folderId: EXAMPLE_FOLDER_ID }), ids)).toBe(true);
    expect(isExampleWidget(widget('quiz', 'Voorbeeld: mijn eigen quiz'), ids)).toBe(false);
  });
});

describe('planExampleFolder: voorbeeldmap zonder eigen keuzes te overschrijven', () => {
  const fresh = widget('quiz', 'Nieuw', { id: 'n1', folderId: 'map-van-de-auteur' });
  const mineNoFolder = widget('quiz', 'Lokaal zonder map', { id: 'l1', folderId: null });
  const mineOwnFolder = widget('quiz', 'Lokaal in eigen map', { id: 'l2', folderId: 'frans' });
  const mineOrphan = widget('quiz', 'Lokaal met verdwenen map', { id: 'l3', folderId: 'weg' });
  const mineExample = widget('quiz', 'Lokaal al in voorbeeldmap', { id: 'l4', folderId: EXAMPLE_FOLDER_ID });
  const bundle = [fresh, { ...mineNoFolder, title: 'bundel' }, { ...mineOwnFolder, folderId: null }, mineOrphan, mineExample];
  const local = [mineNoFolder, mineOwnFolder, mineOrphan, mineExample];
  const existing = new Set(['frans', EXAMPLE_FOLDER_ID]);
  const plan = planExampleFolder(bundle, local, existing);

  it('nieuwe widgets krijgen de voorbeeldmap mee, ook als het bestand een andere map noemde', () => {
    expect(plan.incoming.find((w) => w.id === 'n1')?.folderId).toBe(EXAMPLE_FOLDER_ID);
  });

  it('bestaande widgets blijven in de bundel ongewijzigd (adoptSharedCourse slaat ze over)', () => {
    expect(plan.incoming.find((w) => w.id === 'l2')?.folderId).toBeNull();
  });

  it('alleen lokale widgets zonder geldige map worden bijgewerkt, met hun lokale inhoud', () => {
    expect(plan.updates.map((w) => w.id).sort()).toEqual(['l1', 'l3']);
    expect(plan.updates.every((w) => w.folderId === EXAMPLE_FOLDER_ID)).toBe(true);
    expect(plan.updates.find((w) => w.id === 'l1')?.title).toBe('Lokaal zonder map');
  });

  it('een eigen map van de leerkracht blijft staan', () => {
    expect(plan.updates.some((w) => w.id === 'l2')).toBe(false);
  });
});

// ── Seed en voorbeeldherkenning lopen gelijk ────────────────────────────────

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

describe('seedwidgets worden als voorbeeld herkend', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
  });

  it('elke widget die seedIfEmpty plaatst, staat in SEED_WIDGET_TITLES', async () => {
    const { seedIfEmpty } = await import('./seed');
    const { getWidgets } = await import('./storage');
    seedIfEmpty();
    const seeded = getWidgets();
    expect(seeded.length).toBe(SEED_WIDGET_TITLES.length);
    for (const w of seeded) expect(isExampleWidget(w, new Set()), w.title).toBe(true);
  });
});
