// Volledige rooktest voor WidgetFabriek: draait tegen een preview-build.
//
//   npm run build && npx vite preview --port 4173 &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
//
// Vers browserprofiel per run (seed vult voorbeeldinhoud automatisch).
// Faalt hard (exit 1) bij een mislukte check of bij console-/paginafouten.

import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
let failures = 0;

function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const go = async (hash) => { await page.goto(BASE + hash, { waitUntil: 'networkidle' }); await sleep(500); };

// ── 1. Landing ──────────────────────────────────────────────────────────────
console.log('1. Landing');
await go('/#/');
check('hero zichtbaar', await page.locator('.hero h1').isVisible());
check('38 widgettypes op landing', (await page.locator('.type-card').count()) === 38);

// ── 2. Dashboard ────────────────────────────────────────────────────────────
console.log('2. Dashboard');
await go('/#/widgets');
const cardCount = await page.locator('.widget-card').count();
check(`seed-widgets aanwezig (${cardCount})`, cardCount >= 8);
await page.fill('input[type=search]', 'quiz');
await sleep(250);
check('zoeken filtert', (await page.locator('.widget-card').count()) < cardCount);
await page.fill('input[type=search]', '');

// ── 3. Quiz-editor (lazy geladen) ───────────────────────────────────────────
console.log('3. Quiz-editor');
await page.locator('.widget-card', { hasText: 'quiz over België' }).first().click();
await sleep(800);
check('editor geopend', await page.locator('.editor-layout').isVisible());
check('vragen geladen', (await page.locator('.editor-item').count()) >= 8);
check('vraagbank-knop', await page.getByRole('button', { name: /Uit vraagbank/ }).isVisible());
check('bulk-importknop', await page.getByRole('button', { name: /Tekst plakken/ }).isVisible());
await page.getByRole('tab', { name: /Instellingen/ }).click();
check('instellingenpaneel', await page.locator('text=Tijdslimiet').first().isVisible());
check('toetsmodus-instelling', await page.locator('text=Toetsmodus').first().isVisible());
await page.getByRole('tab', { name: /Inhoud/ }).click();

// ── 4. Voorbeeldmodus ───────────────────────────────────────────────────────
console.log('4. Voorbeeldmodus');
await page.getByRole('button', { name: /Uitproberen/ }).click();
await sleep(700);
check('voorbeeldmodus actief', await page.locator('.player-shell').isVisible());
check('vraag zichtbaar', await page.locator('.question-card').first().isVisible());
await page.locator('.answer-option').first().click();
check('antwoord geselecteerd', (await page.locator('.answer-option.selected').count()) === 1);
await page.getByRole('button', { name: /Terug naar bewerken/ }).click();

// ── 5. Leerlingflow via code ────────────────────────────────────────────────
console.log('5. Leerlingflow');
const quiz = await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const w = ws.find((x) => x.title.includes('België'));
  return { id: w.id, code: w.code };
});
await go(`/#/speel/${quiz.code}`);
check('naamscherm', await page.locator('#student-name').isVisible());
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(600);
check('quiz gestart', await page.locator('.question-card').isVisible());
for (let i = 0; i < 12; i++) {
  const opt = page.locator('.answer-option').first();
  if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {});
  const inp = page.locator('.question-card input.input, .question-card textarea.textarea').first();
  if (await inp.isVisible().catch(() => false)) await inp.fill('5').catch(() => {});
  const submit = page.getByRole('button', { name: /Indienen/ });
  if (await submit.isVisible().catch(() => false)) { await submit.click(); break; }
  const next = page.getByRole('button', { name: /Volgende/ });
  if (await next.isVisible().catch(() => false)) await next.click();
  await sleep(150);
}
await sleep(600);
check('resultaatscherm', await page.locator('.result-hero').isVisible());

