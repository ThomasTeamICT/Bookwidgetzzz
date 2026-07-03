// ── AI-widgetgeneratie: promptopbouw + defensieve validatie ─────────────────
//
// De AI krijgt een compact JSON-schema per widgettype en moet een envelop
// teruggeven: { "widgets": [ { "type", "title", "config" } ] }.
// Alles wat terugkomt wordt hier defensief gesaneerd: verkeerde types
// worden overgeslagen, ontbrekende velden aangevuld, indices geklemd.
// De leerkracht ziet daarna ALTIJD eerst een voorbeeld en beslist zelf
// wat bewaard wordt — de AI maakt een voorzet, geen eindproduct.

import type {
  Question, QuestionType, Widget, WidgetTypeId, QuizConfig,
} from './types';
import { uid } from './utils';
import { createWidget, getTypeDef } from '../widgets/registry';

// ── Welke types kan de AI zinvol genereren? ─────────────────────────────────

export const AI_GEN_TYPES: WidgetTypeId[] = [
  'quiz', 'worksheet', 'exitticket', 'splitworksheet', 'flashcards',
  'crossword', 'wordsearch', 'memory', 'hangman', 'pairs', 'timeline',
  'scramble', 'dictation', 'poll', 'checklist', 'webquest', 'mindmap',
  'planner', 'bingo', 'spinner',
];

export function isGenType(t: string): t is WidgetTypeId {
  return (AI_GEN_TYPES as string[]).includes(t);
}

// ── Schema-uitleg per type (gaat mee in de prompt) ──────────────────────────

const QUESTION_DOC = `Een "vraag" is een JSON-object met "type" en "prompt" plus:
- "mc": {"options":["…"],"correctIndex":0} — 3 à 4 opties, plausibele afleiders
- "multi": {"options":["…"],"correctIndices":[0,2]}
- "tf": {"answer":true}
- "short": {"accepted":["antwoord","synoniem"]} — kort tekstantwoord
- "long": {"modelAnswer":"…","rubric":[{"criterion":"…","points":2}]} — open vraag
- "gap": {"text":"Zin met [antwoord] tussen vierkante haken, meerdere gaten mag."}
- "match": {"pairs":[{"left":"…","right":"…"}]} — 3 à 6 paren
- "order": {"items":["eerste","tweede","derde"]} — in de JUISTE volgorde
- "number": {"answer":12.5,"tolerance":0}
- "info": alleen "prompt" — leerstof-/instructieblok tussen de vragen
Elke vraag mag ook hebben: "points" (getal, standaard 1), "explanation" (uitleg bij feedback),
"hints" (oplopende hulpstapjes: eerst strategie, dan aanwijzing, max 3),
"goal" (kort leerdoel), "level" ("basis"|"kern"|"uitbreiding"), "support" (eenvoudiger geformuleerde versie van de vraag).`;

