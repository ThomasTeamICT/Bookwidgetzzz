// ── AI-eind-tot-eindtest voor Boosterz ──────────────────────────────────────
//
// Stuurt ELKE AI-functie van de app aan via de echte UI, met een echte
// Gemini-sleutel. Bewaart alle ruwe AI-uitvoer voor een latere inhoudelijke
// nakijkronde, en controleert deterministisch wat er in localStorage belandt.
//
// Draaien (zie ook tests/ai/helpers.mjs):
//   npm run build   # alleen als src/ veranderde
//   node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   NODE_USE_ENV_PROXY=1 PW_CHROMIUM=/opt/pw-browsers/chromium \
//     AI_KEY_FILE=/pad/naar/.gemini-key AI_OUT=/pad/naar/uitvoer \
//     node tests/ai/run.mjs [flownaam …]
//
// Zonder argumenten draaien alle 6 flows in vaste volgorde (instellingen moet
// eerst, want die begint met een lege wf.ai.v1; de rest bouwt voort op wat
// eerdere flows achterlieten — bv. de editorflow werkt op de quiz uit de
// studioflow). Eén flow apart kan met een naam als argument; ontbreekt een
// vereiste van een eerdere flow, dan wordt die eerst zelf (ook) gedraaid.
//
// De sleutel wordt NOOIT gelogd of weggeschreven. AI-verkeer loopt via Node
// als HTTPS_PROXY gezet is (zie helpers.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, lastUsage, makeReport, sleep, startBrowser, usageCount } from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_OUT = process.env.AI_OUT || path.join(REPO_ROOT, 'tests/ai/uitvoer');
fs.mkdirSync(AI_OUT, { recursive: true });

const EXAMPLE_CURRICULUM_ID = 'wf-voorbeeld-nw-1egraad';
const AI_TIMEOUT = 300000; // 5 minuten per AI-aanroep, ruim volgens de opdracht

// ── Kleine hulpjes ──────────────────────────────────────────────────────────

function saveJson(name, data) {
  fs.writeFileSync(path.join(AI_OUT, `${name}.json`), JSON.stringify(data, null, 2), 'utf8');
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(AI_OUT, `${name}.png`), fullPage: true });
  } catch {
    /* een schermafbeelding is best-effort */
  }
}

async function goto(page, hash) {
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  await sleep(400);
}

/** Voert een AI-aanroep uit via de UI en meet duur + tokengebruik. */
async function runAIStep(page, aiCalls, flow, task, clickFn, { timeout = AI_TIMEOUT } = {}) {
  const before = await usageCount(page);
  const t0 = Date.now();
  await clickFn();
  await page.waitForFunction((n) => {
    try { return JSON.parse(localStorage.getItem('wf.aiusage.v1') || '[]').length > n; } catch { return false; }
  }, before, { timeout });
  const durationMs = Date.now() - t0;
  const usage = await lastUsage(page);
  aiCalls.push({
    flow, task: usage?.task ?? task, model: usage?.model ?? null,
    inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, durationMs,
  });
  return { usage, durationMs };
}

async function readLS(page, key, fallback = null) {
  return page.evaluate(({ key, fallback }) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }, { key, fallback });
}

async function writeLS(page, key, value) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value });
}

async function lastToast(page, { contains = '', timeout = 4000 } = {}) {
  try {
    const loc = contains ? page.locator('.toast', { hasText: contains }).last() : page.locator('.toast').last();
    await loc.waitFor({ timeout });
    return (await loc.textContent()) ?? '';
  } catch {
    return '';
  }
}

function wordCount(s) {
  return (s.trim().match(/\S+/g) ?? []).length;
}

/**
 * Wacht op de "toepassen"-knop van een AI-voorstel; verschijnt ze niet (fout of
 * een te lang/afgekapt AI-antwoord), dan één keer "Opnieuw proberen" klikken —
 * precies wat een leerkracht ook zou doen. Sluit de dialoog nadien altijd
 * (Escape) zodat een mislukt voorstel geen knoppen op de onderliggende pagina
 * blokkeert voor de volgende stap.
 */
async function applyOrRetryOnce(page, dialog, applyName, { aiCalls, flow, task, timeout = 20000 } = {}) {
  let applied = await dialog.getByRole('button', { name: applyName }).isVisible({ timeout }).catch(() => false);
  if (!applied) {
    const retryBtn = dialog.getByRole('button', { name: 'Opnieuw proberen' });
    if (await retryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (aiCalls) await runAIStep(page, aiCalls, flow, task, () => retryBtn.click());
      else await retryBtn.click();
      applied = await dialog.getByRole('button', { name: applyName }).isVisible({ timeout }).catch(() => false);
    }
  }
  if (applied) await dialog.getByRole('button', { name: applyName }).click();
  else await page.keyboard.press('Escape').catch(() => {});
  return applied;
}

/** Bron uit de echte voorbeeldcursus (public/voorbeelden/…): geen verzonnen tekst. */
function loadExampleCourseText() {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'public/voorbeelden/natuurwetenschappen-1e-graad.json'), 'utf8');
  const data = JSON.parse(raw);
  const chapters = data.course.chapters;
  const textOf = (chapterTitle, sectionPrefix) => {
    const ch = chapters.find((c) => c.title === chapterTitle);
    if (!ch) return '';
    const blocks = ch.sections
      .filter((s) => s.title.startsWith(sectionPrefix))
      .flatMap((s) => s.blocks)
      .filter((b) => b.type === 'text')
      .map((b) => b.markdown);
    return blocks.join('\n\n');
  };
  const spijsvertering = textOf('Hoofdstuk 5: Het spijsverteringsstelsel', '3.').slice(0, 2600);
  const massadichtheid = textOf('Hoofdstuk 13: Massa, volume en massadichtheid', '').slice(0, 3000);
  return { spijsvertering, massadichtheid };
}

// ── Vlaamse leerplantekst (zelf geschreven, aardrijkskunde 1e graad) ────────

const AARDRIJKSKUNDE_TEKST = `2.1 De leerlingen lezen een topografische kaart en duiden er de legende-elementen op aan.
2.2 De leerlingen bepalen de ligging van een plaats met behulp van lengte- en breedtegraad.
2.3 De leerlingen onderscheiden de klimaatzones op aarde en verklaren hun ontstaan aan de hand van de zoninstraling.
2.4 De leerlingen beschrijven de kenmerken van het zeeklimaat in West-Europa.
2.5 De leerlingen herkennen verschillende landschapstypes (kust, laagvlakte, hoogvlakte, gebergte) op een foto of kaart.
2.6 De leerlingen verklaren waarom de bevolking in Vlaanderen ongelijk verspreid is.
2.7 De leerlingen leggen het verschil uit tussen verstedelijking en verstedelijkingsgraad aan de hand van een voorbeeld.
2.8 De leerlingen lokaliseren de belangrijkste rivieren en gebergten van Europa op een blinde kaart.
2.9 De leerlingen lichten het belang van duurzaam omgaan met natuurlijke hulpbronnen toe met een concreet voorbeeld.
2.10 De leerlingen gebruiken eenvoudige gis-toepassingen (bv. een online kaart) om geografische informatie op te zoeken.`;

const AARDRIJKSKUNDE_TEKST_UITBREIDING = `2.1 De leerlingen lezen een topografische kaart en duiden er de legende-elementen op aan.
2.3 De leerlingen onderscheiden de klimaatzones op aarde en verklaren hun ontstaan aan de hand van de zoninstraling.
2.11 De leerlingen berekenen het tijdsverschil tussen twee plaatsen op basis van hun lengtegraad.
2.12 De leerlingen analyseren een bevolkingspiramide en formuleren een besluit over de leeftijdsopbouw.
2.13 De leerlingen vergelijken twee landen op basis van ontwikkelingsindicatoren zoals het bnp per capita.`;