// ── 6. Resultaten bij de leerkracht ─────────────────────────────────────────
console.log('6. Resultaten');
await go('/#/resultaten');
check('resultatenrij', (await page.locator('table.data tbody tr').count()) >= 1);
await page.locator('table.data tbody tr').first().click();
await sleep(700);
check('detailpagina', await page.locator('.table-wrap').isVisible());
check('resultaatcode-knop', await page.getByRole('button', { name: /Resultaatcode plakken/ }).isVisible());
check('anonieme CSV-knop', await page.getByRole('button', { name: /CSV zonder namen/ }).isVisible());
await page.locator('table.data tbody tr').first().click();
await sleep(400);
check('inzendingsmodal', await page.locator('.modal').isVisible());
await page.keyboard.press('Escape');

// ── 7. Andere widgettypes (lazy chunks) ─────────────────────────────────────
console.log('7. Widgettypes');
const codes = await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const by = (t) => ws.find((w) => w.type === t)?.code;
  return { crossword: by('crossword'), wordsearch: by('wordsearch'), memory: by('memory'), spinner: by('spinner') };
});
await go(`/#/speel/${codes.crossword}`);
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(700);
check('kruiswoordrooster', (await page.locator('.cross-cell input').count()) > 20);
check('clues zichtbaar', await page.locator('text=Horizontaal').isVisible());
await go(`/#/speel/${codes.wordsearch}`);
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(700);
check('woordzoekerrooster', (await page.locator('.ws-cell').count()) === 100);
await go(`/#/speel/${codes.memory}`);
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(600);
check('memorykaarten', (await page.locator('.memory-card').count()) === 12);
await go(`/#/speel/${codes.spinner}`);
await sleep(400);
check('rad zichtbaar', await page.locator('svg[role=img]').isVisible());

// ── 8. Delen (QR, Classroom, embed) ─────────────────────────────────────────
console.log('8. Delen');
await go('/#/widgets');
await page.locator('.widget-card').first().locator('button[aria-label^="Acties"]').click();
await page.getByRole('menuitem', { name: /Delen/ }).click();
await sleep(700);
check('QR-code', await page.locator('img[alt^="QR-code"]').isVisible());
check('Classroom-knop', await page.locator('a', { hasText: 'Google Classroom' }).isVisible());
await page.keyboard.press('Escape');

// ── 9. Print, privacy, hulp, voortgang ──────────────────────────────────────
console.log('9. Vaste pagina\'s');
await go(`/#/print/${quiz.id}`);
check('printweergave', await page.locator('text=Correctiesleutel tonen').isVisible());
await go('/#/privacy');
check('privacypagina', await page.locator('text=Waar staan de gegevens?').isVisible());
await go('/#/hulp');
check('hulppagina', await page.locator('text=Aan de slag').first().isVisible());
check('FAQ aanwezig', (await page.locator('details').count()) >= 6);
await go('/#/voortgang');
check('voortgangspagina rendert', (await page.locator('h1').count()) >= 1);

// ── 10. AI-pagina's (zonder sleutel: nette poort) ───────────────────────────
console.log('10. AI-pagina\'s');
await go('/#/ai-studio');
check('AI-studio met sleutelpoort', await page.locator('text=/sleutel/i').first().isVisible());
await go('/#/ai-instellingen');
check('AI-instellingen rendert', await page.locator('text=/sleutel|aanbieder/i').first().isVisible());

// ── 11. Cursussen: dashboard + deelmodal met LMS-embed ──────────────────────
console.log('11. Cursusdashboard');
await go('/#/cursussen');
const demo = await page.evaluate(() => {
  const cs = JSON.parse(localStorage.getItem('wf.courses.v1'));
  return { id: cs[0].id, code: cs[0].code };
});
check('cursuskaart aanwezig', await page.getByRole('button', { name: /Delen/ }).first().isVisible());
await page.getByRole('button', { name: /Delen/ }).first().click();
await sleep(600);
check('embed-code voor LMS', (await page.locator('.modal textarea').first().inputValue()).includes('<iframe'));
await page.keyboard.press('Escape');

