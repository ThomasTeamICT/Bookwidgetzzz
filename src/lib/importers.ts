// ── Bestaand materiaal binnenhalen ──────────────────────────────────────────
//
// Eén ingang voor alles wat een leerkracht al heeft liggen: een Word-document,
// een pdf, een stuk markdown of tekst, een opgeslagen webpagina, of een eerder
// geëxporteerd Boosterz-bestand (widget, vakgroeppakket of cursus).
//
// `extractFromFile` geeft altijd hetzelfde soort antwoord terug: wát het is
// (kind), waar het vandaan komt en — bij tekst — de leesbare tekst. Wat er
// daarna mee gebeurt, kiest de leerkracht op de importpagina: AI-cursus,
// AI-oefeningen, of een cursus zonder AI via `markdownToCourse`.
//
// Alles gebeurt op het toestel zelf. Pas als de leerkracht uitdrukkelijk voor
// een AI-stap kiest, vertrekt er tekst naar de gekozen AI-aanbieder.

import type { Widget } from './types';
import type { Course, CourseBlock, CourseChapter, CourseSection } from './courseTypes';
import type { FolderPack } from './share';
import { adoptSharedCourse, createCourse, importCourseJson, makeBlock } from './courses';
import { importFolderPack, importWidgetJson } from './share';
import { extractPdfText } from './pdfText';
import { htmlToMarkdown } from './htmlToMarkdown';
import { saveFolder, saveWidget } from './storage';
import { makeCode, uid } from './utils';
import { WIDGET_TYPES } from '../widgets/registry';

/** Boven dit aantal tekens waarschuwen we: de AI werkt beter met één hoofdstuk per keer. */
export const MAX_COMFORT_CHARS = 60000;

/** Grens per bestand; daarboven loopt het geheugen van een schoollaptop vol. */
export const MAX_FILE_MB = 25;

/** Wat de bestandskiezer mag aanbieden (accept-attribuut). */
export const IMPORT_ACCEPT = '.docx,.pdf,.md,.markdown,.txt,.html,.htm,.json';

/** Nette, Nederlandstalige fout die rechtstreeks aan de leerkracht getoond mag worden. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export type ExtractKind = 'text' | 'widget' | 'pack' | 'course';

export interface ExtractedSource {
  /** Wat er in het bestand zat. */
  kind: ExtractKind;
  /** Bestandsnaam of "plakbord" — waar het vandaan komt. */
  origin: string;
  /** Korte omschrijving van het formaat, bv. "Word-document (.docx)". */
  sourceLabel: string;
  /** Voorgestelde titel (uit het bestand of de bestandsnaam). */
  title: string;
  /** De geëxtraheerde tekst; leeg bij widget-, pakket- en cursusbestanden. */
  text: string;
  /** Aantal pagina's (alleen bij pdf). */
  pages?: number;
  widget?: Widget;
  pack?: FolderPack;
  course?: { course: Course; widgets: Widget[] };
  /** Zaken om de leerkracht op te wijzen (gescande pdf, erg lange tekst …). */
  warnings: string[];
}

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/** "hoofdstuk-3.docx" → "hoofdstuk 3" */
export function baseName(fileName: string): string {
  const stripped = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stripped || fileName || 'Bronmateriaal';
}