const SCHEMA_DOCS: Partial<Record<WidgetTypeId, string>> = {
  quiz: `"quiz" — config: {"questions":[vraag,…],"layout":"single","glossary":[{"term":"…","uitleg":"…"}]}
${QUESTION_DOC}`,
  worksheet: `"worksheet" (werkblad, alles onder elkaar) — config: {"questions":[vraag,…],"layout":"scroll","glossary":[…]} — wissel vragen af met "info"-blokken leerstof.`,
  exitticket: `"exitticket" (korte check aan het einde van de les, 2 à 4 vragen) — config: {"questions":[vraag,…],"layout":"single"}`,
  splitworksheet: `"splitworksheet" (bron + vragen naast elkaar) — config: {"source":{"kind":"text","title":"…","text":"de bron- of leestekst"},"questions":[vraag,…]}`,
  flashcards: `"flashcards" — config: {"cards":[{"front":"begrip of vraag","back":"uitleg of antwoord"}]}`,
  crossword: `"crossword" — config: {"entries":[{"word":"WOORD","clue":"omschrijving"}]} — woorden zonder spaties, 6 à 12 stuks`,
  wordsearch: `"wordsearch" — config: {"words":["WOORD",…],"size":12} — 8 à 14 woorden zonder spaties`,
  memory: `"memory" — config: {"pairs":[{"a":"begrip","b":"bijpassend"}]} — 6 à 10 paren`,
  hangman: `"hangman" (galgje) — config: {"words":[{"word":"woord","hint":"omschrijving"}]}`,
  pairs: `"pairs" (koppelen) — config: {"pairs":[{"left":"…","right":"…"}]} — 4 à 8 paren`,
  timeline: `"timeline" — config: {"events":[{"date":"1815","title":"…","description":"…"}],"mode":"exercise"} — chronologisch`,
  scramble: `"scramble" (husselwoorden/-zinnen) — config: {"mode":"word","items":[{"text":"woord of zin","hint":"…"}]}`,
  dictation: `"dictation" (dictee, wordt voorgelezen) — config: {"sentences":[{"text":"Voluit geschreven zin.","hint":"…"}]}`,
  poll: `"poll" (peiling, geen juist/fout) — config: {"question":"…","options":["…"],"allowMultiple":false}`,
  checklist: `"checklist" — config: {"title":"…","items":[{"text":"stap of criterium"}]}`,
  webquest: `"webquest" (stappenplan met bronnen) — config: {"steps":[{"title":"…","content":"opdrachttekst","links":[{"label":"…","url":"https://…"}]}]} — alleen échte, algemeen bekende URL's (bv. Wikipedia); verzin geen adressen`,
  mindmap: `"mindmap" — config: {"root":"centraal begrip","outline":"tak 1\\n  subtak\\ntak 2","studentEditable":true} — 2 spaties per niveau`,
  planner: `"planner" (taakplanner) — config: {"title":"…","sections":[{"title":"fase","tasks":[{"text":"taak"}]}]}`,
  bingo: `"bingo" — config: {"items":["begrip",…],"size":4} — minstens size² items`,
  spinner: `"spinner" (rad) — config: {"items":["naam of opdracht",…]}`,
};

/** Schema-uitleg van de quiz (voor hergebruik in bv. de cursusgeneratie). */
export function quizSchemaText(): string {
  return SCHEMA_DOCS.quiz!;
}

// ── Promptopbouw ────────────────────────────────────────────────────────────

export interface WidgetGenRequest {
  /** Bronmateriaal (geplakte tekst, hoofdstuk, artikel …). Mag leeg zijn. */
  source: string;
  /** Wens van de leerkracht, bv. "10 vragen over de waterkringloop, 2e graad". */
  wish: string;
  /** Gewenste widgettypes. */
  types: WidgetTypeId[];
  /** Richtaantal items/vragen per widget (0 = laat de AI kiezen). */
  itemCount?: number;
  /** Doelgroep/niveau, bv. "5e leerjaar" of "3 ASO". */
  audience?: string;
  /** Leerdoelen om vragen aan te koppelen (vrije tekst). */
  goals?: string;
  /** Ook differentiatie meenemen (hints, steuntaal, niveaus)? */
  differentiate?: boolean;
}

export function buildWidgetGenPrompt(req: WidgetGenRequest): { system: string; prompt: string } {
  const docs = req.types.filter(isGenType).map((t) => SCHEMA_DOCS[t]).filter(Boolean).join('\n\n');
  const system = `Je bent een ervaren Vlaamse leerkracht en toetsontwikkelaar die lesmateriaal maakt voor WidgetFabriek.
Kwaliteitsregels:
- Schrijf in helder Nederlands (Vlaanderen), afgestemd op de doelgroep.
- Meerkeuze: afleiders zijn plausibele misvattingen, nooit flauwekul; geen "alle bovenstaande"; de juiste optie is niet systematisch de langste.
- Geef bij elke vraag een korte "explanation" (waarom is dit juist — feedback is leermoment).
- Varieer vraagtypes waar zinvol; toets begrip, niet alleen herkenning.
- Baseer je UITSLUITEND op het bronmateriaal als dat gegeven is; verzin er geen feiten bij.
- Antwoord met ALLEEN geldige JSON (geen uitleg, geen markdown): {"widgets":[{"type":"…","title":"…","config":{…}}]}`;

  const parts: string[] = [];
  parts.push(`Maak de volgende widget(s): ${req.types.join(', ')}.`);
  if (req.wish.trim()) parts.push(`Wens van de leerkracht: ${req.wish.trim()}`);
  if (req.audience?.trim()) parts.push(`Doelgroep: ${req.audience.trim()}`);
  if (req.itemCount && req.itemCount > 0) parts.push(`Richtaantal vragen/items per widget: ${req.itemCount}.`);
  if (req.goals?.trim()) parts.push(`Koppel vragen waar mogelijk aan deze leerdoelen (vul het veld "goal" in):\n${req.goals.trim()}`);
  if (req.differentiate) {
    parts.push(`Differentiatie: geef bij elke vraag "hints" (max 3 oplopende hulpstapjes: strategie → aanwijzing → bijna-antwoord), een "support"-versie in eenvoudiger taal, en tag vragen met "level" (basis/kern/uitbreiding).`);
  }
  parts.push(`\nSchema's van de gevraagde widgettypes:\n${docs}`);
  if (req.source.trim()) {
    parts.push(`\n=== BRONMATERIAAL ===\n${req.source.trim()}\n=== EINDE BRONMATERIAAL ===`);
  }
  return { system, prompt: parts.join('\n\n') };
}