// ── Widgettypes van de AI-studio (lib/aiWidgetGen.ts → AI_GEN_TYPES) ────────

const TYPE_NAME = {
  quiz: 'Quiz', worksheet: 'Werkblad', exitticket: 'Exit-ticket', splitworksheet: 'Gesplitst werkblad',
  flashcards: 'Flitskaarten', crossword: 'Kruiswoordraadsel', wordsearch: 'Woordzoeker', memory: 'Memory',
  hangman: 'Galgje', pairs: 'Koppelspel', timeline: 'Tijdlijn', scramble: 'Husselwoorden', dictation: 'Dictee',
  poll: 'Peiling', checklist: 'Checklist', webquest: 'WebQuest', mindmap: 'Mindmap', planner: 'Planner',
  bingo: 'Bingo', spinner: 'Rad van fortuin',
};
const ROUNDS = [
  ['worksheet', 'exitticket', 'splitworksheet', 'flashcards', 'crossword'],
  ['wordsearch', 'memory', 'hangman', 'pairs', 'timeline'],
  ['scramble', 'dictation', 'poll', 'checklist', 'webquest'],
  ['mindmap', 'planner', 'bingo', 'spinner', 'quiz'],
];

// ══════════════════════════════════════════════════════════════════════════
// Flow 1 — instellingen
// ══════════════════════════════════════════════════════════════════════════

async function flowInstellingen(page, report, aiCalls, ctx) {
  const flow = 'instellingen';
  const preExisting = await readLS(page, 'wf.ai.v1');
  report.check(flow, 'begint met een lege wf.ai.v1', preExisting === null, JSON.stringify(preExisting));

  await goto(page, '/#/ai-instellingen');

  await page.getByLabel('Aanbieder').selectOption({ label: 'Google (Gemini)' });
  await page.getByLabel('API-sleutel', { exact: true }).fill(ctx.apiKey);
  await page.getByLabel('Model').selectOption({ value: 'gemini-3.7-flash' });

  const modelOptions = await page.getByLabel('Model').locator('option').allTextContents();
  report.check(flow, 'modellijst bevat "Gemini Pro (nieuwste)"', modelOptions.some((t) => t.includes('Gemini Pro (nieuwste)')), modelOptions.join(' | '));
  report.check(flow, 'modellijst bevat geen "3.1 Pro"', !modelOptions.some((t) => t.includes('3.1 Pro')), modelOptions.join(' | '));

  const { usage, durationMs } = await runAIStep(page, aiCalls, flow, 'verbindingstest', () =>
    page.getByRole('button', { name: '🔌 Test de verbinding' }).click()
  );

  const ok = await page.locator('text=Verbinding werkt (model gemini-3.7-flash).').first().isVisible().catch(() => false);
  report.check(flow, 'tekst "Verbinding werkt (model gemini-3.7-flash)."', ok);
  report.check(flow, 'laatste aanroep heeft inputTokens > 0', !!usage && usage.inputTokens > 0, JSON.stringify(usage));

  saveJson(flow, { modelOptions, testOk: ok, usage, durationMs });
}

// ══════════════════════════════════════════════════════════════════════════
// Flow 2 — leerplan
// ══════════════════════════════════════════════════════════════════════════