function extensionOf(fileName: string): string {
  const m = /\.([a-z0-9]+)\s*$/i.exec(fileName.trim());
  return m ? m[1].toLowerCase() : '';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Tekstbron opbouwen, inclusief de waarschuwingen die erbij horen. */
function textSource(text: string, title: string, origin: string, sourceLabel: string): ExtractedSource {
  const clean = (text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const warnings: string[] = [];
  if (!clean) {
    warnings.push('Er kwam geen tekst uit dit bestand.');
  } else if (clean.length > MAX_COMFORT_CHARS) {
    warnings.push(
      `Erg lang (${clean.length.toLocaleString('nl-BE')} tekens). Knip het in stukken van ongeveer één ` +
        'hoofdstuk: de AI werkt dan nauwkeuriger, en je verbruikt minder.'
    );
  }
  return { kind: 'text', origin, sourceLabel, title, text: clean, warnings };
}

// ── .docx (mammoth, lui geladen) ────────────────────────────────────────────

/**
 * Leest een .docx en geeft markdown terug (koppen, lijsten, tabellen,
 * vet/cursief). mammoth zit in een eigen brok die pas hier geladen wordt —
 * zie lib/mammothDocx.ts.
 */
export async function docxToMarkdown(file: Blob): Promise<string> {
  let docxToHtml: (f: Blob) => Promise<string>;
  try {
    ({ docxToHtml } = await import('./mammothDocx'));
  } catch {
    throw new ImportError(
      'De .docx-lezer kon niet geladen worden. Ben je offline? Herlaad de pagina en probeer opnieuw.'
    );
  }
  let html = '';
  try {
    html = await docxToHtml(file);
  } catch {
    throw new ImportError(
      'Dit .docx-bestand kon niet gelezen worden. Is het beschadigd, of is het eigenlijk een ander formaat ' +
        '(bv. een hernoemde .doc of .odt)?'
    );
  }
  return htmlToMarkdown(html);
}

// ── JSON: widget, vakgroeppakket of cursus ──────────────────────────────────

function knownType(type: string): boolean {
  return WIDGET_TYPES.some((t) => t.id === type);
}

function fromJson(raw: string, origin: string, fallbackTitle: string): ExtractedSource {
  try {
    JSON.parse(raw);
  } catch {
    throw new ImportError(`“${origin}” is geen geldig JSON-bestand.`);
  }

  // Volgorde is belangrijk: een pakket en een cursus zijn óók objecten met
  // widgets erin, dus de meest specifieke herkenning gaat voor.
  const pack = importFolderPack(raw);
  if (pack) {
    if (pack.widgets.length === 0) {
      throw new ImportError(`Het pakket “${origin}” bevat geen bruikbare widgets.`);
    }
    return {
      kind: 'pack',
      origin,
      sourceLabel: `vakgroeppakket · ${plural(pack.widgets.length, 'widget', 'widgets')}`,
      title: pack.meta.naam || fallbackTitle,
      text: '',
      pack,
      warnings: [],
    };
  }

  const bundle = importCourseJson(raw);
  if (bundle) {
    const sections = bundle.course.chapters.reduce((n, ch) => n + ch.sections.length, 0);
    return {
      kind: 'course',
      origin,
      sourceLabel:
        `cursus · ${plural(bundle.course.chapters.length, 'hoofdstuk', 'hoofdstukken')}, ` +
        `${plural(sections, 'sectie', 'secties')}` +
        (bundle.widgets.length ? ` · ${plural(bundle.widgets.length, 'widget', 'widgets')}` : ''),
      title: bundle.course.title || fallbackTitle,
      text: '',
      course: bundle,
      warnings: [],
    };
  }

  const widget = importWidgetJson(raw);
  if (widget) {
    if (!knownType(widget.type)) {
      throw new ImportError(`Onbekend widgettype “${widget.type}” — dit bestand kan niet geïmporteerd worden.`);
    }
    return {
      kind: 'widget',
      origin,
      sourceLabel: 'widgetbestand',
      title: widget.title || fallbackTitle,
      text: '',
      widget,
      warnings: [],
    };
  }

  throw new ImportError(
    `“${origin}” is geen widget-, pakket- of cursusbestand van Boosterz. Exporteer het opnieuw vanuit Boosterz.`
  );
}

// ── De hoofdingang ──────────────────────────────────────────────────────────

/**
 * Leest één bestand uit en zegt wat erin zat. Gooit een `ImportError` met een
 * uitlegbare boodschap als het bestand niet bruikbaar is.
 */
export async function extractFromFile(file: File): Promise<ExtractedSource> {
  const origin = file.name || 'bestand';
  const fallbackTitle = baseName(origin);
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new ImportError(
      `“${origin}” is groter dan ${MAX_FILE_MB} MB. Knip het document in stukken of bewaar het lichter.`
    );
  }
  const ext = extensionOf(origin);
  const mime = (file.type || '').toLowerCase();

  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return textSource(await docxToMarkdown(file), fallbackTitle, origin, 'Word-document (.docx)');
  }
  if (ext === 'doc') {
    throw new ImportError(
      'Het oude .doc-formaat kan niet gelezen worden. Open het in Word en bewaar het opnieuw als .docx.'
    );
  }
  if (ext === 'odt' || ext === 'pages' || ext === 'rtf') {
    throw new ImportError(
      `Bestanden van het type .${ext} worden niet ondersteund. Bewaar het document als .docx, .pdf of platte tekst.`
    );
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    let result: { text: string; pages: number };
    try {
      result = await extractPdfText(file);
    } catch {
      throw new ImportError(
        `“${origin}” kon niet gelezen worden. Is de pdf beschadigd of met een wachtwoord beveiligd?`
      );
    }
    const src = textSource(
      result.text,
      fallbackTitle,
      origin,
      `pdf · ${plural(result.pages, 'pagina', 'pagina’s')}`
    );
    src.pages = result.pages;
    if (!result.text.trim()) {
      src.warnings = [
        'Geen leesbare tekst gevonden. Dit is wellicht een gescande pdf: foto’s van pagina’s bevatten ' +
          'geen tekstlaag. Gebruik het originele bestand, of typ/plak de tekst hieronder zelf.',
      ];
    }
    return src;
  }
  if (ext === 'json' || mime === 'application/json') {
    return fromJson(await file.text(), origin, fallbackTitle);
  }
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') {
    return textSource(htmlToMarkdown(await file.text()), fallbackTitle, origin, 'webpagina (.html)');
  }
  if (ext === 'md' || ext === 'markdown') {
    return textSource(await file.text(), fallbackTitle, origin, 'markdown (.md)');
  }
  if (ext === 'txt' || ext === 'csv' || mime.startsWith('text/')) {
    return textSource(await file.text(), fallbackTitle, origin, 'tekstbestand');
  }
  throw new ImportError(
    `Van “${origin}” kan geen tekst gelezen worden. Werkt wel: .docx, .pdf, .md, .txt, .html en ` +
      '.json (widget, pakket of cursus uit Boosterz).'
  );
}

