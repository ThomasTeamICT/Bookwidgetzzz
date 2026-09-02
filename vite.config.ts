import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
 *  - pdf.js: wordt pas opgehaald wanneer iemand echt een pdf opent; groot,
 *    maar nooit onderdeel van het leerlingpad.
 *  - de rest: paginachunks en widgetmodules; die horen klein te blijven.
 */
const BUDGETS: { test: RegExp; label: string; maxKb: number }[] = [
  { test: /^assets\/index-[\w-]+\.js$/, label: 'hoofdbundel (kritieke leerlingpad)', maxKb: 320 },
  { test: /^assets\/pdf-[\w-]+\.js$/, label: 'pdf.js (lui geladen)', maxKb: 560 },
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

// Relative base zodat de build ook werkt op GitHub Pages of een subpad.
export default defineConfig({
  base: './',
  plugins: [react(), bundleBudget()],
  build: {
    // Vite's eigen grens stond op 1200 kB: dat onderdrukte élke waarschuwing.
    // Nu ligt ze net boven de pdf.js-chunk (de enige legitiem grote chunk), en
    // bewaakt het budget hierboven de rest — inclusief het leerlingpad.
    chunkSizeWarningLimit: 560,
  },
});
