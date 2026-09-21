// ── AI-cursusbouwer: prompts + sanering ─────────────────────────────────────
//
// Drie taken: (1) een nieuwe cursus opbouwen vanuit bronmateriaal (cursustekst,
// pdf) en/of leerplandoelen, (2) een bestaande cursus herwerken, (3) één sectie
// vullen.
// De AI mag ALLEEN tekstuele blokken maken — nooit media-URL's verzinnen.
// Bij herwerken reizen mediablokken mee als {"type":"keep","id":…} zodat ze
// ongewijzigd op hun (nieuwe) plek terugkomen.

import type { Widget } from './types';
import type { Course, CourseBlock, CourseSection } from './courseTypes';
import { allSections } from './courseTypes';
import type { CurriculumGoal } from './curriculumTypes';
import { normalizeGoalCode, normalizeGoalCodes } from './curriculum';
import { sanitizeCourse } from './courses';
import { quizSchemaText, sanitizeGeneratedWidgets } from './aiWidgetGen';
import { makeCode, uid } from './utils';

// ── Gedeelde schema-teksten ─────────────────────────────────────────────────

const BLOCK_SCHEMA = `Een "blok" is een JSON-object met "type" en velden. TOEGELATEN types (en géén andere — dus nooit image/video/audio/embed/attachment/widget; media voegt de leerkracht zelf toe):
- {"type":"heading","text":"…","level":2} (2 = tussenkop, 3 = kleiner)
- {"type":"text","markdown":"lopende tekst; opmaak: **vet**, *cursief*, - lijstjes, ## kopjes"}
- {"type":"callout","kind":"info"|"tip"|"warn"|"goal","title":"…","text":"…"}
- {"type":"quote","text":"…","source":"…"}
- {"type":"divider"}
- {"type":"accordion","items":[{"title":"…","text":"…"}]} — uitklapbare onderdelen (bv. "controleer jezelf")
- {"type":"columns","left":"markdown","right":"markdown"}
- {"type":"table","header":true,"rows":[["kop A","kop B"],["cel","cel"]]}
- {"type":"terms","items":[{"term":"…","uitleg":"…"}]} — begrippenlijst
- {"type":"checklist","title":"…","items":["afvinkbaar item",…]} — de leerling vinkt af`;

const COURSE_SYSTEM = `Je bent een ervaren Vlaamse leerkracht en leermiddelenauteur die digitale cursussen bouwt voor Boosterz.
Didactische eisen:
- Elke sectie begint met een callout van kind "goal" die in leerlingtaal zegt wat je er leert.
- Wissel leerstof (text/table/terms) af met verwerking (checklist, accordion met controlevragen).
- Sluit elk hoofdstuk af met een korte samenvattingssectie.
- Vul per sectie "goals" in: de leerplandoelen (of deeldoelen) waaraan de sectie werkt, kort geformuleerd.
- Markeer verdiepings- of keuzeleerstof met "optional": true.
- Helder Nederlands (Vlaanderen), afgestemd op de doelgroep; leg schooltaalwoorden uit in een terms-blok.
- Verzin geen feiten waar je niet zeker van bent; blijf bij algemeen aanvaarde leerstof.
Antwoord met ALLEEN geldige JSON, zonder uitleg of markdown-hekken.`;

// ── Prompts ─────────────────────────────────────────────────────────────────

/** Meer bron dan dit gaat niet mee: houdt de prompt binnen het contextvenster. */
export const MAX_SOURCE_CHARS = 60000;

/** Doelenlijst voor in een prompt: "WIS 2.3 — De leerlingen … (Getallenleer, uitbreiding)". */
export function goalListText(goals: CurriculumGoal[]): string {
  return goals
    .map((g) => {
      const extra = [g.theme?.trim(), g.level === 'uitbreiding' ? 'uitbreiding' : ''].filter(Boolean).join(' · ');
      return `- ${normalizeGoalCode(g.code)} — ${g.text.trim()}${extra ? ` (${extra})` : ''}`;
    })
    .join('\n');
}