// ── Sanering van vragen ─────────────────────────────────────────────────────

const QUESTION_TYPES: QuestionType[] = ['mc', 'multi', 'tf', 'short', 'long', 'gap', 'match', 'order', 'number', 'slider', 'info'];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
}

/** Zet één AI-vraag om naar een geldige Question, of null als het niet lukt. */
export function sanitizeQuestion(raw: unknown): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const type = str(q.type) as QuestionType;
  if (!QUESTION_TYPES.includes(type)) return null;
  const prompt = str(q.prompt).trim();
  if (!prompt && type !== 'gap') return null;

  const base = {
    id: uid(),
    prompt,
    points: Math.max(0, Math.round(num(q.points, type === 'info' ? 0 : 1))),
    explanation: str(q.explanation) || undefined,
    hint: str(q.hint) || undefined,
    hints: strArr(q.hints).slice(0, 3),
    goal: str(q.goal).trim() || undefined,
    level: (['basis', 'kern', 'uitbreiding'] as const).find((l) => l === q.level),
    support: str(q.support) || undefined,
  };
  if (base.hints && base.hints.length === 0) base.hints = undefined as unknown as string[];

  switch (type) {
    case 'mc': {
      const options = strArr(q.options);
      if (options.length < 2) return null;
      const ci = Math.round(num(q.correctIndex, 0));
      return { ...base, type, options, correctIndex: Math.min(Math.max(ci, 0), options.length - 1) };
    }
    case 'multi': {
      const options = strArr(q.options);
      if (options.length < 2) return null;
      const idx = Array.isArray(q.correctIndices)
        ? q.correctIndices.map((i) => Math.round(num(i, -1))).filter((i) => i >= 0 && i < options.length)
        : [];
      if (idx.length === 0) return null;
      return { ...base, type, options, correctIndices: [...new Set(idx)].sort((a, b) => a - b) };
    }
    case 'tf':
      return { ...base, type, answer: q.answer === true || q.answer === 'true' || q.answer === 'juist' };
    case 'short': {
      const accepted = strArr(q.accepted ?? q.answers ?? q.answer);
      if (accepted.length === 0) return null;
      return { ...base, type, accepted, caseSensitive: false };
    }
    case 'long':
      return {
        ...base, type,
        modelAnswer: str(q.modelAnswer) || undefined,
        rubric: Array.isArray(q.rubric)
          ? q.rubric
              .map((r) => {
                const rr = r as Record<string, unknown>;
                const criterion = str(rr?.criterion).trim();
                return criterion ? { criterion, points: Math.max(1, Math.round(num(rr?.points, 1))) } : null;
              })
              .filter((x): x is { criterion: string; points: number } => x !== null)
          : undefined,
      };
    case 'gap': {
      const text = str(q.text ?? q.prompt);
      if (!/\[[^\]]+\]/.test(text)) return null;
      return { ...base, prompt: prompt || 'Vul in.', type, text };
    }
    case 'match': {
      const pairs = Array.isArray(q.pairs)
        ? q.pairs
            .map((p) => {
              const pp = p as Record<string, unknown>;
              const left = str(pp?.left).trim();
              const right = str(pp?.right).trim();
              return left && right ? { left, right } : null;
            })
            .filter((x): x is { left: string; right: string } => x !== null)
        : [];
      if (pairs.length < 2) return null;
      return { ...base, type, pairs };
    }
    case 'order': {
      const items = strArr(q.items);
      if (items.length < 2) return null;
      return { ...base, type, items };
    }
    case 'number':
      return { ...base, type, answer: num(q.answer, 0), tolerance: Math.abs(num(q.tolerance, 0)) };
    case 'slider': {
      const min = num(q.min, 0);
      const max = Math.max(min + 1, num(q.max, 10));
      return {
        ...base, type, min, max,
        step: Math.max(0.001, num(q.step, 1)),
        answer: Math.min(max, Math.max(min, num(q.answer, min))),
        tolerance: Math.abs(num(q.tolerance, 0)),
      };
    }
    case 'info':
      return { ...base, type, points: 0 };
    default:
      return null;
  }
}

