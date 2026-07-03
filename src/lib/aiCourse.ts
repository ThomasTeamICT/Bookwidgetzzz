// ── AI-cursusbouwer: prompts + sanering ─────────────────────────────────────
//
// Drie taken: (1) een nieuwe cursus opbouwen vanuit leerplandoelen,
// (2) een bestaande cursus herwerken, (3) één sectie vullen.
// De AI mag ALLEEN tekstuele blokken maken — nooit media-URL's verzinnen.
// Bij herwerken reizen mediablokken mee als {"type":"keep","id":…} zodat ze
// ongewijzigd op hun (nieuwe) plek terugkomen.

import type { Widget } from './types';
import type { Course, CourseBlock, CourseSection } from './courseTypes';
import { allSections } from './courseTypes';
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

const COURSE_SYSTEM = `Je bent een ervaren Vlaamse leerkracht en leermiddelenauteur die digitale cursussen bouwt voor WidgetFabriek.
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

export interface NewCourseRequest {
  /** Leerplandoelen (vrije tekst, verplicht). */
  goals: string;
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
  if (req.subject?.trim()) parts.push(`Vak/onderwerp: ${req.subject.trim()}`);
  if (req.audience?.trim()) parts.push(`Doelgroep: ${req.audience.trim()}`);
  if (req.chapterCount && req.chapterCount > 0) parts.push(`Richtaantal hoofdstukken: ${req.chapterCount}.`);
  if (req.extraWishes?.trim()) parts.push(`Extra wensen van de leerkracht: ${req.extraWishes.trim()}`);
  parts.push(`\nDeze LEERPLANDOELEN vormen het skelet van de cursus — dek ze allemaal en verwijs ernaar in de "goals" van de secties:\n${req.goals.trim()}`);
  parts.push(`\n${BLOCK_SCHEMA}`);

  let envelope = `Geef terug: {"course":{"title":"…","subtitle":"…","coverEmoji":"één emoji","chapters":[{"title":"…","emoji":"…","sections":[{"title":"…","goals":["…"],"optional":false,"blocks":[blok,…]}]}]}}`;
  if (req.withQuizzes) {
    envelope = envelope.slice(0, -1) + `,"widgets":[{"type":"quiz","title":"…","config":{…}}]}
Maak per hoofdstuk één oefenquiz van 4 à 6 vragen over dat hoofdstuk, in dezelfde volgorde als de hoofdstukken.
${quizSchemaText()}`;
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

export function buildReworkPrompt({ course, wishes }: { course: Course; wishes: string }): { system: string; prompt: string } {
  const prompt = `Herwerk de onderstaande bestaande cursus.

Wat de leerkracht anders wil: ${wishes.trim() || 'verbeter de structuur en de didactische kwaliteit.'}

BELANGRIJKE regels:
- Behoud het "id" van secties waarvan de inhoud in essentie dezelfde blijft (zo blijft de leesvoortgang van leerlingen geldig). Nieuwe of sterk veranderde secties krijgen géén id.
- Blokken van het type {"type":"keep","id":"…"} zijn mediablokken (afbeeldingen, video's, oefeningen) die je NIET mag wijzigen of weglaten: zet exact datzelfde keep-blok op de best passende plek terug.
- Geef de VOLLEDIGE herwerkte cursus terug, niet alleen de wijzigingen.

${BLOCK_SCHEMA}

Geef terug: {"course":{"title":"…","subtitle":"…","coverEmoji":"…","chapters":[{"title":"…","emoji":"…","sections":[{"id":"(alleen bij behouden secties)","title":"…","goals":["…"],"optional":false,"blocks":[blok,…]}]}]}}

=== HUIDIGE CURSUS (compact) ===
${compactCourse(course)}`;
  return { system: COURSE_SYSTEM, prompt };
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

export function sanitizeAICourse(json: unknown, opts: { base?: Course } = {}): AICourseResult {
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
      const gen = sanitizeGeneratedWidgets({ widgets: [w] });
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