/** Het regeltje dat in élke leerplanprompt terugkomt. */
function goalCodeRules(goals: CurriculumGoal[]): string {
  const codes = goals.map((g) => normalizeGoalCode(g.code));
  return `Elke sectie krijgt een veld "goalCodes": een lijst met de codes van de leerplandoelen waaraan die sectie werkt.
- Gebruik UITSLUITEND codes uit de lijst hierboven, exact zoals ze er staan (${codes.slice(0, 6).join(', ')}${codes.length > 6 ? ', …' : ''}).
- Samen moeten de secties ALLE ${codes.length} doelen dekken: geen enkel doel mag overblijven. Een doel mag in meerdere secties terugkomen.
- Zet een doel nooit alleen in een sectie met "optional": true — verdieping ziet niet elke leerling.
- Vul daarnaast ook "goals" in: dezelfde doelen in leerlingtaal ("Ik kan …").`;
}

export interface NewCourseRequest {
  /** Leerplandoelen (vrije tekst). Verplicht als er geen bronmateriaal is. */
  goals: string;
  /** Gekozen leerplandoelen mét code — het skelet van een "blanco vanuit leerplan". */
  curriculumGoals?: CurriculumGoal[];
  /** Voorgestelde titel (bv. uit de importpagina). */
  title?: string;
  /** Eigen cursustekst of pdf-tekst: de AI blijft er inhoudelijk strikt bij. */
  sourceText?: string;
  audience?: string;
  subject?: string;
  extraWishes?: string;
  /** 0 = AI kiest. */
  chapterCount?: number;
  /** Per hoofdstuk ook een oefenquiz (als aparte widgets). */
  withQuizzes?: boolean;
}

export function buildNewCoursePrompt(req: NewCourseRequest): { system: string; prompt: string } {
  const parts: string[] = [];
  parts.push('Bouw een volledige digitale cursus.');
  if (req.title?.trim()) parts.push(`Voorgestelde titel (mag je verfijnen): ${req.title.trim()}`);
  if (req.subject?.trim()) parts.push(`Vak/onderwerp: ${req.subject.trim()}`);
  if (req.audience?.trim()) parts.push(`Doelgroep: ${req.audience.trim()}`);
  if (req.chapterCount && req.chapterCount > 0) parts.push(`Richtaantal hoofdstukken: ${req.chapterCount}.`);
  if (req.extraWishes?.trim()) parts.push(`Extra wensen van de leerkracht: ${req.extraWishes.trim()}`);
  const source = (req.sourceText ?? '').trim();
  const goals = req.goals.trim();
  const curGoals = req.curriculumGoals ?? [];
  if (curGoals.length) {
    parts.push(
      `\nDeze LEERPLANDOELEN (met hun officiële code) vormen het skelet van de cursus:\n${goalListText(curGoals)}\n\n${goalCodeRules(curGoals)}`
    );
  }
  if (goals) {
    parts.push(`\nDeze LEERPLANDOELEN vormen het skelet van de cursus — dek ze allemaal en verwijs ernaar in de "goals" van de secties:\n${goals}`);
  }
  if (source) {
    parts.push(
      `\nBRONMATERIAAL van de leerkracht. Bouw de cursus hieruit op: volg de opbouw van het materiaal voor de hoofdstukken en secties, herschrijf in leerlingtaal, laat niets essentieels weg en voeg géén leerstof toe die er niet in staat.`
      + (goals ? '' : ' Leid per sectie zelf de "goals" af: korte doelzinnen in leerlingtaal ("Ik kan …").')
      + `\n<<<BRON\n${source.slice(0, MAX_SOURCE_CHARS)}\nBRON>>>`
    );
  }
  parts.push(`\n${BLOCK_SCHEMA}`);

  if (curGoals.length) {
    parts.push('Sluit ELK hoofdstuk af met een korte samenvattingssectie ("Samenvatting van dit hoofdstuk") die de kern in enkele zinnen of een lijstje herhaalt.');
  }

  let envelope = `Geef terug: {"course":{"title":"…","subtitle":"…","coverEmoji":"één emoji","chapters":[{"title":"…","emoji":"…","sections":[{"title":"…","goals":["…"],"goalCodes":["…"],"optional":false,"blocks":[blok,…]}]}]}}`;
  if (req.withQuizzes) {
    envelope = envelope.slice(0, -1) + `,"widgets":[{"type":"quiz","title":"…","config":{…}}]}
Maak per hoofdstuk één oefenquiz van 4 à 6 vragen over dat hoofdstuk, in dezelfde volgorde als de hoofdstukken.
${quizSchemaText()}`;
    if (curGoals.length) {
      envelope += `\nGeef elke vraag ook een "goalCode": de code van het leerplandoel dat ze toetst, uit dezelfde lijst.`;
    }
  }
  parts.push(`\n${envelope}`);
  return { system: COURSE_SYSTEM, prompt: parts.join('\n\n') };
}