export function sanitizeQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeQuestion).filter((q): q is Question => q !== null);
}

function sanitizeGlossary(raw: unknown): { term: string; uitleg: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((g) => {
      const gg = g as Record<string, unknown>;
      const term = str(gg?.term).trim();
      const uitleg = str(gg?.uitleg ?? gg?.explanation).trim();
      return term && uitleg ? { term, uitleg } : null;
    })
    .filter((x): x is { term: string; uitleg: string } => x !== null);
  return items.length ? items : undefined;
}

// ── Sanering per widgettype ─────────────────────────────────────────────────

/** Woorden voor puzzels: alleen letters, geen spaties, 2–15 tekens. */
function puzzleWord(w: string): string {
  return w.trim().replace(/\s+/g, '').slice(0, 15);
}

type ConfigSanitizer = (cfg: Record<string, unknown>) => Record<string, unknown> | null;

const CONFIG_SANITIZERS: Partial<Record<WidgetTypeId, ConfigSanitizer>> = {
  quiz: (c) => quizFamily(c, 'single'),
  worksheet: (c) => quizFamily(c, 'scroll'),
  exitticket: (c) => quizFamily(c, 'single'),
  splitworksheet: (c) => {
    const questions = sanitizeQuestions(c.questions);
    const s = (c.source && typeof c.source === 'object' ? c.source : {}) as Record<string, unknown>;
    const text = str(s.text ?? c.text);
    if (questions.length === 0 || !text.trim()) return null;
    return {
      source: { kind: 'text', title: str(s.title) || 'Bron', text },
      questions,
    };
  },
  flashcards: (c) => {
    const cards = (Array.isArray(c.cards) ? c.cards : [])
      .map((k) => {
        const kk = k as Record<string, unknown>;
        const front = str(kk?.front).trim();
        const back = str(kk?.back).trim();
        return front && back ? { id: uid(), front, back } : null;
      })
      .filter((x): x is { id: string; front: string; back: string } => x !== null);
    return cards.length ? { cards, autoFlipSec: 0 } : null;
  },
  crossword: (c) => {
    const entries = (Array.isArray(c.entries) ? c.entries : [])
      .map((e) => {
        const ee = e as Record<string, unknown>;
        const word = puzzleWord(str(ee?.word));
        const clue = str(ee?.clue).trim();
        return word.length >= 2 && clue ? { id: uid(), word, clue } : null;
      })
      .filter((x): x is { id: string; word: string; clue: string } => x !== null);
    return entries.length >= 2 ? { entries } : null;
  },
  wordsearch: (c) => {
    const words = strArr(c.words).map(puzzleWord).filter((w) => w.length >= 3);
    if (words.length < 3) return null;
    const longest = Math.max(...words.map((w) => w.length));
    return {
      words,
      size: Math.min(18, Math.max(8, Math.max(longest, Math.round(num(c.size, 12))))),
      allowDiagonal: c.allowDiagonal !== false,
      allowReverse: c.allowReverse === true,
    };
  },
  memory: (c) => {
    const pairs = (Array.isArray(c.pairs) ? c.pairs : [])
      .map((p) => {
        const pp = p as Record<string, unknown>;
        const a = str(pp?.a ?? pp?.left).trim();
        const b = str(pp?.b ?? pp?.right).trim();
        return a && b ? { id: uid(), a, b } : null;
      })
      .filter((x): x is { id: string; a: string; b: string } => x !== null);
    return pairs.length >= 2 ? { pairs: pairs.slice(0, 12) } : null;
  },
  hangman: (c) => {
    const words = (Array.isArray(c.words) ? c.words : [])
      .map((w) => {
        const ww = w as Record<string, unknown>;
        const word = str(typeof w === 'string' ? w : ww?.word).trim();
        return word ? { word, hint: str(ww?.hint).trim() } : null;
      })
      .filter((x): x is { word: string; hint: string } => x !== null);
    return words.length ? { words, maxErrors: 8 } : null;
  },
  pairs: (c) => {
    const pairs = (Array.isArray(c.pairs) ? c.pairs : [])
      .map((p) => {
        const pp = p as Record<string, unknown>;
        const left = str(pp?.left ?? pp?.a).trim();
        const right = str(pp?.right ?? pp?.b).trim();
        return left && right ? { id: uid(), left, right } : null;
      })
      .filter((x): x is { id: string; left: string; right: string } => x !== null);
    return pairs.length >= 2 ? { pairs } : null;
  },
  timeline: (c) => {
    const events = (Array.isArray(c.events) ? c.events : [])
      .map((e): { id: string; date: string; title: string; description?: string } | null => {
        const ee = e as Record<string, unknown>;
        const title = str(ee?.title).trim();
        const date = str(ee?.date).trim();
        return title && date ? { id: uid(), date, title, description: str(ee?.description) || undefined } : null;
      })
      .filter((x) => x !== null);
    return events.length >= 2 ? { events, mode: c.mode === 'view' ? 'view' : 'exercise' } : null;
  },
  scramble: (c) => {
    const items = (Array.isArray(c.items) ? c.items : [])
      .map((it): { id: string; text: string; hint?: string } | null => {
        const ii = it as Record<string, unknown>;
        const text = str(typeof it === 'string' ? it : ii?.text).trim();
        return text ? { id: uid(), text, hint: str(ii?.hint).trim() || undefined } : null;
      })
      .filter((x) => x !== null);
    if (!items.length) return null;
    const mode = c.mode === 'sentence' || items.some((i) => i.text.includes(' ')) ? 'sentence' : 'word';
    return { mode, items };
  },
  dictation: (c) => {
    const sentences = (Array.isArray(c.sentences) ? c.sentences : [])
      .map((sRaw): { id: string; text: string; hint?: string } | null => {
        const ss = sRaw as Record<string, unknown>;
        const text = str(typeof sRaw === 'string' ? sRaw : ss?.text).trim();
        return text ? { id: uid(), text, hint: str(ss?.hint).trim() || undefined } : null;
      })
      .filter((x) => x !== null);
    return sentences.length ? { sentences, lang: 'nl-BE', rate: 0.95 } : null;
  },
  poll: (c) => {
    const question = str(c.question).trim();
    const options = strArr(c.options);
    if (!question || options.length < 2) return null;
    return { question, options, allowMultiple: c.allowMultiple === true, showResults: true };
  },
  checklist: (c) => {
    const items = strArr(
      Array.isArray(c.items) ? c.items.map((i) => (typeof i === 'string' ? i : str((i as Record<string, unknown>)?.text))) : []
    ).map((text) => ({ id: uid(), text }));
    return items.length ? { items, title: str(c.title) || 'Checklist' } : null;
  },
  webquest: (c) => {
    const steps = (Array.isArray(c.steps) ? c.steps : [])
      .map((sRaw) => {
        const ss = sRaw as Record<string, unknown>;
        const title = str(ss?.title).trim();
        const content = str(ss?.content).trim();
        if (!title || !content) return null;
        const links = (Array.isArray(ss?.links) ? (ss.links as unknown[]) : [])
          .map((l) => {
            const ll = l as Record<string, unknown>;
            const label = str(ll?.label).trim();
            const url = str(ll?.url).trim();
            return label && /^https?:\/\//i.test(url) ? { label, url } : null;
          })
          .filter((x): x is { label: string; url: string } => x !== null);
        return { id: uid(), title, content, links };
      })
      .filter((x): x is { id: string; title: string; content: string; links: { label: string; url: string }[] } => x !== null);
    return steps.length ? { steps } : null;
  },
  mindmap: (c) => {
    const root = str(c.root).trim();
    const outline = str(c.outline);
    return root && outline.trim() ? { root, outline, studentEditable: c.studentEditable !== false } : null;
  },
  planner: (c) => {
    const sections = (Array.isArray(c.sections) ? c.sections : [])
      .map((sRaw) => {
        const ss = sRaw as Record<string, unknown>;
        const title = str(ss?.title).trim();
        const tasks = strArr(
          Array.isArray(ss?.tasks)
            ? (ss.tasks as unknown[]).map((t) => (typeof t === 'string' ? t : str((t as Record<string, unknown>)?.text)))
            : []
        ).map((text) => ({ id: uid(), text }));
        return title && tasks.length ? { id: uid(), title, tasks } : null;
      })
      .filter((x): x is { id: string; title: string; tasks: { id: string; text: string }[] } => x !== null);
    return sections.length ? { title: str(c.title) || 'Planner', sections } : null;
  },
  bingo: (c) => {
    const items = strArr(c.items);
    const size = ([3, 4, 5] as const).find((n) => n === Math.round(num(c.size, 4))) ?? 4;
    return items.length >= size * size ? { items, size, freeCenter: false } : items.length >= 9 ? { items, size: 3, freeCenter: false } : null;
  },
  spinner: (c) => {
    const items = strArr(c.items);
    return items.length >= 2 ? { items, removeAfterSpin: false } : null;
  },
};

