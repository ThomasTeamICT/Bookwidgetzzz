import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEVER_PRECACHE, PRECACHE_PUBLIC, collectShell, knownFiles, renderServiceWorker } from './src/lib/swBuild';

/**
 * Bundelbudget — bewaken i.p.v. onderdrukken.
 *
 * `chunkSizeWarningLimit` alleen omhoog draaien maakt de waarschuwing stil, niet
 * de bundel klein. Daarom staan de grenzen hier expliciet per chunk, dicht tegen
 * de gemeten werkelijkheid aan. Groeit een chunk erdoorheen, dan valt dat op bij
 * het bouwen. Een budget verhogen mag — maar dan bewust, in deze lijst, niet per
 * ongeluk.
 *
 * Waarom deze getallen (gemeten, ongecomprimeerd):
 *  - hoofdbundel: react + react-dom + react-router + de leerlingroutes
 *    (/speel, /open, /meedoen). Dit is wat een leerling met een code MOET
 *    downloaden voor er iets op het scherm staat — het kritieke pad.
 *    September 2026: van 320 naar 330 kB voor de Lucide-iconen van de 38
 *    widgetsoorten (±28 kB; de speler toont het icoon van de soort). De
 *    leerkrachtschil en de startpagina gingen tegelijk uit de hoofdbundel.
 *    Netto: 306 → 327 kB, of 97,8 → 102,5 kB gzip.
 *  - pdf.js: wordt pas opgehaald wanneer iemand echt een pdf opent; groot,
 *    maar nooit onderdeel van het leerlingpad.
 *  - de rest: paginachunks en widgetmodules; die horen klein te blijven.
 */
const BUDGETS: { test: RegExp; label: string; maxKb: number }[] = [
  { test: /^assets\/index-[\w-]+\.js$/, label: 'hoofdbundel (kritieke leerlingpad)', maxKb: 330 },
  { test: /^assets\/pdf-[\w-]+\.js$/, label: 'pdf.js (lui geladen)', maxKb: 560 },
  { test: /mammoth/i, label: 'mammoth (.docx-import, lui geladen)', maxKb: 720 },
  { test: /jsqr/i, label: 'jsQR (QR-scanner, lui geladen)', maxKb: 140 },
];
/** Alle overige js-chunks: paginachunks en widgetmodules. */
const DEFAULT_MAX_KB = 80;

function bundleBudget(): Plugin {
  return {
    name: 'wf-bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      const overschrijdingen: string[] = [];
      for (const [naam, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk' || !naam.endsWith('.js')) continue;
        // kB zoals Vite ze rapporteert (delen door 1000), zodat de getallen
        // hierboven één op één met de buildtabel overeenkomen.
        const kb = Buffer.byteLength(output.code) / 1000;
        const budget = BUDGETS.find((b) => b.test.test(naam));
        const max = budget?.maxKb ?? DEFAULT_MAX_KB;
        if (kb > max) {
          overschrijdingen.push(
            `  ${naam} — ${kb.toFixed(1)} kB > budget ${max} kB${budget ? ` (${budget.label})` : ''}`
          );
        }
      }
      if (overschrijdingen.length > 0) {
        this.warn(
          `\nBundelbudget overschreden:\n${overschrijdingen.join('\n')}\n` +
            'Snoei de chunk, of verhoog het budget bewust in vite.config.ts (BUDGETS).\n'
        );
      }
    },
  };
}

/**
 * Offline-schil: schrijft bij elke build dist/sw.js uit.
 *
 * Het sjabloon staat in src/offline/serviceWorker.js (strategie en uitleg
 * daar). Deze plugin vult het aan met wat pas na het bundelen vastligt:
 *  - de voorcache: index.html, de hoofdbundel (js + css), het manifest en het
 *    icoon. Lazy chunks (pagina's, widgets, pdf.js, mammoth, jsQR) en de
 *    voorbeeldcursus komen er niet in; die bewaart de service worker pas
 *    wanneer ze voor het eerst gebruikt worden;
 *  - de lijst van alle bestanden van deze build, om bij een update op te ruimen;
 *  - een versie: een hash over het sjabloon, de bestandsnamen (die zelf al
 *    een inhoudshash dragen), index.html en de openbare bestanden in de
 *    voorcache. Zelfde build = zelfde sw.js, dus geen onnodige update.
 *
 * `enforce: 'post'`: dan heeft Vite index.html al in de bundel gezet. sw.js is
 * een 'asset', geen chunk: het bundelbudget telt het niet mee.
 */
function offlineShell(): Plugin {
  const template = fileURLToPath(new URL('./src/offline/serviceWorker.js', import.meta.url));
  let publicDir = '';
  return {
    name: 'boosterz-offline-shell',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    buildStart() {
      this.addWatchFile(template); // `vite build --watch`: ook bij een gewijzigd sjabloon opnieuw bouwen
    },
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') this.error('offlineShell: index.html ontbreekt in de bundel');
      if (bundle['sw.js']) this.error('offlineShell: er bestaat al een sw.js in de bundel');
      const indexHtml = typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8');

      const shell = collectShell(
        Object.values(bundle).map((o) =>
          o.type === 'chunk'
            ? { fileName: o.fileName, type: o.type, isEntry: o.isEntry, imports: o.imports, importedCss: [...(o.viteMetadata?.importedCss ?? [])] }
            : { fileName: o.fileName, type: o.type }
        ),
        indexHtml
      );
      const publicFiles = listFiles(publicDir);
      const precachePublic = PRECACHE_PUBLIC.filter((f) => publicFiles.includes(f));
      const precache = [...shell.files, ...precachePublic];
      const zwaar = precache.filter((f) => NEVER_PRECACHE.test(f));
      if (zwaar.length > 0) {
        this.warn(`offlineShell: zware bibliotheek in de voorcache (statisch geïmporteerd?): ${zwaar.join(', ')}`);
      }
      const known = knownFiles(Object.keys(bundle), publicFiles);
      const source = readFileSync(template, 'utf8');

      const hash = createHash('sha256');
      hash.update(source).update('\0').update(JSON.stringify({ entry: shell.entry, precache, known }));
      hash.update('\0').update(indexHtml);
      for (const f of precachePublic) hash.update('\0').update(readFileSync(path.join(publicDir, f)));
      const version = hash.digest('hex').slice(0, 12);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker(source, { version, entry: shell.entry, precache, known }),
      });
    },
  };
}

/** Alle bestanden onder een map, relatief en met '/' als scheiding. */
function listFiles(dir: string): string[] {
  if (!dir || !existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (sub: string) => {
    for (const d of readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) walk(rel);
      else if (d.isFile()) out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

// Relative base zodat de build ook werkt op GitHub Pages of een subpad.
export default defineConfig({
  base: './',
  plugins: [react(), bundleBudget(), offlineShell()],
  build: {
    // Vite's eigen grens stond op 1200 kB: dat onderdrukte élke waarschuwing.
    // Nu ligt ze net boven de pdf.js-chunk (de enige legitiem grote chunk), en
    // bewaakt het budget hierboven de rest — inclusief het leerlingpad.
    chunkSizeWarningLimit: 560,
  },
});