/** Compacte JSON-weergave van een cursus voor herwerk-prompts (zonder data-URLs). */
function compactCourse(course: Course): string {
  const MEDIA = new Set(['image', 'video', 'audio', 'embed', 'attachment', 'widget']);
  const compact = {
    title: course.title,
    subtitle: course.subtitle,
    chapters: course.chapters.map((ch) => ({
      title: ch.title,
      emoji: ch.emoji,
      sections: ch.sections.map((se) => ({
        id: se.id,
        title: se.title,
        goals: se.goals,
        goalCodes: se.goalCodes,
        optional: se.optional || undefined,
        blocks: se.blocks.map((b) => {
          if (MEDIA.has(b.type)) return { type: 'keep', id: b.id, was: b.type };
          switch (b.type) {
            case 'heading': return { type: 'heading', text: b.text, level: b.level };
            case 'text': return { type: 'text', markdown: b.markdown.slice(0, 1200) };
            case 'callout': return { type: 'callout', kind: b.kind, title: b.title, text: b.text.slice(0, 600) };
            case 'quote': return { type: 'quote', text: b.text.slice(0, 400), source: b.source };
            case 'divider': return { type: 'divider' };
            case 'accordion': return { type: 'accordion', items: b.items.map((i) => ({ title: i.title, text: i.text.slice(0, 400) })) };
            case 'columns': return { type: 'columns', left: b.left.slice(0, 600), right: b.right.slice(0, 600) };
            case 'table': return { type: 'table', header: b.header, rows: b.rows };
            case 'terms': return { type: 'terms', items: b.items.map((i) => ({ term: i.term, uitleg: i.uitleg })) };
            case 'checklist': return { type: 'checklist', title: b.title, items: b.items.map((i) => i.text) };
            default: return { type: 'keep', id: (b as CourseBlock).id };
          }
        }),
      })),
    })),
  };
  return JSON.stringify(compact);
}

export function buildReworkPrompt({
  course, wishes, extraRules, goalContext,
}: {
  course: Course;
  wishes: string;
  /** Extra opdrachtregels (bv. de gekozen optimalisaties). */
  extraRules?: string;
  /** Leerplancontext: de doelenlijst waaraan de cursus gekoppeld is. */
  goalContext?: string;
}): { system: string; prompt: string } {
  const prompt = `Herwerk de onderstaande bestaande cursus.

Wat de leerkracht anders wil: ${wishes.trim() || 'verbeter de structuur en de didactische kwaliteit.'}
${extraRules?.trim() ? `
${extraRules.trim()}
` : ''}
BELANGRIJKE regels:
- Behoud het "id" van secties waarvan de inhoud in essentie dezelfde blijft (zo blijft de leesvoortgang van leerlingen geldig). Nieuwe of sterk veranderde secties krijgen géén id.
- Blokken van het type {"type":"keep","id":"…"} zijn mediablokken (afbeeldingen, video's, oefeningen) die je NIET mag wijzigen of weglaten: zet exact datzelfde keep-blok op de best passende plek terug.
- Behoud de "goalCodes" die al op een sectie staan; voeg er enkel codes uit de leerplanlijst aan toe.
- Geef de VOLLEDIGE herwerkte cursus terug, niet alleen de wijzigingen.
${goalContext?.trim() ? `
${goalContext.trim()}
` : ''}
${BLOCK_SCHEMA}

Geef terug: {"course":{"title":"…","subtitle":"…","coverEmoji":"…","chapters":[{"title":"…","emoji":"…","sections":[{"id":"(alleen bij behouden secties)","title":"…","goals":["…"],"goalCodes":["…"],"optional":false,"blocks":[blok,…]}]}]}}

=== HUIDIGE CURSUS (compact) ===
${compactCourse(course)}`;
  return { system: COURSE_SYSTEM, prompt };
}