async function flowLeerplan(page, report, aiCalls) {
  const flow = 'leerplan';
  await goto(page, '/#/leerplannen');

  const before = await readLS(page, 'wf.curricula.v1', []);
  const beforeIds = new Set(before.map((c) => c.id));

  await page.getByRole('button', { name: '✨ Uit tekst of pdf' }).first().click();
  const dialog = page.getByRole('dialog', { name: '✨ Leerplan uit tekst of pdf' });
  await dialog.getByLabel('Leerplantekst').fill(AARDRIJKSKUNDE_TEKST);
  await dialog.getByLabel('Titel van de doelenlijst').fill('AI-test: aardrijkskunde 1e graad');
  await dialog.getByLabel('Vak').fill('Aardrijkskunde');
  await dialog.getByLabel('Niveau').fill('1e graad A-stroom');

  await runAIStep(page, aiCalls, flow, 'leerplan structureren', () =>
    dialog.getByRole('button', { name: '✨ Doelen ophalen' }).click()
  );
  await dialog.locator('text=/\\d+ doel\\(en\\) gevonden/').waitFor({ timeout: 15000 });
  const foundText = await dialog.locator('text=/\\d+ doel\\(en\\) gevonden/').first().textContent();
  const foundCount = parseInt((foundText ?? '').match(/(\d+) doel/)?.[1] ?? '0', 10);
  const inputCount = AARDRIJKSKUNDE_TEKST.trim().split('\n').length;
  report.check(flow, `doelenaantal ongeveer gelijk aan invoer (${foundCount} vs ${inputCount})`, Math.abs(foundCount - inputCount) <= 2, `gevonden=${foundCount} ingevoerd=${inputCount}`);

  await dialog.getByRole('button', { name: '✔ Leerplan aanmaken' }).click();
  await sleep(500);

  const after1 = await readLS(page, 'wf.curricula.v1', []);
  const created = after1.find((c) => !beforeIds.has(c.id) && c.id !== EXAMPLE_CURRICULUM_ID);
  report.check(flow, 'nieuw leerplan staat in wf.curricula.v1', !!created, JSON.stringify(after1.map((c) => c.id)));
  let codes = [];
  if (created) {
    codes = created.goals.map((g) => g.code);
    report.check(flow, 'geen enkele code is leeg', codes.every((c) => c.trim() !== ''), codes.join(', '));
    report.check(flow, 'codes zijn uniek', new Set(codes.map((c) => c.toUpperCase())).size === codes.length, codes.join(', '));
  }

  // ── Doelen toevoegen: 3 nieuwe + 2 al bestaande (zelfde code) ────────────
  let toastText = '';
  let addedGoals = [];
  if (created) {
    // "✔ Leerplan aanmaken" toont meteen de editor van het nieuwe leerplan
    // (geen aparte "Bewerken"-klik nodig, we zitten al niet meer op de lijst).
    await page.getByRole('button', { name: '✨ Doelen uit tekst of pdf' }).click();
    const addDialog = page.getByRole('dialog', { name: '✨ Doelen toevoegen uit tekst of pdf' });
    const dialogOpened = await addDialog.isVisible({ timeout: 4000 }).catch(() => false);
    if (!dialogOpened) {
      // APP-BUG (geen harnasfout): src/pages/CurriculaPage.tsx — CurriculaPage()
      // geeft bij een geopend leerplan vroegtijdig CurriculumEditor terug
      // (`if (editing) return <CurriculumEditor .../>`, regel ~69-78) VOÓR het
      // punt waar `{aiTarget && <CurriculumAIModal/>}` staat (regel ~159, in de
      // tweede, aparte return — enkel bereikt als er GEEN leerplan open staat).
      // Zolang je in de editor van een leerplan zit, doet de knop "✨ Doelen
      // uit tekst of pdf" dus niets: onAskAI zet wel aiTarget-state, maar die
      // modal wordt nergens in de editor-tak gerenderd. Reproductie: open een
      // leerplan → "✨ Doelen uit tekst of pdf" klikken → er verschijnt niets.
      report.check(flow, 'APP-BUG: "✨ Doelen uit tekst of pdf" in de leerplaneditor opent geen dialoog (src/pages/CurriculaPage.tsx: aiTarget-modal onbereikbaar zolang editing gezet is)', false, 'geen dialoog verschenen binnen 4s na de klik');
      await shot(page, `${flow}-appbug-doelen-toevoegen`);
    } else {
      await addDialog.getByLabel('Leerplantekst').fill(AARDRIJKSKUNDE_TEKST_UITBREIDING);
      await runAIStep(page, aiCalls, flow, 'leerplan structureren', () =>
        addDialog.getByRole('button', { name: '✨ Doelen ophalen' }).click()
      );
      await addDialog.locator('text=/\\d+ doel\\(en\\) gevonden/').waitFor({ timeout: 15000 });
      await addDialog.getByRole('button', { name: '✔ Doelen toevoegen' }).click();
      toastText = await lastToast(page, { contains: 'toegevoegd' });
      const m = toastText.match(/(\d+) doel\(en\) toegevoegd(?:, (\d+) overgeslagen)?/);
      const addedN = m ? parseInt(m[1], 10) : -1;
      const skippedN = m && m[2] ? parseInt(m[2], 10) : 0;
      report.check(flow, 'toast: 3 toegevoegd en 2 overgeslagen', addedN === 3 && skippedN === 2, toastText);
      const after2 = await readLS(page, 'wf.curricula.v1', []);
      const updated = after2.find((c) => c.id === created.id);
      addedGoals = updated ? updated.goals.map((g) => g.code) : [];
    }
  }

  saveJson(flow, {
    inputText: AARDRIJKSKUNDE_TEKST, meta: { title: 'AI-test: aardrijkskunde 1e graad', subject: 'Aardrijkskunde', level: '1e graad A-stroom' },
    foundCount, curriculumId: created?.id ?? null, codes,
    addInputText: AARDRIJKSKUNDE_TEKST_UITBREIDING, addToast: toastText, goalsAfterAdd: addedGoals,
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Flow 3 — studio
// ══════════════════════════════════════════════════════════════════════════

async function setTypeOn(group, name, on) {
  const btn = group.getByRole('button', { name, exact: true });
  const pressed = await btn.getAttribute('aria-pressed');
  if ((pressed === 'true') !== on) await btn.click();
}

async function flowStudio(page, report, aiCalls, ctx, texts) {
  const flow = 'studio';
  await goto(page, '/#/'); // zorgt dat het voorbeeldleerplan geseed is
  await goto(page, '/#/ai-studio');

  await page.getByLabel('Bronmateriaal', { exact: true }).fill(texts.spijsvertering);
  await page.getByLabel('Doelgroep', { exact: true }).fill('1e graad secundair');

  await page.locator('#ai-leerplan').selectOption(EXAMPLE_CURRICULUM_ID);
  const goalsGroup = page.locator('[aria-label="Leerplandoelen aanvinken"]');
  await goalsGroup.locator('summary', { hasText: 'Organismen en stelsels' }).click();
  await goalsGroup.locator('label.checkbox-row', { hasText: /NW 5\.1\b/ }).locator('input[type=checkbox]').check();
  await goalsGroup.locator('label.checkbox-row', { hasText: /NW 5\.2\b/ }).locator('input[type=checkbox]').check();

  await page.locator('label.checkbox-row', { hasText: 'Differentiatie meenemen' }).locator('input[type=checkbox]').check();

  const typeGroup = page.locator('[aria-labelledby="type-kiezer-label"]');
  let current = new Set(['quiz']);
  const seenWidgetIds = new Set((await readLS(page, 'wf.widgets.v1', [])).map((w) => w.id));
  const roundsOutput = [];
  const studioWidgetIds = [];

  for (let i = 0; i < ROUNDS.length; i++) {
    const roundTypes = ROUNDS[i];
    for (const t of current) if (!roundTypes.includes(t)) await setTypeOn(typeGroup, TYPE_NAME[t], false);
    for (const t of roundTypes) if (!current.has(t)) await setTypeOn(typeGroup, TYPE_NAME[t], true);
    current = new Set(roundTypes);

    await runAIStep(page, aiCalls, flow, 'widgets uit bron', () =>
      page.getByRole('button', { name: /^✨ Genereer/ }).click()
    );

    const previewShown = await page.getByRole('heading', { name: '💾 Bewaren' }).isVisible({ timeout: 15000 }).catch(() => false);
    let warningsText = [];
    if (previewShown) warningsText = await page.locator('[role="status"]', { hasText: '⚠️' }).allTextContents().catch(() => []);
    report.check(flow, `ronde ${i + 1}: voorstel verschenen voor ${roundTypes.join(', ')}`, previewShown, warningsText.join(' | '));

    let newTypes = [];
    if (previewShown) {
      await page.getByRole('button', { name: /widgets? bewaren/ }).click();
      await page.getByRole('heading', { name: /Klaar — /, exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
      const all = await readLS(page, 'wf.widgets.v1', []);
      const fresh = all.filter((w) => !seenWidgetIds.has(w.id));
      fresh.forEach((w) => { seenWidgetIds.add(w.id); studioWidgetIds.push(w.id); });
      newTypes = fresh.map((w) => w.type);
      roundsOutput.push({ roundTypes, warningsText, saved: fresh.map((w) => ({ id: w.id, type: w.type, title: w.title, code: w.code })) });
    } else {
      roundsOutput.push({ roundTypes, warningsText, saved: [] });
    }
    for (const t of roundTypes) {
      const ok = newTypes.includes(t);
      report.check(flow, `ronde ${i + 1}: type "${t}" kwam terug als voorstel`, ok, ok ? '' : `ontbrak — waarschuwingen: ${warningsText.join(' | ') || '(geen)'}`);
    }

    if (i < ROUNDS.length - 1) {
      await page.getByRole('button', { name: '✨ Nog iets maken' }).click().catch(() => {});
    }
  }

  saveJson('studio', { source: texts.spijsvertering, doelgroep: '1e graad secundair', curriculumId: EXAMPLE_CURRICULUM_ID, goalCodes: ['NW 5.1', 'NW 5.2'], rounds: roundsOutput });

  // ── Elke bewaarde widget openen in de speler: geen page/console-fouten ──
  const allWidgets = await readLS(page, 'wf.widgets.v1', []);
  const before = ctx.errors.length;
  for (const id of studioWidgetIds) {
    const w = allWidgets.find((x) => x.id === id);
    if (!w) continue;
    const b = ctx.errors.length;
    await goto(page, `/#/speel/${w.code}`);
    await sleep(500);
    if (ctx.errors.length > b) {
      report.check(flow, `speler zonder fouten: ${w.type} "${w.title.slice(0, 30)}"`, false, ctx.errors.slice(b).join(' | '));
    }
  }
  report.check(flow, `alle ${studioWidgetIds.length} bewaarde widgets renderen zonder page/console-fouten`, ctx.errors.length === before, ctx.errors.slice(before).join(' | '));

  // ── Quizvragen: enkel toegelaten goalCodes ──────────────────────────────
  const quizWidget = allWidgets.find((w) => studioWidgetIds.includes(w.id) && w.type === 'quiz');
  if (quizWidget) {
    const codes = [...new Set(quizWidget.config.questions.map((q) => q.goalCode).filter(Boolean))];
    const allowed = new Set(['NW 5.1', 'NW 5.2']);
    report.check(flow, 'quizvragen hebben enkel goalCodes uit {NW 5.1, NW 5.2}', codes.every((c) => allowed.has(c)), codes.join(', '));
  } else {
    report.check(flow, 'quizwidget aanwezig om goalCodes te controleren', false, 'geen quiz-widget bewaard in ronde 4');
  }

  ctx.state.studioWidgetIds = studioWidgetIds;
  ctx.state.quizWidgetId = quizWidget?.id ?? null;
  ctx.state.flashcardsWidgetId = allWidgets.find((w) => studioWidgetIds.includes(w.id) && w.type === 'flashcards')?.id ?? null;
  ctx.state.memoryWidgetId = allWidgets.find((w) => studioWidgetIds.includes(w.id) && w.type === 'memory')?.id ?? null;
}

// ══════════════════════════════════════════════════════════════════════════
// Flow 4 — editor (AI-assistent op een bestaande widget)
// ══════════════════════════════════════════════════════════════════════════

async function flowEditor(page, report, aiCalls, ctx) {
  const flow = 'editor';
  const { state } = ctx;
  if (!state.quizWidgetId) {
    report.check(flow, 'vereist een quizwidget uit de studioflow', false, 'flow "studio" leverde geen quiz-widget op');
    return;
  }
  const out = {};

  await goto(page, `/#/bewerk/${state.quizWidgetId}`);
  await page.getByRole('button', { name: '✨ AI-assistent' }).click();
  const dialog = page.getByRole('dialog', { name: /AI-hulp/ });

  const questionsBefore = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === state.quizWidgetId).config.questions;

  // 1. Vragen bijmaken
  await dialog.getByRole('button', { name: 'Vragen bijmaken' }).click();
  await dialog.getByLabel('Aantal').fill('3');
  await dialog.getByLabel('Focus of onderwerp (optioneel)').fill('de maag');
  await runAIStep(page, aiCalls, flow, 'vragen bijmaken', () => dialog.getByRole('button', { name: '✨ Voorstel maken' }).click());
  await dialog.getByRole('button', { name: '✔ Toepassen' }).waitFor({ timeout: 15000 });
  await dialog.getByRole('button', { name: '✔ Toepassen' }).click();
  await sleep(1200);
  const afterAdd = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === state.quizWidgetId).config.questions;
  report.check(flow, `"Vragen bijmaken": +3 vragen (${questionsBefore.length} → ${afterAdd.length})`, afterAdd.length === questionsBefore.length + 3, `${questionsBefore.length} -> ${afterAdd.length}`);
  out.addQuestions = { before: questionsBefore.length, after: afterAdd.length };

  // 2. Hulp aanvullen
  await runAIStep(page, aiCalls, flow, 'hulp aanvullen', () => dialog.getByRole('button', { name: 'Hulp aanvullen' }).click());
  const applied2 = await dialog.getByRole('button', { name: '✔ Toepassen' }).isVisible({ timeout: 15000 }).catch(() => false);
  if (applied2) await dialog.getByRole('button', { name: '✔ Toepassen' }).click();
  report.check(flow, '"Hulp aanvullen" leverde een voorstel op', applied2);
  await sleep(1000);

  // 3. Glossarium maken
  await runAIStep(page, aiCalls, flow, 'glossarium maken', () => dialog.getByRole('button', { name: 'Glossarium maken' }).click());
  const applied3 = await dialog.getByRole('button', { name: '✔ Toepassen' }).isVisible({ timeout: 15000 }).catch(() => false);
  if (applied3) await dialog.getByRole('button', { name: '✔ Toepassen' }).click();
  report.check(flow, '"Glossarium maken" leverde een voorstel op', applied3);
  await sleep(1000);

  // 4. Afleiders versterken — juiste antwoorden en aantal opties ongewijzigd
  const beforeMc = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === state.quizWidgetId).config.questions
    .filter((q) => q.type === 'mc' || q.type === 'multi');
  await runAIStep(page, aiCalls, flow, 'afleiders versterken', () => dialog.getByRole('button', { name: 'Afleiders versterken' }).click());
  const applied4 = await dialog.getByRole('button', { name: '✔ Toepassen' }).isVisible({ timeout: 15000 }).catch(() => false);
  if (applied4) await dialog.getByRole('button', { name: '✔ Toepassen' }).click();
  await sleep(1000);
  if (applied4 && beforeMc.length > 0) {
    const afterMc = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === state.quizWidgetId).config.questions
      .filter((q) => q.type === 'mc' || q.type === 'multi');
    const sameCount = afterMc.length === beforeMc.length;
    const correctIntact = beforeMc.every((qb) => {
      const qa = afterMc.find((x) => x.id === qb.id);
      if (!qa || qa.options.length !== qb.options.length) return false;
      const idxB = qb.type === 'mc' ? [qb.correctIndex] : qb.correctIndices;
      return idxB.every((i) => qa.options[i]?.trim() === qb.options[i]?.trim());
    });
    report.check(flow, '"Afleiders versterken": juiste antwoorden ongewijzigd, zelfde aantal opties', sameCount && correctIntact, `mc-vragen voor=${beforeMc.length} na=${afterMc.length}`);
  } else {
    report.check(flow, '"Afleiders versterken" leverde een voorstel op', applied4, beforeMc.length === 0 ? 'geen mc/multi-vragen om te versterken' : '');
  }

  // 5. Koppel vragen aan leerplandoelen (voorbeeldleerplan)
  await dialog.getByRole('button', { name: 'Koppel vragen aan leerplandoelen' }).click();
  await dialog.getByLabel('Leerplan', { exact: true }).selectOption(EXAMPLE_CURRICULUM_ID);
  await runAIStep(page, aiCalls, flow, 'vragen aan leerplandoelen koppelen', () => dialog.getByRole('button', { name: '✨ Voorstel maken' }).click());
  const applied5 = await dialog.getByRole('button', { name: '✔ Toepassen' }).isVisible({ timeout: 15000 }).catch(() => false);
  if (applied5) await dialog.getByRole('button', { name: '✔ Toepassen' }).click();
  await sleep(1000);
  if (applied5) {
    const curriculum = (await readLS(page, 'wf.curricula.v1', [])).find((c) => c.id === EXAMPLE_CURRICULUM_ID);
    const validCodes = new Set(curriculum.goals.map((g) => g.code));
    const afterGoals = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === state.quizWidgetId).config.questions
      .filter((q) => q.goalCode).map((q) => q.goalCode);
    report.check(flow, 'alle gekoppelde codes bestaan in het voorbeeldleerplan', afterGoals.every((c) => validCodes.has(c)), afterGoals.join(', '));
    out.goalLink = afterGoals;
  } else {
    report.check(flow, '"Koppel vragen aan leerplandoelen" leverde een voorstel op', false);
  }

  await page.keyboard.press('Escape');
  await sleep(200);

  // 6/7. Items bijmaken op de flitskaarten- en memorywidget uit flow 3
  for (const [key, label] of [['flashcardsWidgetId', 'flitskaarten'], ['memoryWidgetId', 'memory']]) {
    const id = state[key];
    if (!id) { report.check(flow, `"Items bijmaken" op ${label}-widget: widget beschikbaar`, false, 'geen widget van dit type uit flow studio'); continue; }
    await goto(page, `/#/bewerk/${id}`);
    await page.getByRole('button', { name: '✨ AI-assistent' }).click();
    const d = page.getByRole('dialog', { name: /AI-hulp/ });
    const field = key === 'flashcardsWidgetId' ? 'cards' : 'pairs';
    const before = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === id).config[field].length;
    await d.getByRole('button', { name: 'Items bijmaken' }).click();
    await d.getByLabel('Aantal').fill('4');
    await runAIStep(page, aiCalls, flow, 'items bijmaken', () => d.getByRole('button', { name: '✨ Voorstel maken' }).click());
    const appliedItems = await d.getByRole('button', { name: '✔ Toepassen' }).isVisible({ timeout: 15000 }).catch(() => false);
    if (appliedItems) await d.getByRole('button', { name: '✔ Toepassen' }).click();
    await sleep(1200);
    const after = (await readLS(page, 'wf.widgets.v1', [])).find((w) => w.id === id).config[field].length;
    report.check(flow, `"Items bijmaken" op ${label}-widget: +4 items (${before} → ${after})`, appliedItems && after === before + 4, `${before} -> ${after}`);
    out[`items_${label}`] = { before, after };
    await page.keyboard.press('Escape');
  }

  saveJson(flow, out);
}

