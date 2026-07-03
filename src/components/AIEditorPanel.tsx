// ── AI-paneel in de widgeteditor ────────────────────────────────────────────
//
// Brede modal met AI-acties op de widget die nu bewerkt wordt:
// - quizfamilie (quiz/werkblad/exit-ticket/gesplitst werkblad): vragen bijmaken,
//   hulp (uitleg/hints/steuntaal) aanvullen, glossarium maken, afleiders versterken
// - andere genereerbare types: items bijmaken (kaarten, woorden, paren, …)
// Elke actie toont ALTIJD eerst een voorstel; pas bij "Toepassen" krijgt de
// aanroeper de volledige nieuwe config via onApply(config, samenvatting).

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  GapQuestion, MCQuestion, MultiQuestion, Question, Widget, WidgetTypeId,
} from '../lib/types';
import { AIError, askAI, extractJson } from '../lib/ai';
import {
  AI_GEN_TYPES, buildWidgetGenPrompt, sanitizeGeneratedWidgets, sanitizeQuestions,
} from '../lib/aiWidgetGen';
import { getTypeDef } from '../widgets/registry';
import { Field, EmptyState, Modal, useToast } from './ui';
import { AIErrorBox, AIGate, AIReviewNote, AIWorkingBox } from './aiCommon';

// ── Hulpjes ─────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const QUIZ_FAMILY: WidgetTypeId[] = ['quiz', 'worksheet', 'exitticket', 'splitworksheet'];

function asRec(v: unknown): Rec {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function norm(s: string): string {
  return s.trim().toLowerCase();
}
function shortText(s: string, max = 64): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function clampCount(n: number): number {
  return Math.min(20, Math.max(1, Math.round(n) || 5));
}

const Q_LABEL: Record<string, string> = {
  mc: 'meerkeuze', multi: 'meerdere juist', tf: 'juist/onjuist', short: 'kort antwoord',
  long: 'open vraag', gap: 'invullen', match: 'koppelen', order: 'rangschikken',
  number: 'getal', slider: 'schuiver', info: 'infoblok',
};

/** Per genereerbaar (niet-quiz) type: waar zit de itemlijst en hoe tonen we een item? */
interface ItemDef {
  field: string;
  /** Meervoud voor samenvattingen, bv. "kaarten". */
  noun: string;
  /** Enkelvoud, bv. "kaart". */
  one: string;
  textOf: (item: unknown) => string;
  line: (item: unknown) => string;
}

const ITEM_DEFS: Partial<Record<WidgetTypeId, ItemDef>> = {
  flashcards: {
    field: 'cards', noun: 'kaarten', one: 'kaart',
    textOf: (i) => str(asRec(i).front),
    line: (i) => `${str(asRec(i).front)} → ${str(asRec(i).back)}`,
  },
  crossword: {
    field: 'entries', noun: 'woorden', one: 'woord',
    textOf: (i) => str(asRec(i).word),
    line: (i) => `${str(asRec(i).word)} — ${str(asRec(i).clue)}`,
  },
  wordsearch: {
    field: 'words', noun: 'woorden', one: 'woord',
    textOf: (i) => str(i),
    line: (i) => str(i),
  },
  memory: {
    field: 'pairs', noun: 'paren', one: 'paar',
    textOf: (i) => str(asRec(i).a),
    line: (i) => `${str(asRec(i).a)} ↔ ${str(asRec(i).b)}`,
  },
  hangman: {
    field: 'words', noun: 'woorden', one: 'woord',
    textOf: (i) => str(asRec(i).word),
    line: (i) => (str(asRec(i).hint) ? `${str(asRec(i).word)} — ${str(asRec(i).hint)}` : str(asRec(i).word)),
  },
  pairs: {
    field: 'pairs', noun: 'paren', one: 'paar',
    textOf: (i) => str(asRec(i).left),
    line: (i) => `${str(asRec(i).left)} ↔ ${str(asRec(i).right)}`,
  },
  timeline: {
    field: 'events', noun: 'gebeurtenissen', one: 'gebeurtenis',
    textOf: (i) => str(asRec(i).title),
    line: (i) => `${str(asRec(i).date)} — ${str(asRec(i).title)}`,
  },
  scramble: {
    field: 'items', noun: 'items', one: 'item',
    textOf: (i) => str(asRec(i).text),
    line: (i) => str(asRec(i).text),
  },
  dictation: {
    field: 'sentences', noun: 'zinnen', one: 'zin',
    textOf: (i) => str(asRec(i).text),
    line: (i) => str(asRec(i).text),
  },
  poll: {
    field: 'options', noun: 'opties', one: 'optie',
    textOf: (i) => str(i),
    line: (i) => str(i),
  },
  checklist: {
    field: 'items', noun: 'items', one: 'item',
    textOf: (i) => str(asRec(i).text),
    line: (i) => str(asRec(i).text),
  },
  webquest: {
    field: 'steps', noun: 'stappen', one: 'stap',
    textOf: (i) => str(asRec(i).title),
    line: (i) => str(asRec(i).title),
  },
  planner: {
    field: 'sections', noun: 'onderdelen', one: 'onderdeel',
    textOf: (i) => str(asRec(i).title),
    line: (i) => {
      const r = asRec(i);
      const t = Array.isArray(r.tasks) ? r.tasks.length : 0;
      return `${str(r.title)} (${t} ${t === 1 ? 'taak' : 'taken'})`;
    },
  },
  bingo: {
    field: 'items', noun: 'vakjes', one: 'vakje',
    textOf: (i) => str(i),
    line: (i) => str(i),
  },
  spinner: {
    field: 'items', noun: 'items', one: 'item',
    textOf: (i) => str(i),
    line: (i) => str(i),
  },
};

/** Haalt een lijst ruwe vragen uit modeluitvoer: {"questions":[…]}, een kale array of de widget-envelop. */
function pluckRawQuestions(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const o = asRec(json);
  if (Array.isArray(o.questions)) return o.questions;
  if (Array.isArray(o.widgets)) {
    for (const w of o.widgets) {
      const c = asRec(asRec(w).config);
      if (Array.isArray(c.questions)) return c.questions;
    }
  }
  return [];
}

// ── Kleine presentatiestukjes ───────────────────────────────────────────────

function ActionCard({
  icon, title, desc, onClick, disabled, disabledHint,
}: {
  icon: string; title: string; desc: string; onClick: () => void;
  disabled?: boolean; disabledHint?: string;
}) {
  return (
    <button
      type="button"
      className="card"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        font: 'inherit', color: 'inherit',
      }}
    >
      <span style={{ fontSize: '1.4rem', lineHeight: 1 }} aria-hidden>{icon}</span>
      <span style={{ display: 'grid', gap: 2 }}>
        <strong>{title}</strong>
        <span className="hint">{disabled && disabledHint ? disabledHint : desc}</span>
      </span>
    </button>
  );
}

function PreviewCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '10px 12px', display: 'grid', gap: 4 }}>
      {children}
    </div>
  );
}

function QuestionPreviewList({ qs }: { qs: Question[] }) {
  return (
    <>
      {qs.map((q) => (
        <PreviewCard key={q.id}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span
              className="hint"
              style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0 6px', whiteSpace: 'nowrap' }}
            >
              {Q_LABEL[q.type] ?? q.type}
            </span>
            <strong style={{ fontWeight: 600 }}>
              {q.prompt || (q.type === 'gap' ? (q as GapQuestion).text : '')}
            </strong>
          </div>
          {(q.type === 'mc' || q.type === 'multi') && (
            <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
              {(q as MCQuestion | MultiQuestion).options.map((o, i) => {
                const correct = q.type === 'mc'
                  ? i === (q as MCQuestion).correctIndex
                  : (q as MultiQuestion).correctIndices.includes(i);
                return <li key={i}>{correct ? <strong>✓ {o}</strong> : o}</li>;
              })}
            </ul>
          )}
          {q.type === 'gap' && q.prompt && (
            <span className="hint">{(q as GapQuestion).text}</span>
          )}
        </PreviewCard>
      ))}
    </>
  );
}

// ── Voorsteldata ────────────────────────────────────────────────────────────

interface PreviewData {
  /** De VOLLEDIGE nieuwe config (geen diff). */
  config: unknown;
  /** Korte samenvatting, bv. "+5 vragen" — gaat ook mee naar onApply. */
  summary: string;
  details: React.ReactNode;
  warnings: string[];
}

// ── Het paneel zelf ─────────────────────────────────────────────────────────

