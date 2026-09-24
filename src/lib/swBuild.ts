// ── Service worker bouwen: pure hulpfuncties voor vite.config.ts ────────────
//
// De Vite-plugin `offlineShell` (vite.config.ts) leest de bundel, laat deze
// functies de voorcache en de lijst met bekende bestanden bepalen, en schrijft
// daarmee dist/sw.js uit op basis van het sjabloon src/offline/serviceWorker.js.
//
// Geen Node- of browser-API's hier: de hash berekent vite.config.ts zelf.
// Getest in src/lib/swBuild.test.ts, samen met het sjabloon.

/** Het deel van een Rollup-uitvoerbestand dat we nodig hebben. */
export interface BundleFile {
  fileName: string;
  type: 'chunk' | 'asset';
  isEntry?: boolean;
  /** statische imports (alleen chunks) */
  imports?: readonly string[];
  /** css die Vite aan deze chunk koppelt (alleen chunks) */
  importedCss?: readonly string[];
}

export interface ServiceWorkerConfig {
  version: string;
  entry: string;
  precache: string[];
  known: string[];
}

/** Openbare bestanden die mee in de voorcache gaan, als ze bestaan. */
export const PRECACHE_PUBLIC = ['manifest.webmanifest', 'icon.svg'];

/**
 * Wat nooit in de voorcache hoort: zwaar en alleen nodig voor wie een pdf,
 * een .docx of een QR-code opent. Die bewaart de service worker pas bij het
 * eerste gebruik.
 */
export const NEVER_PRECACHE = /(?:^|\/)(?:pdf|mammoth\w*|jsqr)[-.]/i;

/** De bundels waarnaar een index.html verwijst (zelfde regel als in de service worker). */
export function assetRefs(html: string): string[] {
  const refs = new Set<string>();
  const re = /\s(?:src|href)=["'](?:\.\/)?(assets\/[^"'?#]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) refs.add(m[1]);
  return [...refs];
}

/**
 * De app-schil: de hoofdbundel, haar statische imports en hun css, plus alles
 * waarnaar index.html verwijst. Faalt luid (throw) wanneer de bundel er anders
 * uitziet dan verwacht: liever een mislukte build dan een service worker die
 * een kapotte schil bewaart.
 */
export function collectShell(files: readonly BundleFile[], indexHtml: string): { entry: string; files: string[] } {
  const byName = new Map(files.map((f) => [f.fileName, f]));
  const entries = files.filter((f) => f.type === 'chunk' && f.isEntry && f.fileName.endsWith('.js'));
  if (entries.length !== 1) {
    throw new Error(`offlineShell: verwachtte precies één hoofdbundel, vond er ${entries.length}`);
  }
  const entry = entries[0].fileName;
  if (!entry.startsWith('assets/')) {
    throw new Error(`offlineShell: de hoofdbundel staat niet in assets/ (${entry})`);
  }

  const shell = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const name = todo.pop()!;
    if (shell.has(name)) continue;
    shell.add(name);
    const chunk = byName.get(name);
    for (const css of chunk?.importedCss ?? []) shell.add(css);
    for (const dep of chunk?.imports ?? []) todo.push(dep);
  }

  const refs = assetRefs(indexHtml);
  if (!refs.includes(entry)) {
    throw new Error(`offlineShell: index.html verwijst niet naar de hoofdbundel ${entry}`);
  }
  for (const ref of refs) {
    if (!byName.has(ref)) throw new Error(`offlineShell: index.html verwijst naar ${ref}, dat niet in de build zit`);
    shell.add(ref);
  }
  return { entry, files: [...shell].sort() };
}

/**
 * Alle bestanden die bij deze build horen, relatief t.o.v. de map van de app:
 * de uitvoer van Rollup (zonder index.html en sw.js) en de openbare bestanden.
 */
export function knownFiles(bundleNames: readonly string[], publicFiles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const n of [...bundleNames, ...publicFiles]) {
    const name = n.replace(/\\/g, '/');
    if (name === 'index.html' || name === 'sw.js') continue;
    out.add(name);
  }
  return [...out].sort();
}

/** Zet de configuratie voor het sjabloon. De eerste regels zijn leesbaar voor wie dist/sw.js opent. */
export function renderServiceWorker(template: string, config: ServiceWorkerConfig): string {
  if (!/^[\w-]{6,}$/.test(config.version)) throw new Error('offlineShell: ongeldige versie');
  if (!config.precache.includes(config.entry)) throw new Error('offlineShell: de hoofdbundel ontbreekt in de voorcache');
  if (!template.includes('BOOSTERZ.version')) throw new Error('offlineShell: dit is niet het service-worker-sjabloon');
  const header =
    '// Boosterz: service worker. Gegenereerd bij de build door vite.config.ts\n' +
    '// (plugin offlineShell) uit src/offline/serviceWorker.js. Niet met de hand aanpassen.\n' +
    `// Versie ${config.version}\n`;
  return `${header}const BOOSTERZ = ${JSON.stringify(config)};\n\n${template}`;
}