/**
 * Geplakte tekst als bron. Ziet het er als JSON van Boosterz uit, dan wordt het
 * ook zo behandeld; anders blijft het gewoon tekst.
 */
export function fromPastedText(text: string, title = 'Geplakte tekst'): ExtractedSource {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new ImportError('Plak eerst wat tekst in het vak.');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return fromJson(trimmed, 'plakbord', title);
    } catch {
      // Geen Boosterz-bestand: dan is het gewoon tekst die toevallig met { begint.
    }
  }
  return textSource(text, title, 'plakbord', 'geplakte tekst');
}

// ── Markdown → cursus (deterministisch, zonder AI) ──────────────────────────

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.indexOf('|', 1) > 0;
}

function isDividerLine(line: string): boolean {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isHeadingLine(line: string): boolean {
  return /^\s*#{1,6}\s+/.test(line);
}

/** Eén tabelrij opsplitsen; `\|` binnen een cel telt niet als scheiding. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s+/g, '')));
}

function tableBlockFrom(lines: string[]): CourseBlock | null {
  let rows = lines.map(splitTableRow);
  let header = false;
  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    header = true;
    rows = [rows[0], ...rows.slice(2)];
  }
  rows = rows.filter((r) => r.some((c) => c !== ''));
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const block = makeBlock('table');
  if (block.type === 'table') {
    block.header = header;
    block.rows = rows.map((r) => {
      const cells = r.slice(0, width);
      while (cells.length < width) cells.push('');
      return cells;
    });
  }
  return block;
}

/**
 * Zet markdown om naar een cursus, volledig voorspelbaar en zonder AI:
 *   `#` → hoofdstuk · `##` → sectie · `###` → tussenkop in de sectie
 *   alinea's en lijsten → tekstblokken (de markdown blijft behouden)
 *   markdown-tabellen → tabelblokken · `---` → scheidingslijn
 * Zonder koppen komt alles in één hoofdstuk met één sectie. Lege secties (en
 * lege hoofdstukken) vallen weg. De titel komt uit de eerste `#`, anders uit
 * de meegegeven naam (doorgaans de bestandsnaam).
 */
export function markdownToCourse(markdown: string, fallbackTitle = 'Nieuwe cursus'): Course {
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const chapters: CourseChapter[] = [];
  let docTitle = '';
  let chapter: CourseChapter | null = null;
  let section: CourseSection | null = null;

  function startChapter(title: string): void {
    chapter = { id: uid(), title: title.trim() || 'Hoofdstuk', emoji: '📖', sections: [] };
    chapters.push(chapter);
    section = null;
  }
  function startSection(title: string): void {
    if (!chapter) startChapter(docTitle || fallbackTitle);
    section = { id: uid(), title: title.trim() || 'Sectie', blocks: [] };
    (chapter as CourseChapter).sections.push(section);
  }
  function addBlock(block: CourseBlock): void {
    if (!section) startSection('Inleiding');
    (section as CourseSection).blocks.push(block);
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim().replace(/\s*#+\s*$/, '').trim();
      if (level === 1) {
        if (!docTitle) docTitle = text;
        startChapter(text);
      } else if (level === 2) {
        startSection(text);
      } else if (text) {
        const block = makeBlock('heading');
        if (block.type === 'heading') {
          block.text = text;
          block.level = 3;
        }
        addBlock(block);
      }
      i++;
      continue;
    }

    if (isTableLine(line)) {
      const raw: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        raw.push(lines[i]);
        i++;
      }
      const block = tableBlockFrom(raw);
      if (block) addBlock(block);
      continue;
    }

    if (isDividerLine(line)) {
      addBlock(makeBlock('divider'));
      i++;
      continue;
    }

    // Alinea of lijst: alles tot een witregel of een nieuw structuuronderdeel.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim() || isHeadingLine(l) || isTableLine(l) || isDividerLine(l)) break;
      para.push(l.replace(/\s+$/, ''));
      i++;
    }
    if (para.length > 0) {
      const block = makeBlock('text');
      if (block.type === 'text') block.markdown = para.join('\n');
      addBlock(block);
    }
  }

  // Lege secties en hoofdstukken dragen niets bij en zouden in de viewer als
  // lege pagina's opduiken.
  for (const ch of chapters) ch.sections = ch.sections.filter((s) => s.blocks.length > 0);
  const kept = chapters.filter((ch) => ch.sections.length > 0);

  const course = createCourse(docTitle || fallbackTitle);
  if (kept.length > 0) course.chapters = kept;
  return course;
}