// ══════════════════════════════════════════════════════════════════════════
// Flow 5 — cursus
// ══════════════════════════════════════════════════════════════════════════

async function flowCursus(page, report, aiCalls, ctx, texts) {
  const flow = 'cursus';
  const out = {};

  // ── 5a. Blanco vanuit leerplan (Krachten en beweging: NW 7.1–7.3) ───────
  try {
    await goto(page, '/#/cursussen');
    const beforeCourses = new Set((await readLS(page, 'wf.courses.v1', [])).map((c) => c.id));
    await page.getByRole('button', { name: '🎯 Blanco vanuit leerplan' }).click();
    const dNew = page.getByRole('dialog', { name: '✨ AI-cursusbouwer' });
    await dNew.getByLabel('Leerplan', { exact: true }).selectOption(EXAMPLE_CURRICULUM_ID);
    await dNew.locator('fieldset', { hasText: 'Krachten en beweging' }).getByRole('button', { name: 'heel thema' }).click();
    await dNew.getByLabel('Vak / onderwerp').fill('Natuurwetenschappen — krachten');
    await dNew.getByLabel('Doelgroep').fill('1e graad A-stroom');
    await dNew.getByLabel('Aantal hoofdstukken').fill('2');
    const withQuizzesChecked = await dNew.locator('input[type=checkbox]').last().isChecked().catch(() => false);
    report.check(flow, '5a: "oefenquiz maken" staat standaard aan', withQuizzesChecked);

    await runAIStep(page, aiCalls, flow, 'cursus bouwen', () => dNew.getByRole('button', { name: '✨ Genereren' }).click());
    // "✔ Cursus aanmaken" verschijnt pas als er een voorstel is; bij een te
    // lang afgekapt AI-antwoord (zie ook 5d) geeft de app een foutmelding met
    // een "Opnieuw proberen"-knop — dat proberen we eenmaal, zoals een
    // leerkracht ook zou doen, vóór we het als mislukt melden. De voorvertoning
    // moet nog blijven staan om ze na te lezen, dus niet meteen wegklikken.
    const goalTextBefore = () => dNew.locator('text=/gekozen doelen/').first().textContent().catch(() => '');
    let previewOk = await dNew.getByRole('button', { name: '✔ Cursus aanmaken' }).isVisible({ timeout: 20000 }).catch(() => false);
    if (!previewOk) {
      const retryBtn = dNew.getByRole('button', { name: 'Opnieuw proberen' });
      if (await retryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await runAIStep(page, aiCalls, flow, 'cursus bouwen', () => retryBtn.click());
        previewOk = await dNew.getByRole('button', { name: '✔ Cursus aanmaken' }).isVisible({ timeout: 20000 }).catch(() => false);
      }
    }
    report.check(flow, '5a: voorvertoning verschenen', previewOk);

    if (previewOk) {
      const goalText = await goalTextBefore();
      const gm = (goalText ?? '').match(/(\d+) van (\d+) gekozen doelen/);
      report.check(flow, '5a: "3 van 3 gekozen doelen"', !!gm && gm[1] === '3' && gm[2] === '3', goalText ?? '');

      await dNew.getByRole('button', { name: '✔ Cursus aanmaken' }).click();
      await page.waitForURL(/#\/cursus\/bewerk\//, { timeout: 15000 }).catch(() => {});
      await sleep(500);

      const coursesAfter = await readLS(page, 'wf.courses.v1', []);
      const courseA = coursesAfter.find((c) => !beforeCourses.has(c.id));
      report.check(flow, '5a: nieuwe cursus staat in wf.courses.v1', !!courseA);
      if (courseA) {
        ctx.state.courseAId = courseA.id;
        const allowed = new Set(['NW 7.1', 'NW 7.2', 'NW 7.3']);
        const codesUsed = courseA.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.goalCodes ?? []));
        report.check(flow, '5a: sectie-goalCodes ⊆ {NW 7.1, NW 7.2, NW 7.3}', codesUsed.every((c) => allowed.has(c)), codesUsed.join(', '));
        const widgetIds = courseA.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'widget').map((b) => b.widgetId)));
        const widgets = await readLS(page, 'wf.widgets.v1', []);
        const embeddedOk = widgetIds.length > 0 && widgetIds.every((id) => widgets.some((w) => w.id === id));
        report.check(flow, '5a: oefenquizzen als widget-blokken ingebed en aanwezig in wf.widgets.v1', embeddedOk, `${widgetIds.length} widget-blok(ken)`);
        out.a = { courseId: courseA.id, chapters: courseA.chapters.length, codesUsed, widgetIds };
      }
    }
  } catch (e) {
    report.check(flow, '5a: blanco vanuit leerplan zonder fout', false, String(e).slice(0, 300));
    await shot(page, `${flow}-5a-fout`);
  }

  // ── 5b. Importeren: tekst plakken → cursus bouwen met AI ────────────────
  try {
    await goto(page, '/#/importeren');
    await page.locator('summary', { hasText: '✍️ Of plak je tekst rechtstreeks' }).click();
    await page.getByPlaceholder('bv. "Hoofdstuk 3 — de waterkringloop"').fill('Massa, volume en massadichtheid (AI-test)');
    await page.locator('textarea[placeholder="Plak hier je tekst…"]').fill(texts.massadichtheid);
    await page.getByRole('button', { name: '+ Tekst toevoegen als bron' }).click();
    await sleep(300);
    await page.getByLabel('Leerplan (optioneel)').selectOption(EXAMPLE_CURRICULUM_ID);
    const coursesBefore = new Set((await readLS(page, 'wf.courses.v1', [])).map((c) => c.id));
    await page.getByRole('button', { name: '✨ Cursus bouwen met AI' }).click();
    await page.waitForURL(/#\/cursussen/, { timeout: 10000 }).catch(() => {});
    const dImport = page.getByRole('dialog', { name: '✨ AI-cursusbouwer' });
    await dImport.getByRole('button', { name: '✨ Genereren' }).waitFor({ timeout: 10000 });
    await runAIStep(page, aiCalls, flow, 'cursus bouwen', () => dImport.getByRole('button', { name: '✨ Genereren' }).click());
    let previewOkB = await dImport.getByRole('button', { name: '✔ Cursus aanmaken' }).isVisible({ timeout: 20000 }).catch(() => false);
    if (!previewOkB) {
      const retryBtnB = dImport.getByRole('button', { name: 'Opnieuw proberen' });
      if (await retryBtnB.isVisible({ timeout: 2000 }).catch(() => false)) {
        await runAIStep(page, aiCalls, flow, 'cursus bouwen', () => retryBtnB.click());
        previewOkB = await dImport.getByRole('button', { name: '✔ Cursus aanmaken' }).isVisible({ timeout: 20000 }).catch(() => false);
      }
    }
    report.check(flow, '5b: voorvertoning verschenen', previewOkB);
    if (previewOkB) {
      await dImport.getByRole('button', { name: '✔ Cursus aanmaken' }).click();
      await page.waitForURL(/#\/cursus\/bewerk\//, { timeout: 15000 }).catch(() => {});
      await sleep(500);
      const coursesAfter = await readLS(page, 'wf.courses.v1', []);
      const courseB = coursesAfter.find((c) => !coursesBefore.has(c.id));
      report.check(flow, '5b: nieuwe cursus staat in wf.courses.v1', !!courseB);
      if (courseB) {
        ctx.state.courseBId = courseB.id;
        const allText = JSON.stringify(courseB).toLowerCase();
        report.check(flow, '5b: cursusinhoud bevat "massadichtheid"', allText.includes('massadichtheid'));
        out.b = { courseId: courseB.id, title: courseB.title };
      }
    }
  } catch (e) {
    report.check(flow, '5b: importeren met AI zonder fout', false, String(e).slice(0, 300));
    await shot(page, `${flow}-5b-fout`);
  }

  // ── 5c. In de editor van cursus A: sectie vullen, oefeningen, optimaliseren ──
  try {
    if (!ctx.state.courseAId) throw new Error('geen cursus A uit stap 5a beschikbaar');
    await goto(page, `/#/cursus/bewerk/${ctx.state.courseAId}`);
    const nav = page.locator('nav[aria-label="Cursusstructuur"]');
    // De eerste sectie staat al standaard geselecteerd (aria-current); expliciet
    // "kiezen" via de nav zoals gevraagd — niet de eerste <button> (dat is het
    // "omhoog"-pijltje van hoofdstuk 1, dat uitgeschakeld is).
    await nav.locator('button[aria-current="true"]').click();
    await sleep(300);

    // Vul deze sectie met AI
    await page.getByRole('button', { name: '✨ Vul deze sectie met AI' }).click();
    const dSection = page.getByRole('dialog', { name: '✨ Sectie vullen met AI' });
    await dSection.getByLabel('Wat moet er in deze sectie komen?').fill('Leg uit wat een kracht is, met een herkenbaar voorbeeld uit het dagelijks leven en een korte begrippenlijst.');
    const blocksBefore = (await readLS(page, 'wf.courses.v1', [])).find((c) => c.id === ctx.state.courseAId).chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks)).length;
    await runAIStep(page, aiCalls, flow, 'sectie-inhoud', () => dSection.getByRole('button', { name: '✨ Genereren' }).click());
    const sectionApplied = await applyOrRetryOnce(page, dSection, '✔ Toepassen', { aiCalls, flow, task: 'sectie-inhoud' });
    if (sectionApplied) await page.locator('text=✓ Bewaard').waitFor({ timeout: 8000 }).catch(() => {});
    const blocksAfter = (await readLS(page, 'wf.courses.v1', [])).find((c) => c.id === ctx.state.courseAId).chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks)).length;
    report.check(flow, '5c: "Vul deze sectie met AI" voegde blokken toe', sectionApplied && blocksAfter > blocksBefore, `${blocksBefore} -> ${blocksAfter}`);

    // Stel oefeningen voor
    await page.getByRole('button', { name: '✨ Stel oefeningen voor' }).click();
    const dExerc = page.getByRole('dialog', { name: '✨ Oefeningen voorstellen' });
    await dExerc.getByLabel('Aantal oefeningen').fill('2');
    const widgetsBefore = (await readLS(page, 'wf.widgets.v1', [])).length;
    await runAIStep(page, aiCalls, flow, 'oefeningen bij een sectie', () => dExerc.getByRole('button', { name: '✨ Genereren' }).click());
    const exercApplied = await applyOrRetryOnce(page, dExerc, '✔ Oefeningen toevoegen', { aiCalls, flow, task: 'oefeningen bij een sectie' });
    if (exercApplied) await page.locator('text=✓ Bewaard').waitFor({ timeout: 8000 }).catch(() => {});
    const widgetsAfter = (await readLS(page, 'wf.widgets.v1', [])).length;
    report.check(flow, '5c: "Stel oefeningen voor" leverde nieuwe widgets op', exercApplied && widgetsAfter > widgetsBefore, `${widgetsBefore} -> ${widgetsAfter}`);

    // Optimaliseer: Vereenvoudig de taal
    await page.getByRole('button', { name: '✨ Optimaliseer' }).click();
    const dOpt1 = page.getByRole('dialog', { name: '✨ Cursus optimaliseren' });
    await dOpt1.locator('label.checkbox-row', { hasText: 'Vereenvoudig de taal' }).locator('input[type=radio]').check();
    await runAIStep(page, aiCalls, flow, 'cursus optimaliseren', () => dOpt1.getByRole('button', { name: '✨ Genereren' }).click());
    const opt1Applied = await applyOrRetryOnce(page, dOpt1, '✔ Optimalisatie toepassen', { aiCalls, flow, task: 'cursus optimaliseren' });
    if (opt1Applied) await page.locator('text=✓ Bewaard').waitFor({ timeout: 8000 }).catch(() => {});
    report.check(flow, '5c: "Optimaliseer — Vereenvoudig de taal" toegepast', opt1Applied);

    // Optimaliseer: Voeg controlevragen toe
    await page.getByRole('button', { name: '✨ Optimaliseer' }).click();
    const dOpt2 = page.getByRole('dialog', { name: '✨ Cursus optimaliseren' });
    await dOpt2.locator('label.checkbox-row', { hasText: 'Voeg controlevragen toe' }).locator('input[type=radio]').check();
    await runAIStep(page, aiCalls, flow, 'cursus optimaliseren', () => dOpt2.getByRole('button', { name: '✨ Genereren' }).click());
    const opt2Applied = await applyOrRetryOnce(page, dOpt2, '✔ Optimalisatie toepassen', { aiCalls, flow, task: 'cursus optimaliseren' });
    if (opt2Applied) await page.locator('text=✓ Bewaard').waitFor({ timeout: 8000 }).catch(() => {});
    report.check(flow, '5c: "Optimaliseer — Voeg controlevragen toe" toegepast', opt2Applied);

    out.c = { blocksBefore, blocksAfter, widgetsBefore, widgetsAfter, opt1Applied, opt2Applied };
  } catch (e) {
    report.check(flow, '5c: sectie-AI en optimaliseren zonder fout', false, String(e).slice(0, 300));
    await shot(page, `${flow}-5c-fout`);
  }

  // ── 5d. Democursus: doelendekking vullen + herwerken ────────────────────
  try {
    await goto(page, '/#/cursussen');
    const demo = (await readLS(page, 'wf.courses.v1', [])).find((c) => c.title === 'Voorbeeldcursus: de waterkringloop');
    if (!demo) throw new Error('democursus "Voorbeeldcursus: de waterkringloop" niet gevonden');
    await goto(page, `/#/cursus/bewerk/${demo.id}`);

    const sectionIdsBefore = new Set(demo.chapters.flatMap((ch) => ch.sections.map((s) => s.id)));

    // Doelendekking: dekking vóór meten
    await page.getByRole('button', { name: '🎯 Doelendekking' }).click();
    let dCov = page.getByRole('dialog', { name: '🎯 Doelendekking' });
    const summaryBefore = (await dCov.locator('text=/Dekkend/').first().textContent().catch(() => '')) ?? '';
    const mBefore = summaryBefore.match(/Dekkend:\s*(?:alle\s*(\d+)|(\d+)\s*van\s*(\d+))/);
    const coveredBefore = mBefore ? parseInt(mBefore[1] ?? mBefore[2], 10) : null;

    await dCov.getByRole('button', { name: '✨ Vul de hiaten' }).click();
    const dFill = page.getByRole('dialog', { name: '✨ Cursus optimaliseren' });
    await runAIStep(page, aiCalls, flow, 'cursus optimaliseren', () => dFill.getByRole('button', { name: '✨ Genereren' }).click());
    const fillApplied = await applyOrRetryOnce(page, dFill, '✔ Optimalisatie toepassen', { aiCalls, flow, task: 'cursus optimaliseren' });
    if (fillApplied) await page.locator('text=✓ Bewaard').waitFor({ timeout: 8000 }).catch(() => {});
    report.check(flow, '5d: "Vul de hiaten" leverde een toepasbaar voorstel op', fillApplied);

    const demoAfterFill = (await readLS(page, 'wf.courses.v1', [])).find((c) => c.id === demo.id);
    const sectionIdsAfter = new Set(demoAfterFill.chapters.flatMap((ch) => ch.sections.map((s) => s.id)));
    const preserved = [...sectionIdsBefore].every((id) => sectionIdsAfter.has(id));
    report.check(flow, '5d: bestaande secties bleven behouden na "Vul de hiaten"', preserved, `${sectionIdsBefore.size} secties voordien`);

    await page.getByRole('button', { name: '🎯 Doelendekking' }).click();
    dCov = page.getByRole('dialog', { name: '🎯 Doelendekking' });
    const summaryAfter = (await dCov.locator('text=/Dekkend/').first().textContent().catch(() => '')) ?? '';
    const mAfter = summaryAfter.match(/Dekkend:\s*(?:alle\s*(\d+)|(\d+)\s*van\s*(\d+))/);
    const coveredAfter = mAfter ? parseInt(mAfter[1] ?? mAfter[2], 10) : null;
    report.check(flow, `5d: dekking steeg (${summaryBefore.trim()} → ${summaryAfter.trim()})`, coveredBefore !== null && coveredAfter !== null && coveredAfter > coveredBefore, `voor="${summaryBefore.trim()}" na="${summaryAfter.trim()}"`);
    await page.keyboard.press('Escape');
    await sleep(200);

    // Fixture: minstens één media-/widgetblok toevoegen om "keep"-gedrag te testen
    // (de meegeleverde democursus bevat er standaard geen — zie ensureDemoCourse
    // in lib/courses.ts, dat pas een widget-blok toevoegt als er al widgets
    // bestaan op het moment dat de allereerste keer de app opstart).
    const anyWidget = (await readLS(page, 'wf.widgets.v1', []))[0];
    let fixtureBlockId = null;
    if (anyWidget) {
      const coursesNow = await readLS(page, 'wf.courses.v1', []);
      const demoNow = coursesNow.find((c) => c.id === demo.id);
      fixtureBlockId = `ai-test-keep-${Date.now()}`;
      demoNow.chapters[0].sections[0].blocks.push({ id: fixtureBlockId, type: 'widget', widgetId: anyWidget.id });
      await writeLS(page, 'wf.courses.v1', coursesNow);
      await page.reload({ waitUntil: 'networkidle' });
      await sleep(400);
    }

    // Herwerk met AI
    await page.getByRole('button', { name: '✨ Herwerk met AI' }).click();
    const dRework = page.getByRole('dialog', { name: '✨ Cursus herwerken met AI' });
    await dRework.getByLabel('Wat moet er anders?').fill('verdeel in kleinere secties');
    await runAIStep(page, aiCalls, flow, 'cursus herwerken', () => dRework.getByRole('button', { name: '✨ Genereren' }).click());
    const reworkApplied = await applyOrRetryOnce(page, dRework, '✔ Herwerking toepassen', { aiCalls, flow, task: 'cursus herwerken' });
    if (reworkApplied) await page.locator('text=✓ Bewaard').waitFor({ timeout: 8000 }).catch(() => {});
    report.check(flow, '5d: "Herwerk met AI" leverde een toepasbaar voorstel op', reworkApplied);

    if (fixtureBlockId) {
      const demoReworked = (await readLS(page, 'wf.courses.v1', [])).find((c) => c.id === demo.id);
      const allBlockIds = demoReworked.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks.map((b) => b.id)));
      report.check(flow, '5d: widget-/mediablok (keep-blok) bleef behouden na herwerken', allBlockIds.includes(fixtureBlockId), `blok ${fixtureBlockId} ${allBlockIds.includes(fixtureBlockId) ? 'gevonden' : 'NIET gevonden'}`);
    }

    out.d = { coveredBefore, coveredAfter, summaryBefore, summaryAfter, preserved, fixtureBlockId, reworkApplied };
  } catch (e) {
    report.check(flow, '5d: democursus doelendekking/herwerken zonder fout', false, String(e).slice(0, 300));
    await shot(page, `${flow}-5d-fout`);
  }

  saveJson(flow, out);
}

