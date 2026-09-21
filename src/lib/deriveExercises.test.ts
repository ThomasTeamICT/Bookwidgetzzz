import { describe, expect, it } from 'vitest';
import { deriveExercises, describeDerived, gapSentences, maskTerm, termsQuiz } from './deriveExercises';
import { markdownToCourse } from './importers';

const md = [
  '# Hoofdstuk 5: Het spijsverteringsstelsel', '',
  '## 3.1 Welke weg legt het voedsel af?', '',
  'Het voedsel doorloopt achtereenvolgens alle organen van het **spijsverteringskanaal**. De route van mond tot kont is als volgt:', '',
  '- **Mondholte** en keelholte', '- **Slokdarm** (de voedselbuis naar de maag)', '',
  'In de maag wordt het voedsel gekneed en gemengd met **maagsap**, dat de eiwitvertering start. De dunne darm neemt de **voedingsstoffen** op in het bloed.', '',
  '**Oefening:** Vul de twee ontbrekende delen van de route in.', '',
  '## 3.2 Wat gebeurt er in de mond?', '',
  '**Opdracht:** Kauw een stukje brood een minuut lang en beschrijf wat je proeft.', '',
  '## Kernbegrippen', '',
  '**Spijsvertering** Het afbreken van voedsel tot kleine stoffen die het lichaam kan opnemen.', '',
  '**Enzym** Een stof die de afbraak van voedingsstoffen versnelt.', '',
  '**Peristaltiek** Golvende samentrekkingen van de darmwand die het voedsel voortstuwen.', '',
  '**Villi** Darmvlokken die het oppervlak van de dunne darm vergroten.', '',
  '**Gal** Vloeistof uit de lever die vetten in kleine druppels verdeelt.', '',
].join('\n');

describe('gapSentences', () => {
  it('maakt een gat van een zin met precies één vet begrip, en slaat lijsten en definities over', () => {
    const gaps = gapSentences(md);
    expect(gaps[0]).toBe('Het voedsel doorloopt achtereenvolgens alle organen van het [spijsverteringskanaal].');
    expect(gaps).toContain('In de maag wordt het voedsel gekneed en gemengd met [maagsap], dat de eiwitvertering start.');
    expect(gaps.some((g) => /Mondholte|Slokdarm/.test(g))).toBe(false);
    expect(gaps.some((g) => g.startsWith('['))).toBe(false);
    // nadruk-zinsneden en genummerde stappen worden geen gat
    expect(gapSentences('Een voedselketen begint **altijd met een plant** en dat is een belangrijke regel in de ecologie.')).toEqual([]);
    expect(gapSentences('1. **Zuurstofarm bloed** komt binnen in de rechterboezem van het hart via de holle aders.')).toEqual([]);
  });

  it('respecteert het maximum en herhaalt geen antwoord', () => {
    const many = Array.from({ length: 10 }, (_, i) => `Dit is een voldoende lange zin met het begrip **term${'abcdefghij'[i]}** erin verwerkt voor de test.`).join(' ');
    expect(gapSentences(many, 4)).toHaveLength(4);
    const dup = 'De eerste zin noemt het **water** als voorbeeld van een stof. De tweede zin noemt het **water** nog een keer als stof.';
    expect(gapSentences(dup)).toHaveLength(1);
  });
});

describe('termsQuiz', () => {
  const terms = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((t, i) => ({ term: t, uitleg: `omschrijving nummer ${i + 1}` }));
  it('maakt per term een meerkeuzevraag met drie afleiders en een juist antwoord', () => {
    const qs = termsQuiz(terms, 'zaad', 'NW 5.1');
    expect(qs).toHaveLength(5);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      const answer = q.options[q.correctIndex];
      expect(q.prompt).toContain(terms.find((t) => t.term === answer)?.uitleg);
      expect(q.goalCode).toBe('NW 5.1');
    }
  });
  it('is deterministisch voor hetzelfde zaad en leeg onder vier termen', () => {
    const a = termsQuiz(terms, 'zaad').map((q) => q.options.join());
    const b = termsQuiz(terms, 'zaad').map((q) => q.options.join());
    expect(a).toEqual(b);
    expect(termsQuiz(terms.slice(0, 3), 'zaad')).toEqual([]);
  });
});