export function AIEditorPanel({ widget, onClose, onApply }: {
  widget: Widget;
  onClose: () => void;
  onApply: (config: unknown, note: string) => void;
}): JSX.Element {
  const toast = useToast();
  const typeDef = getTypeDef(widget.type);
  const isQuizFam = QUIZ_FAMILY.includes(widget.type);
  const supported = isQuizFam || AI_GEN_TYPES.includes(widget.type);
  const itemDef = ITEM_DEFS[widget.type];

  // Lokale kopie van de config: blijft ook juist als de aanroeper niet meteen herrendert.
  const [cfg, setCfg] = useState<Rec>(() => asRec(widget.config));
  const questions: Question[] = Array.isArray(cfg.questions) ? (cfg.questions as Question[]) : [];
  const mcqs = questions.filter((q): q is MCQuestion | MultiQuestion => q.type === 'mc' || q.type === 'multi');

  const [mode, setMode] = useState<'menu' | 'form-questions' | 'form-items'>('menu');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const lastRunRef = useRef<(() => void) | null>(null);

  // Formulier "bijmaken"
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState('');
  const [source, setSource] = useState(() =>
    widget.type === 'splitworksheet' ? str(asRec(asRec(widget.config).source).text) : ''
  );

  useEffect(() => () => ctrlRef.current?.abort(), []);

  function runAI(task: string, system: string | undefined, prompt: string, handle: (full: string) => PreviewData) {
    const doRun = () => {
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setBusy(true);
      setError(null);
      setPreview(null);
      setStream('');
      let acc = '';
      askAI({
        system, prompt, task, signal: ctrl.signal,
        onDelta: (t) => { acc += t; setStream(acc); },
      })
        .then((full) => { setPreview(handle(full)); })
        .catch((e) => {
          if ((e as Error).name === 'AbortError') return;
          setError((e as Error).message);
        })
        .finally(() => setBusy(false));
    };
    lastRunRef.current = doRun;
    doRun();
  }

  function cancel() {
    ctrlRef.current?.abort();
  }

  function applyPreview() {
    if (!preview) return;
    setCfg(asRec(preview.config));
    onApply(preview.config, preview.summary);
    toast(`Toegepast: ${preview.summary}`, 'ok');
    setPreview(null);
    setStream('');
    setMode('menu'); // terug naar de actielijst — vaak volgen er meerdere acties
  }

  // ── Actie 1: vragen bijmaken (quizfamilie) ────────────────────────────────

  function runAddQuestions() {
    const n = clampCount(count);
    const existing = questions;
    const listing = existing
      .filter((q) => q.prompt.trim())
      .map((q, i) => `${i + 1}. ${q.prompt}`)
      .join('\n');
    const wish: string[] = [];
    wish.push(`Maak precies ${n} NIEUWE vragen voor de bestaande ${typeDef.name.toLowerCase()} "${widget.title}".`);
    if (focus.trim()) wish.push(`Focus/onderwerp: ${focus.trim()}`);
    if (listing) {
      wish.push(`Deze vragen bestaan al — maak GEEN vragen die hiermee overlappen of ze herformuleren:\n${listing}`);
    }
    const { system, prompt } = buildWidgetGenPrompt({
      source, wish: wish.join('\n\n'), types: ['quiz'], itemCount: n,
    });
    runAI('vragen bijmaken', system, prompt, (full) => {
      const raw = pluckRawQuestions(extractJson(full));
      const seen = new Set(existing.map((q) => norm(q.prompt)).filter(Boolean));
      const fresh: Question[] = [];
      for (const q of sanitizeQuestions(raw)) {
        const k = norm(q.prompt);
        if (k && seen.has(k)) continue;
        if (k) seen.add(k);
        fresh.push(q);
      }
      if (fresh.length === 0) {
        throw new AIError('De AI leverde geen bruikbare nieuwe vragen op. Probeer het opnieuw of pas de focus aan.');
      }
      return {
        config: { ...cfg, questions: [...existing, ...fresh] },
        summary: `+${fresh.length} ${fresh.length === 1 ? 'vraag' : 'vragen'}`,
        details: <QuestionPreviewList qs={fresh} />,
        warnings: [],
      };
    });
  }

  // ── Actie 2: hulp aanvullen (uitleg / hints / steuntaal) ──────────────────

  function needsHelp(q: Question): boolean {
    return q.type !== 'info' && (!q.explanation || !((q.hints && q.hints.length > 0) || q.hint) || !q.support);
  }

  function runEnrich() {
    const targets = questions.filter(needsHelp);
    if (targets.length === 0) {
      toast('Alle vragen hebben al uitleg, hints en steuntaal.', 'info');
      return;
    }
    // Afbeeldingen (data-URL's) niet meesturen: scheelt veel tokens.
    const payload = JSON.stringify({ questions: targets }, (key, value) => (key === 'imageUrl' ? undefined : value));
    const system = `Je bent een ervaren Vlaamse leerkracht die leerhulp toevoegt aan bestaande quizvragen.
Je verandert NOOIT de vragen of de antwoorden zelf. Antwoord met ALLEEN geldige JSON (geen uitleg, geen markdown).`;
    const prompt = `Vul bij de onderstaande vragen de ONTBREKENDE hulpvelden aan:
- "explanation": korte uitleg waarom het juiste antwoord juist is (feedback als leermoment)
- "hints": maximaal 3 oplopende hulpstapjes (eerst strategie, dan aanwijzing, dan bijna-antwoord)
- "support": dezelfde vraag in eenvoudiger taal (steuntaal voor taalzwakke leerlingen)
Regels:
- Gebruik EXACT dezelfde "id"-waarden als in de invoer.
- Velden die al ingevuld zijn laat je ongemoeid; stuur alleen aanvullingen terug.
- Schrijf in helder Nederlands (Vlaanderen), afgestemd op leerlingen.
Antwoord met ALLEEN JSON in dit formaat: {"questions":[{"id":"…","explanation":"…","hints":["…"],"support":"…"}]}

=== VRAGEN (JSON) ===
${payload}`;
    runAI('hulp aanvullen', system, prompt, (full) => {
      const json = extractJson(full);
      const arr = Array.isArray(json) ? json : asRec(json).questions;
      const updates = new Map<string, { explanation?: string; hints?: string[]; support?: string }>();
      for (const it of Array.isArray(arr) ? arr : []) {
        const r = asRec(it);
        const id = str(r.id);
        if (!id) continue;
        const hints = Array.isArray(r.hints)
          ? r.hints.filter((h): h is string => typeof h === 'string' && h.trim() !== '').slice(0, 3)
          : [];
        updates.set(id, {
          explanation: str(r.explanation).trim() || undefined,
          hints: hints.length ? hints : undefined,
          support: str(r.support).trim() || undefined,
        });
      }
      let touched = 0;
      const rows: React.ReactNode[] = [];
      const newQuestions = questions.map((q) => {
        const u = updates.get(q.id);
        if (!u || q.type === 'info') return q;
        // ALLEEN explanation/hints/support overnemen, en alleen waar het nog ontbrak.
        const nq: Question = { ...q };
        const added: React.ReactNode[] = [];
        if (!nq.explanation && u.explanation) {
          nq.explanation = u.explanation;
          added.push(<span key="e" className="hint">💬 Uitleg: {u.explanation}</span>);
        }
        if (!((nq.hints && nq.hints.length > 0) || nq.hint) && u.hints) {
          nq.hints = u.hints;
          added.push(
            <span key="h" className="hint">
              🪜 Hints: {u.hints.map((h, i) => `${i + 1}) ${h}`).join(' ')}
            </span>
          );
        }
        if (!nq.support && u.support) {
          nq.support = u.support;
          added.push(<span key="s" className="hint">🧭 Steuntaal: {u.support}</span>);
        }
        if (added.length === 0) return q;
        touched++;
        rows.push(
          <PreviewCard key={q.id}>
            <strong style={{ fontWeight: 600 }}>{q.prompt}</strong>
            {added}
          </PreviewCard>
        );
        return nq;
      });
      if (touched === 0) {
        throw new AIError('De AI gaf geen bruikbare aanvullingen terug. Probeer het opnieuw.');
      }
      return {
        config: { ...cfg, questions: newQuestions },
        summary: `hulp aangevuld bij ${touched} ${touched === 1 ? 'vraag' : 'vragen'}`,
        details: <>{rows}</>,
        warnings: [],
      };
    });
  }

  // ── Actie 3: glossarium maken ─────────────────────────────────────────────

  function runGlossary() {
    const existingGlossary = (Array.isArray(cfg.glossary) ? cfg.glossary : [])
      .map((g) => ({ term: str(asRec(g).term).trim(), uitleg: str(asRec(g).uitleg).trim() }))
      .filter((g) => g.term && g.uitleg);
    const content = questions
      .map((q, i) => {
        const bits: string[] = [q.prompt];
        if (q.type === 'mc' || q.type === 'multi') bits.push(...(q as MCQuestion | MultiQuestion).options);
        if (q.type === 'gap') bits.push((q as GapQuestion).text);
        return `${i + 1}. ${bits.filter(Boolean).join(' | ')}`;
      })
      .join('\n');
    const sourceText = widget.type === 'splitworksheet' ? str(asRec(cfg.source).text) : '';
    const system = `Je bent een ervaren Vlaamse leerkracht en taalcoach. Antwoord met ALLEEN geldige JSON (geen uitleg, geen markdown).`;
    const prompt = `Hieronder staat de inhoud van een oefening ("${widget.title}"). Destilleer de schooltaalwoorden en vakbegrippen waar leerlingen over kunnen struikelen.
- Geef per term een korte, eenvoudige uitleg (1 à 2 zinnen) in helder Nederlands (Vlaanderen).
- Kies alleen woorden die er echt toe doen (ongeveer 5 à 15 termen).
- Verklap in de uitleg NOOIT het antwoord op een vraag.
${existingGlossary.length ? `- Deze termen staan al in het glossarium, sla ze over: ${existingGlossary.map((g) => g.term).join(', ')}\n` : ''}Antwoord met ALLEEN JSON: {"glossary":[{"term":"…","uitleg":"…"}]}

=== VRAGEN ===
${content}${sourceText ? `\n\n=== BRONTEKST ===\n${sourceText}` : ''}`;
    runAI('glossarium maken', system, prompt, (full) => {
      const json = extractJson(full);
      const arr = Array.isArray(json) ? json : asRec(json).glossary;
      const seen = new Set(existingGlossary.map((g) => norm(g.term)));
      const fresh: { term: string; uitleg: string }[] = [];
      for (const it of Array.isArray(arr) ? arr : []) {
        const r = asRec(it);
        const term = str(r.term).trim();
        const uitleg = str(r.uitleg ?? r.explanation).trim();
        if (!term || !uitleg) continue;
        const k = norm(term);
        if (seen.has(k)) continue;
        seen.add(k);
        fresh.push({ term, uitleg });
      }
      if (fresh.length === 0) {
        throw new AIError('De AI vond geen nieuwe begrippen om toe te voegen. Probeer het opnieuw.');
      }
      return {
        config: { ...cfg, glossary: [...existingGlossary, ...fresh] },
        summary: `+${fresh.length} ${fresh.length === 1 ? 'begrip' : 'begrippen'} in het glossarium`,
        details: (
          <>
            {fresh.map((g) => (
              <PreviewCard key={g.term}>
                <strong style={{ fontWeight: 600 }}>{g.term}</strong>
                <span className="hint">{g.uitleg}</span>
              </PreviewCard>
            ))}
          </>
        ),
        warnings: [],
      };
    });
  }

  // ── Actie 4: afleiders versterken (alleen mc/multi) ───────────────────────

  function runDistractors() {
    if (mcqs.length === 0) return;
    const payload = JSON.stringify({
      questions: mcqs.map((q) => ({
        id: q.id, type: q.type, prompt: q.prompt, options: q.options,
        ...(q.type === 'mc' ? { correctIndex: q.correctIndex } : { correctIndices: q.correctIndices }),
      })),
    });
    const system = `Je bent een ervaren Vlaamse toetsontwikkelaar, gespecialiseerd in sterke meerkeuzevragen.
Antwoord met ALLEEN geldige JSON (geen uitleg, geen markdown).`;
    const prompt = `Hieronder staan meerkeuzevragen (JSON). Versterk de ZWAKKE afleiders: herschrijf de foute opties tot plausibele misvattingen die leerlingen echt maken.
Regels:
- De juiste optie(s) — op de aangegeven index(en) — blijven EXACT ongewijzigd en op dezelfde plaats.
- Geef per vraag evenveel opties terug als er waren; verander alleen foute opties die te doorzichtig of flauw zijn.
- Afleiders zijn geloofwaardig en vergelijkbaar in lengte en stijl; geen "alle bovenstaande", geen onzin.
- Gebruik EXACT dezelfde "id"-waarden.
Antwoord met ALLEEN JSON: {"questions":[{"id":"…","options":["…","…"]}]}

=== VRAGEN (JSON) ===
${payload}`;
    runAI('afleiders versterken', system, prompt, (full) => {
      const json = extractJson(full);
      const arr = Array.isArray(json) ? json : asRec(json).questions;
      const map = new Map<string, unknown>();
      for (const it of Array.isArray(arr) ? arr : []) {
        const r = asRec(it);
        if (str(r.id)) map.set(str(r.id), r.options);
      }
      const warnings: string[] = [];
      let changed = 0;
      const rows: React.ReactNode[] = [];
      const newQuestions = questions.map((q) => {
        if (q.type !== 'mc' && q.type !== 'multi') return q;
        const rawOpts = map.get(q.id);
        if (rawOpts === undefined) return q;
        const opts = Array.isArray(rawOpts) ? rawOpts : null;
        // Controle: evenveel opties, allemaal niet-lege tekst.
        if (!opts || opts.length !== q.options.length || opts.some((o) => typeof o !== 'string' || !(o as string).trim())) {
          warnings.push(`"${shortText(q.prompt)}" overgeslagen: de AI gaf een afwijkend aantal opties terug.`);
          return q;
        }
        const strOpts = opts as string[];
        const correctIdx = q.type === 'mc' ? [q.correctIndex] : q.correctIndices;
        // Controle: het juiste antwoord bleef tekstueel behouden op zijn plaats.
        const intact = correctIdx.every((i) => strOpts[i].trim() === q.options[i].trim());
        if (!intact) {
          warnings.push(`"${shortText(q.prompt)}" overgeslagen: het juiste antwoord bleef niet behouden.`);
          return q;
        }
        const cleaned = strOpts.map((o, i) => (correctIdx.includes(i) ? q.options[i] : o.trim()));
        if (cleaned.every((o, i) => o === q.options[i])) return q; // niets gewijzigd
        changed++;
        rows.push(
          <PreviewCard key={q.id}>
            <strong style={{ fontWeight: 600 }}>{q.prompt}</strong>
            <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
              {cleaned.map((o, i) => (
                <li key={i}>
                  {correctIdx.includes(i) ? (
                    <strong>✓ {o} <span style={{ fontWeight: 400 }}>(juist, ongewijzigd)</span></strong>
                  ) : o === q.options[i] ? (
                    o
                  ) : (
                    <>↻ {o} <s style={{ opacity: 0.6 }}>{q.options[i]}</s></>
                  )}
                </li>
              ))}
            </ul>
          </PreviewCard>
        );
        return { ...q, options: cleaned } as Question;
      });
      if (changed === 0) {
        throw new AIError(
          warnings.length
            ? `Geen afleiders aangepast. ${warnings.join(' ')}`
            : 'De AI stelde geen bruikbare nieuwe afleiders voor. Probeer het opnieuw.'
        );
      }
      return {
        config: { ...cfg, questions: newQuestions },
        summary: `afleiders versterkt bij ${changed} ${changed === 1 ? 'vraag' : 'vragen'}`,
        details: <>{rows}</>,
        warnings,
      };
    });
  }

  // ── Actie: items bijmaken (niet-quiz genereerbare types) ──────────────────

  function runAddItems() {
    const n = clampCount(count);
    const wish: string[] = [];
    wish.push(`Breid de bestaande ${typeDef.name.toLowerCase()} "${widget.title}" uit met precies ${n} NIEUWE items.`);
    if (focus.trim()) wish.push(`Focus/onderwerp: ${focus.trim()}`);
    if (widget.type === 'mindmap') {
      wish.push(`De mindmap heeft als centraal begrip "${str(cfg.root)}". Bestaande outline:\n${str(cfg.outline) || '(leeg)'}`);
      wish.push('Geef in "outline" ALLEEN de nieuwe takken (met eventuele subtakken, 2 spaties per niveau); die worden achteraan toegevoegd. Herhaal de bestaande takken NIET. Gebruik dezelfde "root".');
    } else if (itemDef) {
      const existingList = Array.isArray(cfg[itemDef.field]) ? (cfg[itemDef.field] as unknown[]) : [];
      const texts = existingList.map(itemDef.textOf).filter(Boolean);
      if (texts.length) {
        wish.push(`Deze inhoud bestaat al — maak GEEN dubbels of herformuleringen hiervan:\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
      }
      wish.push('Geef in de config ALLEEN de nieuwe items; de bestaande blijven behouden.');
    }
    const { system, prompt } = buildWidgetGenPrompt({
      source, wish: wish.join('\n\n'), types: [widget.type], itemCount: n,
    });
    runAI('items bijmaken', system, prompt, (full) => {
      const json = extractJson(full);
      const o = asRec(json);
      // Envelop opbouwen (of herstellen als de AI een kale config terugstuurde) …
      const rawWidgets: unknown[] = Array.isArray(o.widgets)
        ? o.widgets
        : [{ type: widget.type, title: widget.title, config: json }];
      // … en aandikken met de bestaande items zodat minimumaantallen in de
      // sanering (bv. bingo, kruiswoord) niet over de NIEUWE items struikelen.
      const padded = rawWidgets.map((w) => {
        const wr = asRec(w);
        if (str(wr.type) !== widget.type) return w;
        const rawCfg = { ...asRec(wr.config) };
        if (widget.type === 'mindmap') {
          if (!str(rawCfg.root).trim()) rawCfg.root = str(cfg.root) || 'Mindmap';
        } else if (itemDef) {
          if (widget.type === 'poll' && !str(rawCfg.question).trim()) rawCfg.question = str(cfg.question) || 'Peiling';
          const existing = Array.isArray(cfg[itemDef.field]) ? (cfg[itemDef.field] as unknown[]) : [];
          const freshRaw = Array.isArray(rawCfg[itemDef.field]) ? (rawCfg[itemDef.field] as unknown[]) : [];
          rawCfg[itemDef.field] = [...existing, ...freshRaw];
        }
        return { ...wr, config: rawCfg };
      });
      const { widgets: gen, warnings } = sanitizeGeneratedWidgets({ widgets: padded });
      const genW = gen.find((g) => g.type === widget.type);
      if (!genW) {
        throw new AIError(warnings.join(' ') || 'De AI leverde geen bruikbare items op. Probeer het opnieuw.');
      }
      const genCfg = asRec(genW.config);

      if (widget.type === 'mindmap') {
        const existingOutline = str(cfg.outline);
        const existingLines = new Set(existingOutline.split('\n').map(norm).filter(Boolean));
        const freshLines = str(genCfg.outline)
          .split('\n')
          .filter((l) => l.trim() !== '' && !existingLines.has(norm(l)));
        if (freshLines.length === 0) {
          throw new AIError('De AI leverde geen nieuwe takken op (alles bestond al). Probeer een andere focus.');
        }
        const branches = freshLines.filter((l) => !/^\s/.test(l)).length || freshLines.length;
        return {
          config: { ...cfg, outline: `${existingOutline.replace(/\s+$/, '')}\n${freshLines.join('\n')}`.replace(/^\n/, '') },
          summary: `+${branches} ${branches === 1 ? 'tak' : 'takken'}`,
          details: (
            <PreviewCard>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{freshLines.join('\n')}</pre>
            </PreviewCard>
          ),
          warnings,
        };
      }

      if (!itemDef) throw new AIError('Voor dit widgettype is er (nog) geen AI-hulp.');
      const existingList = Array.isArray(cfg[itemDef.field]) ? (cfg[itemDef.field] as unknown[]) : [];
      const seen = new Set(existingList.map((i) => norm(itemDef.textOf(i))).filter(Boolean));
      const genList = Array.isArray(genCfg[itemDef.field]) ? (genCfg[itemDef.field] as unknown[]) : [];
      const fresh: unknown[] = [];
      for (const it of genList) {
        const k = norm(itemDef.textOf(it));
        if (!k || seen.has(k)) continue;
        seen.add(k);
        fresh.push(it);
      }
      if (fresh.length === 0) {
        throw new AIError('De AI leverde geen nieuwe items op (alles bestond al). Probeer een andere focus.');
      }
      const merged: Rec = { ...cfg, [itemDef.field]: [...existingList, ...fresh] };
      if (widget.type === 'wordsearch') {
        // Rooster groot genoeg houden voor het langste (nieuwe) woord.
        const allWords = (Array.isArray(merged.words) ? merged.words : []).filter((w): w is string => typeof w === 'string');
        const longest = Math.max(0, ...allWords.map((w) => w.length));
        const size = Math.round(Number(merged.size)) || 12;
        merged.size = Math.min(18, Math.max(size, longest));
      }
      return {
        config: merged,
        summary: `+${fresh.length} ${fresh.length === 1 ? itemDef.one : itemDef.noun}`,
        details: (
          <>
            {fresh.map((it, i) => (
              <PreviewCard key={i}>
                <span>{itemDef.line(it)}</span>
              </PreviewCard>
            ))}
          </>
        ),
        warnings,
      };
    });
  }

  // ── Weergave ────────────────────────────────────────────────────────────────

  const footer = (
    <span className="hint" style={{ marginRight: 'auto', textAlign: 'left' }}>
      ✨ AI-voorzet — kijk alles na. Gebruik: ~tokens zichtbaar bij{' '}
      <Link to="/ai-instellingen">AI-instellingen</Link>.
    </span>
  );

  let body: React.ReactNode;
  if (!supported) {
    body = (
      <EmptyState icon="🤖" title="Voor dit widgettype is er (nog) geen AI-hulp.">
        <p className="hint" style={{ margin: 0 }}>
          Probeer de AI-studio voor het genereren van nieuwe widgets uit bronmateriaal.
        </p>
      </EmptyState>
    );
  } else if (busy) {
    body = <AIWorkingBox streamText={stream} label="De AI werkt aan een voorstel…" onCancel={cancel} />;
  } else if (error) {
    body = (
      <div style={{ display: 'grid', gap: 10 }}>
        <AIErrorBox error={error} onRetry={() => lastRunRef.current?.()} />
        <div>
          <button className="btn btn-sm btn-quiet" onClick={() => { setError(null); setMode('menu'); }}>
            ← Terug naar de acties
          </button>
        </div>
      </div>
    );
  } else if (preview) {
    body = (
      <div style={{ display: 'grid', gap: 12 }}>
        <AIReviewNote />
        <strong style={{ fontSize: '1.05rem' }}>Voorstel: {preview.summary}</strong>
        {preview.warnings.length > 0 && (
          <div style={{ display: 'grid', gap: 4 }}>
            {preview.warnings.map((w, i) => (
              <p key={i} className="hint" style={{ margin: 0, color: 'var(--warn)' }}>⚠ {w}</p>
            ))}
          </div>
        )}
        <div style={{ maxHeight: 340, overflowY: 'auto', display: 'grid', gap: 8, paddingRight: 2 }}>
          {preview.details}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => { setPreview(null); setMode('menu'); }}>
            Verwerpen
          </button>
          <button className="btn btn-primary" onClick={applyPreview}>✔ Toepassen</button>
        </div>
      </div>
    );
  } else if (mode === 'form-questions' || mode === 'form-items') {
    const forQuestions = mode === 'form-questions';
    body = (
      <div style={{ display: 'grid', gap: 4 }}>
        <div>
          <button className="btn btn-sm btn-quiet" onClick={() => setMode('menu')}>← Terug</button>
        </div>
        <h3 style={{ margin: '4px 0 10px' }}>➕ {forQuestions ? 'Vragen' : 'Items'} bijmaken</h3>
        <Field label="Aantal">
          <input
            className="input input-sm"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setCount(Number.isFinite(v) ? v : 0);
            }}
            style={{ maxWidth: 120 }}
          />
        </Field>
        <Field
          label="Focus of onderwerp (optioneel)"
          hint={forQuestions ? 'Bv. "de waterkringloop" of "moeilijkere toepassingsvragen".' : 'Bv. "hoofdsteden van Europa" of "moeilijkere begrippen".'}
        >
          <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Waarover moet het gaan?" />
        </Field>
        <Field
          label="Bronmateriaal (optioneel)"
          hint="Plak hier leerstof; de AI baseert zich dan uitsluitend hierop."
        >
          <textarea className="textarea" rows={5} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Plak hier je tekst, hoofdstuk of samenvatting…" />
        </Field>
        <div>
          <button className="btn btn-primary" onClick={forQuestions ? runAddQuestions : runAddItems}>
            ✨ Voorstel maken
          </button>
        </div>
      </div>
    );
  } else {
    const realQuestions = questions.filter((q) => q.type !== 'info');
    body = (
      <div style={{ display: 'grid', gap: 10 }}>
        <p className="hint" style={{ margin: 0 }}>
          Kies wat de AI mag voorbereiden voor „{widget.title}”. Je krijgt altijd eerst een voorstel te zien.
        </p>
        {isQuizFam ? (
          <>
            <ActionCard
              icon="➕"
              title="Vragen bijmaken"
              desc="Nieuwe vragen die aansluiten bij de bestaande, zonder overlap."
              onClick={() => setMode('form-questions')}
            />
            <ActionCard
              icon="💡"
              title="Hulp aanvullen"
              desc="Vult ontbrekende uitleg, hintladders en steuntaal aan bij je vragen."
              onClick={runEnrich}
              disabled={realQuestions.length === 0}
              disabledHint="Nog geen vragen om aan te vullen."
            />
            <ActionCard
              icon="📖"
              title="Glossarium maken"
              desc="Destilleert schooltaalwoorden uit de vragen, met korte uitleg voor leerlingen."
              onClick={runGlossary}
              disabled={questions.length === 0}
              disabledHint="Nog geen vragen om begrippen uit te halen."
            />
            <ActionCard
              icon="🎯"
              title="Afleiders versterken"
              desc="Herschrijft zwakke foute opties tot plausibele misvattingen; juiste antwoorden blijven staan."
              onClick={runDistractors}
              disabled={mcqs.length === 0}
              disabledHint="Geen meerkeuzevragen in deze widget."
            />
          </>
        ) : (
          <ActionCard
            icon="➕"
            title="Items bijmaken"
            desc={`Nieuwe ${widget.type === 'mindmap' ? 'takken' : itemDef?.noun ?? 'items'} die passen bij de bestaande inhoud.`}
            onClick={() => setMode('form-items')}
          />
        )}
      </div>
    );
  }

  return (
    <Modal title={`✨ AI-hulp — ${typeDef.name}`} onClose={onClose} wide footer={footer}>
      <AIGate>{body}</AIGate>
    </Modal>
  );
}