function quizFamily(c: Record<string, unknown>, layout: 'single' | 'scroll'): Record<string, unknown> | null {
  const questions = sanitizeQuestions(c.questions);
  if (questions.length === 0) return null;
  const cfg: QuizConfig = {
    questions,
    layout: c.layout === 'scroll' || c.layout === 'single' ? (c.layout as 'single' | 'scroll') : layout,
    glossary: sanitizeGlossary(c.glossary),
  };
  if (questions.some((q) => q.level)) cfg.useRoutes = false; // leerkracht zet dit bewust zelf aan
  return cfg as unknown as Record<string, unknown>;
}

// ── Envelop → widgets ───────────────────────────────────────────────────────

export interface GeneratedResult {
  widgets: Widget[];
  warnings: string[];
}

/**
 * Zet de JSON-envelop van de AI om naar échte, opslaanbare widgets.
 * Ongeldige onderdelen worden overgeslagen met een leesbare waarschuwing.
 */
export function sanitizeGeneratedWidgets(raw: unknown): GeneratedResult {
  const warnings: string[] = [];
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).widgets)
      ? ((raw as Record<string, unknown>).widgets as unknown[])
      : null;
  if (!list) {
    return { widgets: [], warnings: ['De AI gaf geen widgetlijst terug in het verwachte formaat.'] };
  }
  const widgets: Widget[] = [];
  for (const item of list) {
    const w = item as Record<string, unknown> | null;
    if (!w || typeof w !== 'object') continue;
    const type = str(w.type);
    if (!isGenType(type)) {
      warnings.push(`Widgettype "${type || '?'}" wordt niet ondersteund en is overgeslagen.`);
      continue;
    }
    const rawCfg = (w.config && typeof w.config === 'object' ? w.config : {}) as Record<string, unknown>;
    const sanitizer = CONFIG_SANITIZERS[type];
    const cfg = sanitizer ? sanitizer(rawCfg) : null;
    if (!cfg) {
      warnings.push(`De inhoud van de ${getTypeDef(type).name.toLowerCase()} was onvolledig en is overgeslagen.`);
      continue;
    }
    const widget = createWidget(type, str(w.title).trim() || getTypeDef(type).name);
    widget.config = { ...(getTypeDef(type).defaultConfig() as Record<string, unknown>), ...cfg };
    widgets.push(widget);
  }
  if (widgets.length === 0 && warnings.length === 0) {
    warnings.push('De AI leverde geen bruikbare widgets op. Probeer het opnieuw met een duidelijkere opdracht.');
  }
  return { widgets, warnings };
}