// ══════════════════════════════════════════════════════════════════════════
// Flow 6 — resultaten
// ══════════════════════════════════════════════════════════════════════════

async function flowResultaten(page, report, aiCalls) {
  const flow = 'resultaten';
  await goto(page, '/#/');

  const widgetId = 'aitest-quiz-resultaten';
  const widgetCode = 'AITEST';
  const now = Date.now();
  const widget = {
    id: widgetId, type: 'quiz', title: 'AI-test — spijsvertering', folderId: null,
    config: {
      questions: [
        {
          id: 'q-mc', type: 'mc', points: 1,
          prompt: 'Waar worden de meeste voedingsstoffen opgenomen in het bloed?',
          options: ['De maag', 'De dunne darm', 'De dikke darm', 'De slokdarm'], correctIndex: 1,
        },
        {
          id: 'q-long', type: 'long', points: 3,
          prompt: 'Leg in eigen woorden uit wat het spijsverteringsstelsel doet.',
          modelAnswer: 'Het spijsverteringsstelsel breekt voedsel mechanisch en chemisch af tot voedingsstoffen die opgenomen worden in het bloed (vooral in de dunne darm); onverteerde resten worden uitgescheiden.',
        },
      ],
      layout: 'single',
    },
    settings: { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' },
    code: widgetCode, createdAt: now, updatedAt: now,
  };
  const submissions = [
    {
      id: 'aitest-sub-1', widgetId, widgetCode, studentName: 'Sarah',
      startedAt: now - 300000, submittedAt: now, durationSec: 280,
      answers: { 'q-mc': 1, 'q-long': 'Je eet eten en dat gaat naar je maag waar het verteerd wordt, en dan komt het in je bloed terecht denk ik.' },
      itemScores: { 'q-mc': { earned: 1, max: 1, mode: 'auto' }, 'q-long': { earned: 0, max: 3, mode: 'pending' } },
      totalEarned: 1, totalMax: 4, status: 'submitted',
    },
    {
      id: 'aitest-sub-2', widgetId, widgetCode, studentName: 'Milan',
      startedAt: now - 250000, submittedAt: now - 10000, durationSec: 240,
      answers: { 'q-mc': 0, 'q-long': 'Het voedsel wordt kleiner gemaakt in de mond en de maag en dan gaat het naar de darmen.' },
      itemScores: { 'q-mc': { earned: 0, max: 1, mode: 'auto' }, 'q-long': { earned: 0, max: 3, mode: 'pending' } },
      totalEarned: 0, totalMax: 4, status: 'submitted',
    },
  ];
  await page.evaluate(({ widget, submissions }) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').filter((w) => w.id !== widget.id);
    ws.unshift(widget);
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
    const subs = JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]').filter((s) => !submissions.some((n) => n.id === s.id));
    localStorage.setItem('wf.submissions.v1', JSON.stringify([...subs, ...submissions]));
  }, { widget, submissions });

  await goto(page, `/#/resultaten/${widgetId}`);
  await page.locator('table.data tbody tr', { hasText: 'Sarah' }).click();
  const modal = page.getByRole('dialog', { name: 'Inzending van Sarah' });
  await runAIStep(page, aiCalls, flow, 'feedbacksuggestie', () => modal.getByRole('button', { name: 'Stel feedback voor' }).click());
  const feedbackText = await modal.locator('#teacher-feedback').inputValue();
  const wc = wordCount(feedbackText);
  report.check(flow, 'feedbacktextarea is gevuld', feedbackText.trim().length > 0, feedbackText);
  report.check(flow, `feedback is Nederlandstalig en ≤ ~120 woorden (${wc} woorden)`, wc > 0 && wc <= 130, feedbackText);
  await modal.getByRole('button', { name: 'Beoordeling opslaan' }).click();
  await sleep(400);

  await page.getByRole('tab', { name: /Nakijken/ }).click();
  const milanRow = page.locator('.card', { hasText: 'Milan' }).filter({ has: page.locator('textarea') });
  await runAIStep(page, aiCalls, flow, 'feedbacksuggestie', () => milanRow.getByRole('button', { name: 'AI-feedbackvoorstel voor dit antwoord' }).click());
  const cockpitText = await milanRow.locator('textarea').inputValue();
  report.check(flow, 'AI-feedbackvoorstel ingevoegd in de nakijkcockpit', cockpitText.trim().length > 0, cockpitText);
  await milanRow.locator('input[type=number]').fill('2');
  await milanRow.getByRole('button', { name: 'Opslaan ✓' }).click();
  await sleep(500);

  const subsAfter = await readLS(page, 'wf.submissions.v1', []);
  const milan = subsAfter.find((s) => s.id === 'aitest-sub-2');
  report.check(flow, 'inzending van Milan bewaard met manuele score en status graded', !!milan && milan.itemScores['q-long'].mode === 'manual' && milan.itemScores['q-long'].earned === 2 && milan.status === 'graded', JSON.stringify(milan?.itemScores));
  const sarah = subsAfter.find((s) => s.id === 'aitest-sub-1');
  report.check(flow, 'inzending van Sarah bewaard met AI-feedbacktekst', !!sarah && (sarah.teacherFeedback ?? '').trim().length > 0, sarah?.teacherFeedback ?? '');

  saveJson(flow, { widget, submissionsIn: submissions, sarahFeedback: feedbackText, milanCockpitFeedback: cockpitText, submissionsOut: subsAfter.filter((s) => s.widgetId === widgetId) });
}