// ── Meteen opslaan (json-bestanden) ─────────────────────────────────────────

function adopt(widget: Widget, folderId: string | null): Widget | null {
  const def = WIDGET_TYPES.find((t) => t.id === widget.type);
  if (!def) return null;
  const copy: Widget = {
    ...(JSON.parse(JSON.stringify(widget)) as Widget),
    id: uid(),
    code: makeCode(),
    folderId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // Ontbrekende configvelden aanvullen, anders crasht de editor of de speler.
  copy.config = { ...(def.defaultConfig() as object), ...(copy.config as object) };
  saveWidget(copy);
  return copy;
}

/** Eén geïmporteerde widget bewaren met een nieuwe id en deelcode. */
export function saveImportedWidget(widget: Widget): Widget {
  const saved = adopt(widget, null);
  if (!saved) throw new ImportError(`Onbekend widgettype “${widget.type}” — niet geïmporteerd.`);
  return saved;
}

/** Alle widgets uit een vakgroeppakket bewaren, standaard in een nieuwe map. */
export function saveImportedPack(
  pack: FolderPack,
  inNewFolder = true
): { widgets: Widget[]; folderId: string | null; folderName: string; skipped: number } {
  const folderName = pack.meta.naam || 'Pakket';
  let folderId: string | null = null;
  if (inNewFolder) {
    folderId = uid();
    saveFolder({ id: folderId, name: folderName, color: '#4f46e5', createdAt: Date.now() });
  }
  const widgets: Widget[] = [];
  let skipped = 0;
  for (const w of pack.widgets) {
    const saved = adopt(w, folderId);
    if (saved) widgets.push(saved);
    else skipped++;
  }
  return { widgets, folderId, folderName, skipped };
}

/** Een cursusbestand overnemen (met de widgets die erin meereisden). */
export function saveImportedCourse(bundle: { course: Course; widgets: Widget[] }): Course {
  adoptSharedCourse(bundle.course, bundle.widgets);
  return bundle.course;
}