// ── Optimaliseren: presets die je combineert met eigen wensen ───────────────

export type OptimizePreset = 'taal' | 'differentiatie' | 'controlevragen' | 'hiaten';

export const OPTIMIZE_PRESETS: { id: OptimizePreset; label: string; hint: string }[] = [
  {
    id: 'taal',
    label: 'Vereenvoudig de taal',
    hint: 'Leerlingtaal, korte zinnen, schooltaalwoorden uitgelegd in een begrippenlijst.',
  },
  {
    id: 'differentiatie',
    label: 'Differentieer',
    hint: 'Per sectie een basisdeel; verdieping komt als aparte keuzesectie erachter.',
  },
  {
    id: 'controlevragen',
    label: 'Voeg controlevragen toe',
    hint: 'Per sectie een accordion “Check jezelf” en een afvinklijst.',
  },
  {
    id: 'hiaten',
    label: 'Vul de hiaten t.o.v. het leerplan',
    hint: 'Nieuwe secties voor de doelen die nog nergens aan bod komen; bestaande secties blijven ongemoeid.',
  },
];

const PRESET_RULES: Record<OptimizePreset, string> = {
  taal: '- TAAL: herschrijf alle lopende tekst in leerlingtaal: korte zinnen (max ±15 woorden), actieve vorm, één idee per zin. Elk schooltaal- of vakwoord dat je gebruikt, staat uitgelegd in een "terms"-blok in diezelfde sectie. Laat geen leerstof weg.',
  differentiatie: '- DIFFERENTIATIE: geef elke sectie een duidelijk basisdeel dat iedereen aankan. Wat verdieping is, zet je in een APARTE sectie met "optional": true, met een titel die begint met "Verdieping —", meteen na de basissectie. Herhaal in de verdiepingssectie dezelfde "goalCodes" als de basissectie.',
  controlevragen: '- CONTROLEVRAGEN: sluit elke sectie af met (1) een accordion-blok met de titel "Check jezelf" waarin elk item een vraag is en de tekst het antwoord, en (2) een checklist-blok "Ik kan nu…" met de doelen van die sectie in leerlingtaal.',
  hiaten: '- HIATEN: laat bestaande secties en hun inhoud ONGEMOEID (zelfde id, zelfde blokken, zelfde goalCodes) en voeg enkel NIEUWE secties toe voor de niet-gedekte doelen hieronder. Zet elke nieuwe sectie in het best passende hoofdstuk (of maak één nieuw hoofdstuk achteraan), geef ze géén id, en vul hun "goalCodes" met exact de codes van de doelen die ze dekken.',
};

export interface OptimizeRequest {
  course: Course;
  presets: OptimizePreset[];
  /** Vrije wensen van de leerkracht (mag leeg zijn als er presets zijn). */
  wishes: string;
  /** Doelen die nog niet gedekt zijn (nodig voor de preset 'hiaten'). */
  uncovered?: CurriculumGoal[];
  /** Alle doelen van het gekoppelde leerplan, als context. */
  curriculumGoals?: CurriculumGoal[];
}

export function buildOptimizePrompt(req: OptimizeRequest): { system: string; prompt: string } {
  const rules = req.presets.map((p) => PRESET_RULES[p]).filter(Boolean);
  const wants = req.presets
    .map((p) => OPTIMIZE_PRESETS.find((x) => x.id === p)?.label.toLowerCase())
    .filter(Boolean)
    .join(', ');
  const wishes = [wants ? `optimaliseer de cursus: ${wants}` : '', req.wishes.trim()]
    .filter(Boolean)
    .join('. ');
  const parts: string[] = [];
  if (rules.length) parts.push(`Voer deze optimalisaties uit:\n${rules.join('\n')}`);
  const uncovered = req.uncovered ?? [];
  if (req.presets.includes('hiaten')) {
    parts.push(
      uncovered.length
        ? `Deze leerplandoelen komen nog NIET aan bod in een gewone (niet-optionele) sectie — maak er nieuwe secties voor:\n${goalListText(uncovered)}`
        : 'Alle leerplandoelen zijn al gedekt: voeg dan géén secties toe en meld dat door de cursus ongewijzigd terug te geven.'
    );
  }
  const all = req.curriculumGoals ?? [];
  const goalContext = all.length
    ? `LEERPLAN waaraan deze cursus gekoppeld is — gebruik in "goalCodes" uitsluitend codes uit deze lijst:\n${goalListText(all)}`
    : '';
  return buildReworkPrompt({
    course: req.course,
    wishes: wishes || 'verbeter de didactische kwaliteit',
    extraRules: parts.join('\n\n'),
    goalContext,
  });
}