describe('deriveExercises', () => {
  it('zet invuloefeningen per sectie, begrippenquiz + koppelspel + werkblad in een sectie Oefeningen', () => {
    const course = markdownToCourse(md, 'x');
    const { course: out, widgets, counts } = deriveExercises(course, { curriculumId: 'cur', now: 1 });
    expect(counts).toEqual({ gap: 1, quiz: 1, pairs: 1, worksheet: 1 });
    expect(widgets.map((w) => w.type).sort()).toEqual(['pairs', 'quiz', 'worksheet', 'worksheet']);
    expect(widgets.every((w) => w.curriculumId === 'cur' && w.code.length === 6)).toBe(true);
    const ch = out.chapters[0];
    const s31 = ch.sections[0];
    expect(s31.blocks[s31.blocks.length - 1].type).toBe('widget');
    const oef = ch.sections[ch.sections.length - 1];
    expect(oef.title).toBe('Oefeningen');
    const ids = new Set(widgets.map((w) => w.id));
    const refs = oef.blocks.filter((b) => b.type === 'widget').map((b) => (b.type === 'widget' ? b.widgetId : ''));
    expect(refs).toHaveLength(3);
    expect(refs.every((id) => ids.has(id))).toBe(true);
    // het werkblad bevat beide opdrachten als open vraag, met de sectietitel als infoblok
    const ws = widgets.find((w) => w.type === 'worksheet' && /Opdrachten/.test(w.title));
    const qs = (ws?.config as { questions: { type: string; prompt: string }[] }).questions;
    expect(qs.filter((q) => q.type === 'long')).toHaveLength(2);
    expect(qs[0]).toMatchObject({ type: 'info', prompt: '**3.1 Welke weg legt het voedsel af?**' });
    // de oorspronkelijke cursus is niet aangepast
    expect(course.chapters[0].sections.some((s) => s.title === 'Oefeningen')).toBe(false);
  });

  it('zonder begrippen of opdrachten komt er geen sectie Oefeningen', () => {
    const plain = markdownToCourse('# H\n\n## S\n\nGewone tekst zonder vet.\n', 'x');
    const r = deriveExercises(plain);
    expect(r.widgets).toEqual([]);
    expect(r.course.chapters[0].sections.map((s) => s.title)).toEqual(['S']);
    expect(describeDerived(r.counts)).toBe('geen oefeningen af te leiden');
    expect(describeDerived({ gap: 2, quiz: 1, pairs: 0, worksheet: 1 })).toBe('oefeningen afgeleid: 1 begrippenquiz, 2 invuloefeningen, 1 werkblad met opdrachten');
  });
});

describe('maskTerm', () => {
  it('haalt de term (ook verbogen) uit de omschrijving', () => {
    expect(maskTerm('De verhouding tussen massa en volume. Massadichtheid geeft aan hoeveel massa er in een volume zit.', 'Massadichtheid'))
      .toBe('De verhouding tussen massa en volume. … geeft aan hoeveel massa er in een volume zit.');
    expect(maskTerm('Golvende samentrekkingen (peristaltische golven) van de darmwand.', 'Peristaltiek'))
      .toBe('Golvende samentrekkingen (… golven) van de darmwand.');
    expect(maskTerm('De teelballen maken zaadcellen.', 'Teelballen (testikels)')).toBe('De … maken zaadcellen.');
  });
  it('laat een omschrijving zonder de term met rust', () => {
    expect(maskTerm('Een stof die de afbraak versnelt.', 'Enzym')).toBe('Een stof die de afbraak versnelt.');
  });
});