// ── 12. Cursuseditor: structuur, palet, doelendekking, AI-knop ──────────────
console.log('12. Cursuseditor');
await go(`/#/cursus/bewerk/${demo.id}`);
check('structuurpaneel', await page.locator('text=Hoofdstuk').first().isVisible());
check('blok toevoegen-knop', await page.getByRole('button', { name: /Blok toevoegen/ }).first().isVisible());
check('AI-herwerkknop', await page.locator('button', { hasText: /Herwerk met AI|✨/ }).first().isVisible());
await page.getByRole('button', { name: /Doelendekking/ }).click();
await sleep(400);
check('doelendekking-modal', await page.locator('.modal', { hasText: /doel/i }).isVisible());
await page.keyboard.press('Escape');

// ── 13. Cursusviewer: lezen, notities (persistentie!), zoeken ───────────────
console.log('13. Cursusviewer');
await go(`/#/cursus/lees/${demo.code}`);
if (await page.locator('#course-student-name').isVisible().catch(() => false)) {
  await page.fill('#course-student-name', 'Testlezer');
  await page.getByRole('button', { name: /Start|Aan de slag/ }).first().click();
  await sleep(600);
}
check('cursusinhoud rendert', (await page.locator('.course-block').count()) >= 1
  || await page.locator('text=/verdamping|waterdamp/i').first().isVisible());
const noteBox = page.locator('textarea[placeholder*="onthouden"]').first();
check('notitieveld zichtbaar', await noteBox.isVisible());
await noteBox.fill('Verdamping = water wordt damp door warmte.');
await sleep(900);
await page.reload({ waitUntil: 'networkidle' });
await sleep(700);
check('notitie blijft bewaard na herladen',
  (await page.locator('textarea[placeholder*="onthouden"]').first().inputValue()).includes('Verdamping'));
const zoek = page.locator('input[aria-label="Zoeken in de cursus"]');
check('zoekveld aanwezig', await zoek.isVisible());
await zoek.fill('waterdamp');
await sleep(350);
check('zoeken filtert', await page.locator('text=/resulta(at|ten)/i').first().isVisible());
await zoek.fill('');
check('markeer-als-gelezen-knop', await page.getByRole('button', { name: /Markeer als gelezen/ }).first().isVisible());
await page.getByRole('button', { name: /Markeer als gelezen/ }).first().click();
await sleep(400);

// ── 14. Cursus volgen + printen ─────────────────────────────────────────────
console.log('14. Cursus volgen/printen');
await go(`/#/cursus/volg/${demo.id}`);
check('volgpagina rendert', await page.locator('text=/voortgang|leerling/i').first().isVisible());
await go(`/#/cursus/print/${demo.id}`);
check('printbare cursus', await page.locator('text=/Afdrukken|Inhoud/').first().isVisible());

// ── 15. Meedoen-pagina: 6-tekengrens + widget- én cursuscodes ───────────────
console.log('15. Meedoen');
await go('/#/meedoen');
await page.fill('input[aria-label="Klascode van 6 tekens"]', 'ABCD');
check('Start uit bij halve code', await page.getByRole('button', { name: /Start/ }).isDisabled());
await page.fill('input[aria-label="Klascode van 6 tekens"]', quiz.code);
await page.getByRole('button', { name: /Start/ }).click();
await sleep(500);
check('widgetcode werkt', page.url().includes('/speel/'));
await go('/#/meedoen');
await page.fill('input[aria-label="Klascode van 6 tekens"]', demo.code);
await page.getByRole('button', { name: /Start/ }).click();
await sleep(500);
check('cursuscode werkt', page.url().includes('/cursus/lees/'));

// ── 16. Foutpaden: nette meldingen, geen wit scherm ─────────────────────────
console.log('16. Foutpaden');
await go('/#/speel/XXXXXX');
check('onbekende widgetcode → melding', await page.locator('text=/niet gevonden|geen widget/i').first().isVisible());
await go('/#/cursus/lees/XXXXXX');
check('onbekende cursuscode → melding', await page.locator('text=/niet gevonden/i').first().isVisible());
await go('/#/open?d=rommel');
check('kapotte widgetlink → melding', await page.locator('text=/werkt niet|ongeldig|beschadigd/i').first().isVisible());
await go('/#/cursus/open?d=rommel');
check('kapotte cursuslink → melding', await page.locator('text=/werkt niet|ongeldig|beschadigd/i').first().isVisible());
await go('/#/dit-bestaat-niet');
check('onbekende route → meedoen-pagina', await page.locator('input[aria-label="Klascode van 6 tekens"]').isVisible());

