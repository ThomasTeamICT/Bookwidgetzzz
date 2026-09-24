// AI-studio met een nagebootste AI: vijf widgetsoorten tegelijk, zonder sleutel.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/ai/mock-studio.mjs [fout]
//
// Controleert dat de studio per soort een eigen aanvraag doet (hoogstens drie
// tegelijk), dat alle soorten in de voorvertoning komen, en met "fout" dat een
// mislukte soort apart opnieuw kan zonder de rest te verliezen. Elke aanvraag
// duurt twee seconden; er gaat niets naar het internet.
import pw from 'playwright-core';
const { chromium } = pw;
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const MODE = process.argv[2] === 'fout' ? 'fout' : 'ok';
const q = (p) => ({ type: 'mc', prompt: p, options: ['drie', 'vier'], correctIndex: 1, explanation: 'Twee plus twee is vier.' });
const PAYLOAD = {
  quiz: { type: 'quiz', title: 'Mock quiz', config: { questions: [q('2+2?'), q('1+3?')] } },
  worksheet: { type: 'worksheet', title: 'Mock werkblad', config: { questions: [q('2+2?')], layout: 'scroll' } },
  exitticket: { type: 'exitticket', title: 'Mock exit', config: { questions: [q('2+2?')], layout: 'single' } },
  flashcards: { type: 'flashcards', title: 'Mock kaarten', config: { cards: [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }] } },
  pairs: { type: 'pairs', title: 'Mock koppel', config: { pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }, { left: 'e', right: 'f' }] } },
};
const log = [];
const t0 = Date.now();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { if (!localStorage.getItem('wf.ai.v1')) localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: 'test-sleutel', model: 'gemini-3.7-flash' })); });
let failOnce = MODE === 'fout';
await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  const body = JSON.parse(req.postData() || '{}');
  const text = body.messages.map((m) => m.content).join('\n');
  const m = /Maak de volgende widget\(s\): ([a-z, ]+)\./.exec(text);
  const types = m ? m[1].split(',').map((s) => s.trim()) : [];
  const start = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 2000));
  log.push(`${types.join('+')} start ${start} ms, klaar ${Date.now() - t0} ms`);
  if (failOnce && types[0] === 'worksheet') { failOnce = false; return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: 'overloaded' } }) }); }
  const json = JSON.stringify({ widgets: types.map((t) => PAYLOAD[t]).filter(Boolean) });
  const chunks = [json.slice(0, json.length / 2), json.slice(json.length / 2)];
  const sse = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c } }] })}\n\n`).join('')
    + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\ndata: [DONE]\n\n`;
  return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/event-stream' }, body: sse });
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '/#/ai-studio', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByLabel('Bronmateriaal', { exact: true }).fill('De som van twee en twee is vier. Rekenen is leuk.');
for (const name of ['Quiz', 'Werkblad', 'Exit-ticket', 'Flitskaarten', 'Koppelspel']) {
  const btn = page.getByRole('button', { name, exact: true });
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
}
await page.getByRole('button', { name: /^Genereer/ }).click();
await page.waitForTimeout(1000);
await page.getByRole('heading', { name: 'Bewaren' }).waitFor({ timeout: 60000 });
const checks = [];
const check = (naam, ok) => { checks.push([naam, ok]); console.log(`${ok ? '✓' : '✗'} ${naam}`); };
const widgetsInPreview = () => page.locator('input[type=checkbox][aria-label$="bewaren"]').count();
const retryButtons = () => page.getByRole('button', { name: /Opnieuw proberen/ }).count();
if (MODE === 'fout') {
  check('vier soorten in de voorvertoning, één mislukt', (await widgetsInPreview()) === 4 && (await retryButtons()) === 1);
  await page.getByRole('button', { name: /Opnieuw proberen/ }).first().click();
  await page.waitForTimeout(3500);
  check('na opnieuw proberen alle vijf, geen foutkaart meer', (await widgetsInPreview()) === 5 && (await retryButtons()) === 0);
} else {
  check('alle vijf soorten in de voorvertoning', (await widgetsInPreview()) === 5);
}
const starts = log.map((l) => Number(/start (\d+)/.exec(l)[1])).sort((a, b) => a - b);
const maxTegelijk = Math.max(...starts.map((s) => starts.filter((x) => x >= s && x < s + 1500).length));
check('hoogstens drie aanvragen tegelijk', maxTegelijk <= 3);
check('één aanvraag per soort', log.filter((l) => l.includes('+')).length === 0);
check('geen paginafouten', errs.length === 0);
console.log(log.join('\n'));
await browser.close();
const mislukt = checks.filter(([, ok]) => !ok);
console.log(mislukt.length ? `\n${mislukt.length} CONTROLE(S) MISLUKT` : '\nALLE CHECKS GESLAAGD ✓');
process.exit(mislukt.length ? 1 : 0);