// ── Oefeningen voorstellen bij één sectie ───────────────────────────────────

/** De tekstuele inhoud van een sectie, voor in een prompt. */
export function sectionPlainText(section: CourseSection, maxChars = 6000): string {
  const out: string[] = [];
  for (const b of section.blocks) {
    switch (b.type) {
      case 'heading': out.push(`## ${b.text}`); break;
      case 'text': out.push(b.markdown); break;
      case 'callout': out.push(`${b.title ? `${b.title}: ` : ''}${b.text}`); break;
      case 'quote': out.push(`"${b.text}"${b.source ? ` — ${b.source}` : ''}`); break;
      case 'columns': out.push(`${b.left}\n${b.right}`); break;
      case 'table': out.push(b.rows.map((r) => r.join(' | ')).join('\n')); break;
      case 'terms': out.push(b.items.map((i) => `${i.term}: ${i.uitleg}`).join('\n')); break;
      case 'accordion': out.push(b.items.map((i) => `${i.title}: ${i.text}`).join('\n')); break;
      case 'checklist': out.push(b.items.map((i) => `- ${i.text}`).join('\n')); break;
      default: break;
    }
  }
  return out.join('\n\n').slice(0, maxChars);
}

export interface SectionExercisesRequest {
  course: Course;
  section: CourseSection;
  chapterTitle?: string;
  /** Leerplandoelen van deze sectie (met code). */
  goals?: CurriculumGoal[];
  /** Aantal oefeningen (1–3). */
  count?: number;
  wishes?: string;
}

export function buildSectionExercisesPrompt(req: SectionExercisesRequest): { system: string; prompt: string } {
  const count = Math.min(3, Math.max(1, req.count ?? 1));
  const goals = req.goals ?? [];
  const content = sectionPlainText(req.section);
  const system = `Je bent een ervaren Vlaamse leerkracht en toetsontwikkelaar die oefeningen maakt voor Boosterz.
Kwaliteitsregels:
- Toets ALLEEN wat in de sectie staat; verzin er geen leerstof bij.
- Meerkeuze: afleiders zijn plausibele misvattingen, nooit flauwekul.
- Geef bij elke vraag een korte "explanation" (feedback is een leermoment).
- Helder Nederlands (Vlaanderen), afgestemd op de doelgroep.
- Antwoord met ALLEEN geldige JSON: {"widgets":[{"type":"quiz","title":"…","config":{…}}]}`;
  const parts: string[] = [];
  parts.push(
    `Maak ${count} oefening(en) bij één sectie van de cursus "${req.course.title}"`
    + `${req.chapterTitle ? ` (hoofdstuk "${req.chapterTitle}")` : ''}, sectie "${req.section.title}".`
  );
  parts.push(`De EERSTE oefening is altijd een "quiz" van 4 à 6 vragen.${count > 1 ? ' De overige mogen ook van het type "flashcards", "pairs" of "checklist" zijn als dat didactisch beter past.' : ''}`);
  if (goals.length) {
    parts.push(
      `Leerplandoelen van deze sectie:\n${goalListText(goals)}\n`
      + `Geef elke vraag een "goalCode" met exact één code uit deze lijst.`
    );
  }
  if (req.wishes?.trim()) parts.push(`Extra wensen van de leerkracht: ${req.wishes.trim()}`);
  parts.push(
    content.trim()
      ? `=== INHOUD VAN DE SECTIE ===\n${content}\n=== EINDE ===`
      : 'De sectie bevat nog geen tekst: baseer je op de titel en de leerdoelen hierboven.'
  );
  parts.push(quizSchemaText());
  parts.push(`Geef terug: {"widgets":[{"type":"quiz","title":"…","config":{"questions":[vraag,…],"layout":"single"}}]}`);
  return { system, prompt: parts.join('\n\n') };
}