// ── 17. Pdf-laag: opslag, viewer, markeerstiften, cursusblok ────────────────
console.log('17. Pdf-laag');
// Mini-pdf met correcte xref programmatisch opbouwen (pdf.js-vriendelijk).
function buildTinyPdf() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const streamBody = 'BT /F1 24 Tf 72 770 Td (Markeer mij: de hoofdtitel) Tj ET';
  objs.push(`<</Length ${streamBody.length}>>stream\n${streamBody}\nendstream`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return out;
}
await go('/#/widgets');
await page.evaluate(async (pdfText) => {
  // 1. mini-pdf in IndexedDB (zelfde schema als lib/pdfStore.ts)
  const blob = new Blob([pdfText], { type: 'application/pdf' });
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('wf-files', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('pdfs')) req.result.createObjectStore('pdfs', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const t = req.result.transaction('pdfs', 'readwrite');
      t.objectStore('pdfs').put({ id: 'smoketestpdf', name: 'smoke.pdf', blob, size: blob.size, createdAt: 1 });
      t.oncomplete = () => resolve(null);
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
  // 2. gesplitst werkblad omschakelen naar pdf-bron met markeerlegende
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const sw = ws.find((w) => w.type === 'splitworksheet');
  sw.config.source = {
    kind: 'pdf', title: 'Smoketest-pdf', pdfId: 'smoketestpdf', pdfName: 'smoke.pdf',
    highlightPalette: [
      { color: '#ffd54a', label: 'hoofdtitel' }, { color: '#7cc4ff', label: 'auteur' },
      { color: '#8ce99a', label: 'jaartal' }, { color: '#ffb26b', label: 'e-mail' },
      { color: '#f7a8d8', label: 'extra' },
    ],
  };
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  // 3. pdf-blok in de demo-cursus
  const cs = JSON.parse(localStorage.getItem('wf.courses.v1'));
  cs[0].chapters[0].sections[0].blocks.push({ id: 'smokepdfblock', type: 'pdf', pdfId: 'smoketestpdf', name: 'smoke.pdf', height: 420 });
  localStorage.setItem('wf.courses.v1', JSON.stringify(cs));
}, buildTinyPdf());
const swCode = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => w.type === 'splitworksheet').code);
await go(`/#/speel/${swCode}`);
if (await page.locator('#student-name').isVisible().catch(() => false)) {
  await page.fill('#student-name', 'Testleerling');
  await page.getByRole('button', { name: /Starten/ }).click();
}
await page.waitForSelector('.pdfv-page canvas', { timeout: 15000 }).catch(() => {});
check('pdf rendert in gesplitst werkblad', (await page.locator('.pdfv-page canvas').count()) >= 1);
await sleep(400);
check('tekstlaag aanwezig (markeerbaar)', (await page.locator('.pdfv-text span').count()) >= 1);
check('markeerstiften zichtbaar', (await page.locator('.pdfv-swatch').count()) === 5);
check('vragenkant blijft werken', (await page.locator('.question-card').count()) >= 1);
await go(`/#/cursus/lees/${demo.code}`);
// naar de eerste sectie (daar staat het pdf-blok); de viewer kan elders hervatten
await page.locator('nav[aria-label="Inhoudstafel"] button').first().click().catch(() => {});
await page.waitForSelector('.pdfv-page canvas', { timeout: 15000 }).catch(() => {});
check('pdf-blok rendert in cursus', (await page.locator('.pdfv-page canvas').count()) >= 1);

// ── Slot ────────────────────────────────────────────────────────────────────
console.log('\n──────────');
if (errors.length) {
  console.log('Console-/paginafouten:');
  for (const e of [...new Set(errors)]) console.log('  •', e.slice(0, 300));
  failures += errors.length;
} else {
  console.log('Geen console- of paginafouten. ✓');
}
console.log(failures === 0 ? 'ALLE CHECKS GESLAAGD ✓' : `${failures} CHECKS GEFAALD ✗`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