// ══════════════════════════════════════════════════════════════════════════
// Hoofdprogramma
// ══════════════════════════════════════════════════════════════════════════

const FLOWS = {
  instellingen: { fn: flowInstellingen, needs: [] },
  leerplan: { fn: flowLeerplan, needs: [] },
  studio: { fn: flowStudio, needs: [] },
  editor: { fn: flowEditor, needs: ['studio'] },
  cursus: { fn: flowCursus, needs: [] },
  resultaten: { fn: flowResultaten, needs: [] },
};
const FLOW_ORDER = ['instellingen', 'leerplan', 'studio', 'editor', 'cursus', 'resultaten'];

async function main() {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => !FLOW_ORDER.includes(a));
  if (unknown.length) console.log(`Onbekende flownaam(en) genegeerd: ${unknown.join(', ')}`);
  const requestedRaw = argv.filter((a) => FLOW_ORDER.includes(a));
  const requested = new Set(requestedRaw.length ? requestedRaw : FLOW_ORDER);
  // Afhankelijkheden erbij nemen (bv. editor heeft studio nodig).
  for (const name of [...requested]) for (const dep of FLOWS[name].needs) requested.add(dep);
  const toRun = FLOW_ORDER.filter((f) => requested.has(f));

  console.log(`AI-eindtest — flows: ${toRun.join(', ')}`);
  console.log(`Uitvoer naar: ${AI_OUT}`);

  const startedAt = Date.now();
  const needsCleanAI = toRun.includes('instellingen');
  const { browser, page, errors, key } = await startBrowser({ seedAI: !needsCleanAI });
  const report = makeReport();
  const aiCalls = [];
  const state = {};
  const ctx = { apiKey: key, errors, state };
  const texts = loadExampleCourseText();

  for (const flowName of toRun) {
    console.log(`\n── ${flowName} ──`);
    const before = errors.length;
    try {
      if (flowName === 'instellingen') await flowInstellingen(page, report, aiCalls, ctx);
      else if (flowName === 'leerplan') await flowLeerplan(page, report, aiCalls);
      else if (flowName === 'studio') await flowStudio(page, report, aiCalls, ctx, texts);
      else if (flowName === 'editor') await flowEditor(page, report, aiCalls, ctx);
      else if (flowName === 'cursus') await flowCursus(page, report, aiCalls, ctx, texts);
      else if (flowName === 'resultaten') await flowResultaten(page, report, aiCalls);
    } catch (e) {
      console.log(`  ✗ FOUT in flow "${flowName}": ${e?.stack || e}`);
      report.check(flowName, `flow "${flowName}" liep tot het einde zonder onverwachte fout`, false, String(e?.message || e).slice(0, 400));
      await shot(page, `${flowName}-fout`);
    }
    if (errors.length > before) {
      console.log(`  console-/paginafouten tijdens "${flowName}": ${errors.slice(before).join(' | ')}`);
    }
  }

  const endedAt = Date.now();

  // ── rapport.json samenvoegen met een eerdere run (per flow) ─────────────
  // Zo bouwt "een flow apart draaien" hetzelfde bestand verder op i.p.v. het
  // resultaat van andere flows weg te gooien: elke sectie hierboven schrijft
  // haar eigen <flow>.json, maar alle 6 horen ook samen in één rapport.
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(path.join(AI_OUT, 'rapport.json'), 'utf8'));
  } catch { /* eerste run, of nog geen rapport — begint leeg */ }
  const keepOldChecks = (previous?.checks ?? []).filter((r) => !toRun.includes(r.flow));
  const keepOldCalls = (previous?.aiCalls ?? []).filter((c) => !toRun.includes(c.flow));
  const keepOldRuns = (previous?.runs ?? []).filter((r) => !toRun.includes(r.flow));
  const mergedChecks = [...keepOldChecks, ...report.rows];
  const mergedCalls = [...keepOldCalls, ...aiCalls];
  const mergedRuns = [...keepOldRuns, ...toRun.map((flow) => ({ flow, startedAt, endedAt, durationMs: endedAt - startedAt }))];
  const totals = mergedCalls.reduce((a, c) => ({
    calls: a.calls + 1, inputTokens: a.inputTokens + (c.inputTokens || 0), outputTokens: a.outputTokens + (c.outputTokens || 0),
  }), { calls: 0, inputTokens: 0, outputTokens: 0 });
  const failures = report.rows.filter((r) => !r.ok).length;
  const totalFailures = mergedChecks.filter((r) => !r.ok).length;

  saveJson('rapport', {
    lastRunAt: endedAt, lastRunFlows: toRun, lastRunDurationMs: endedAt - startedAt,
    flowsCovered: [...new Set(mergedRuns.map((r) => r.flow))],
    runs: mergedRuns, checks: mergedChecks, aiCalls: mergedCalls, totals,
    consoleErrors: errors,
  });

  console.log('\n──────────');
  console.log(`Checks in deze run: ${report.rows.length}, waarvan ${failures} gefaald.`);
  console.log(`Checks in het volledige (samengevoegde) rapport: ${mergedChecks.length}, waarvan ${totalFailures} gefaald.`);
  console.log(`AI-aanroepen (totaal in rapport): ${totals.calls}, invoertokens: ${totals.inputTokens}, uitvoertokens: ${totals.outputTokens}.`);
  console.log(`Looptijd van deze run: ${Math.round((endedAt - startedAt) / 1000)}s.`);
  console.log(`Rapport: ${path.join(AI_OUT, 'rapport.json')}`);

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('Onverwachte fout:', e);
  process.exit(1);
});