/** AI-antwoord met oefeningen → bruikbare widgets (hergebruikt de widgetsanering). */
export function sanitizeSectionExercises(
  json: unknown,
  opts: { curriculumId?: string; allowedGoalCodes?: string[] } = {}
): { widgets: Widget[]; warnings: string[] } {
  // De vragen dragen goalCodes: alleen codes uit de sectie tellen mee.
  const res = sanitizeGeneratedWidgets(json, { allowedGoalCodes: normalizeGoalCodes(opts.allowedGoalCodes) });
  const widgets = res.widgets.map((w) => (opts.curriculumId ? { ...w, curriculumId: opts.curriculumId } : w));
  return { widgets, warnings: res.warnings };
}

export function buildSectionPrompt({
  course, section, wishes, source,
}: { course: Course; section: CourseSection; wishes: string; source?: string }): { system: string; prompt: string } {
  const chapter = course.chapters.find((ch) => ch.sections.some((s) => s.id === section.id));
  const existing = section.blocks.length
    ? `\nDe sectie bevat al ${section.blocks.length} blok(ken): ${section.blocks.map((b) => b.type).join(', ')} — maak inhoud die daarop aansluit zonder te herhalen.`
    : '';
  const prompt = `Vul één sectie van een digitale cursus.

Cursus: "${course.title}"${chapter ? ` · Hoofdstuk: "${chapter.title}"` : ''} · Sectie: "${section.title}"
${section.goals?.length ? `Leerdoelen van deze sectie: ${section.goals.join(' · ')}` : ''}
Wat er in moet komen: ${wishes.trim() || section.title}${existing}
${source?.trim() ? `\nBaseer je UITSLUITEND op dit bronmateriaal:\n=== BRON ===\n${source.trim()}\n=== EINDE BRON ===` : ''}

${BLOCK_SCHEMA}

Geef terug: {"blocks":[blok,…]} — begin met een "goal"-callout, wissel leerstof en verwerking af.`;
  return { system: COURSE_SYSTEM, prompt };
}

// ── Sanering ────────────────────────────────────────────────────────────────

export interface AICourseResult {
  course: Course;
  /**
   * Eén positie per gevraagde quiz, uitgelijnd op de hoofdstukken: een
   * ongeldige quiz wordt null (mét waarschuwing) zodat de overige quizzes
   * niet naar het verkeerde hoofdstuk verschuiven.
   */
  quizzes: (Widget | null)[];
  warnings: string[];
}

/** Vervangt keep-blokken door de originele blokken uit de basiscursus. */
function resolveKeepBlocks(raw: unknown, base: Course | undefined, warnings: string[]): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const byId = new Map<string, CourseBlock>();
  if (base) {
    for (const { section } of allSections(base)) {
      for (const b of section.blocks) byId.set(b.id, b);
    }
  }
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.chapters)) return raw;
  for (const ch of c.chapters as Record<string, unknown>[]) {
    if (!ch || !Array.isArray(ch.sections)) continue;
    for (const se of ch.sections as Record<string, unknown>[]) {
      if (!se || !Array.isArray(se.blocks)) continue;
      se.blocks = (se.blocks as Record<string, unknown>[])
        .map((b) => {
          if (b && b.type === 'keep') {
            const orig = typeof b.id === 'string' ? byId.get(b.id) : undefined;
            if (orig) return JSON.parse(JSON.stringify(orig));
            warnings.push('Een mediablok kon niet teruggeplaatst worden en is weggevallen.');
            return null;
          }
          return b;
        })
        .filter((b) => b !== null);
    }
  }
  // niet-teruggeplaatste mediablokken signaleren (de AI liet ze vallen)
  if (base) {
    const returned = new Set<string>();
    for (const ch of c.chapters as Record<string, unknown>[]) {
      for (const se of ((ch?.sections ?? []) as Record<string, unknown>[])) {
        for (const b of ((se?.blocks ?? []) as Record<string, unknown>[])) {
          if (b && typeof b.id === 'string') returned.add(b.id);
        }
      }
    }
    const MEDIA = new Set(['image', 'video', 'audio', 'embed', 'attachment', 'widget']);
    for (const [id, b] of byId) {
      if (MEDIA.has(b.type) && !returned.has(id)) {
        warnings.push(`Een ${b.type}-blok uit de originele cursus kwam niet terug in de herwerking.`);
      }
    }
  }
  return raw;
}

