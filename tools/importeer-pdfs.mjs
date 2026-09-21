// Stap 1 van tools/build-voorbeeldcursus.py: de pdf's door de échte
// importpagina halen (zoals een leerkracht dat doet) en de cursus dumpen.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 &
//   PW_CHROMIUM=/pad/naar/chromium node tools/importeer-pdfs.mjs <map-met-pdfs> <uit.json> ["Titel"]
//
// Bestanden "Hoofdstuk_<n><a|b>_…pdf" worden op hoofdstuknummer gesorteerd;
// sectieniveau 3 (genummerde ###-titels worden secties).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [dir, outFile, title = 'Natuurwetenschappen 1e graad'] = process.argv.slice(2);
if (!dir || !outFile) { console.error('gebruik: node tools/importeer-pdfs.mjs <map> <uit.json> [titel]'); process.exit(1); }
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const key = (f) => { const m = /Hoofdstuk_(\d+)([ab]?)/.exec(f); return m ? [Number(m[1]), m[2] || ''] : [999, '']; };
const files = fs.readdirSync(dir).filter((f) => /Hoofdstuk/.test(f) && f.endsWith('.pdf'))
  .sort((a, b) => { const [na, sa] = key(a), [nb, sb] = key(b); return na - nb || sa.localeCompare(sb); })
  .map((f) => path.join(dir, f));
console.log('bestanden:', files.length);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(BASE + '/#/importeren', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const t0 = Date.now();
await page.locator('input[type=file]').first().setInputFiles(files);
await page.waitForFunction((n) => document.querySelectorAll('textarea.textarea').length >= n + 1, files.length, { timeout: 180000 }).catch(() => {});
await page.waitForTimeout(1500);
console.log('inlezen:', Math.round((Date.now() - t0) / 1000), 's');
await page.getByLabel(/Wat wordt een sectie/).selectOption('3');
await page.getByLabel('Titel van de samengevoegde cursus').fill(title);
await page.getByRole('button', { name: /Samenvoegen tot één cursus/ }).click();
await page.waitForFunction(() => /#\/cursus\/bewerk\//.test(location.hash), null, { timeout: 60000 });
await page.waitForTimeout(800);
const course = await page.evaluate((t) => JSON.parse(localStorage.getItem('wf.courses.v1')).find((c) => c.title === t), title);
fs.writeFileSync(outFile, JSON.stringify(course));
console.log('hoofdstukken:', course.chapters.length);
for (const ch of course.chapters) {
  const counts = {};
  for (const s of ch.sections) for (const bl of s.blocks) counts[bl.type] = (counts[bl.type] || 0) + 1;
  console.log(`- ${ch.title.slice(0, 48).padEnd(48)} secties=${String(ch.sections.length).padStart(2)} ${JSON.stringify(counts)}`);
}
console.log('fouten:', errors.length ? errors : 'geen');
await browser.close();