/**
 * De goalCodes die uit sanitizeCourse komen zijn al genormaliseerd en
 * ontdubbeld; hier kijken we nog of de AI binnen de gevraagde lijst bleef en
 * hangen we het leerplan aan de cursus.
 */
function applyGoalCodes(course: Course, opts: SanitizeAICourseOptions, warnings: string[]) {
  const curriculumId = opts.curriculumId ?? opts.base?.curriculumId;
  if (curriculumId) course.curriculumId = curriculumId;
  const allowed = opts.allowedGoalCodes?.length ? new Set(normalizeGoalCodes(opts.allowedGoalCodes)) : null;
  if (!allowed) return;
  let dropped = 0;
  for (const chapter of course.chapters) {
    for (const section of chapter.sections) {
      if (!section.goalCodes?.length) continue;
      const kept = section.goalCodes.filter((c) => allowed.has(c));
      dropped += section.goalCodes.length - kept.length;
      section.goalCodes = kept.length ? kept : undefined;
    }
  }
  if (dropped > 0) {
    warnings.push(`${dropped} doelcode(s) van de AI stonden niet in je leerplan en zijn weggelaten.`);
  }
}

export interface SanitizeAICourseOptions {
  /** Bestaande cursus bij herwerken/optimaliseren. */
  base?: Course;
  /** Leerplan waaraan de cursus hangt; komt op course.curriculumId terecht. */
  curriculumId?: string;
  /**
   * Codes die de AI mocht gebruiken. Alles daarbuiten wordt weggelaten (de AI
   * verzint al eens een code) — zonder lijst blijven alle codes staan.
   */
  allowedGoalCodes?: string[];
}

export function sanitizeAICourse(json: unknown, opts: SanitizeAICourseOptions = {}): AICourseResult {
  const warnings: string[] = [];
  const envelope = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rawCourse = (envelope.course ?? envelope.c ?? json) as Record<string, unknown>;

  const resolved = resolveKeepBlocks(rawCourse, opts.base, warnings) as Record<string, unknown>;
  const base = opts.base;
  const full = {
    ...resolved,
    id: base?.id ?? uid(),
    code: base?.code ?? makeCode(),
    author: base?.author ?? '',
    coverEmoji: (typeof resolved?.coverEmoji === 'string' && resolved.coverEmoji) || base?.coverEmoji || '📘',
    settings: base?.settings ?? { accentColor: '#4f46e5', requireName: true, showProgressToStudent: true },
    createdAt: base?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  const course = sanitizeCourse(full);
  if (course) {
    applyGoalCodes(course, opts, warnings);
  }
  if (!course) {
    return {
      course: base ?? (sanitizeCourse({ title: 'Cursus', chapters: [{ title: 'Hoofdstuk 1', sections: [{ title: 'Inleiding', blocks: [] }] }] }) as Course),
      quizzes: [],
      warnings: [...warnings, 'De AI gaf geen bruikbare cursusstructuur terug. Probeer het opnieuw.'],
    };
  }

  let quizzes: (Widget | null)[] = [];
  if (Array.isArray(envelope.widgets) && envelope.widgets.length) {
    quizzes = (envelope.widgets as unknown[]).map((w, i) => {
      const gen = sanitizeGeneratedWidgets({ widgets: [w] }, { allowedGoalCodes: normalizeGoalCodes(opts.allowedGoalCodes) });
      warnings.push(...gen.warnings.map((msg) => `Quiz ${i + 1}: ${msg}`));
      return gen.widgets.find((x) => x.type === 'quiz') ?? null;
    });
  }
  return { course, quizzes, warnings };
}

/** {"blocks":[…]} van de AI → geldige CourseBlocks (via een wegwerpcursus). */
export function sanitizeAIBlocks(json: unknown): CourseBlock[] {
  const envelope = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const blocks = Array.isArray(envelope.blocks) ? envelope.blocks : Array.isArray(json) ? json : [];
  const course = sanitizeCourse({
    title: 'x',
    chapters: [{ title: 'x', sections: [{ title: 'x', blocks }] }],
  });
  return course?.chapters[0]?.sections[0]?.blocks ?? [];
}
