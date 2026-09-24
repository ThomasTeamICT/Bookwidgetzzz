// Gedeelde opzet voor de AI-eind-tot-eindtest (tests/ai/run.mjs).
//
// De sleutel komt NOOIT uit de repo: uit $GEMINI_API_KEY (zo zet je hem in de
// omgevingsinstellingen van een cloudsessie) of uit het bestand in $AI_KEY_FILE.
// Hij wordt nergens gelogd.
//
// AI-verkeer via Node: in een cloudcontainer vertrouwt de testbrowser het
// certificaat van de netwerkproxy soms niet (verouderde certificaatopslag).
// Node vertrouwt het wel (NODE_EXTRA_CA_CERTS). Daarom onderschept de test de
// aanvragen naar de AI-aanbieders en voert ze uit met Node's fetch, mét
// volledige TLS-controle. Lokaal, zonder proxy, gaat alles gewoon rechtstreeks.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const AI_HOSTS = /^https:\/\/(generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.openai\.com)\//;

export function readKey() {
  const k = process.env.GEMINI_API_KEY || (process.env.AI_KEY_FILE && fs.readFileSync(process.env.AI_KEY_FILE, 'utf8'));
  if (!k || !k.trim()) throw new Error('Geen sleutel: zet GEMINI_API_KEY of AI_KEY_FILE.');
  return k.trim();
}

const FORWARD_HEADERS = /^(content-type|authorization|x-goog-api-key|x-api-key|anthropic-[a-z-]+|accept)$/i;

async function viaNode(route) {
  const req = route.request();
  const origin = req.headers()['origin'] || BASE;
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => FORWARD_HEADERS.test(k)));
  try {
    const res = await fetch(req.url(), { method: req.method(), headers, body: req.postDataBuffer() ?? undefined });
    const body = Buffer.from(await res.arrayBuffer());
    const out = { ...cors };
    for (const [k, v] of res.headers) if (!/^(content-encoding|content-length|transfer-encoding|access-control-)/i.test(k)) out[k] = v;
    return route.fulfill({ status: res.status, headers: out, body });
  } catch (e) {
    return route.abort('failed');
  }
}

/**
 * Start de browser met AI-instellingen voor Gemini op een vers toestel.
 * `seedAI: false` slaat het voorzetten van wf.ai.v1 helemaal over — nodig voor
 * de instellingenflow, die zelf vanaf een lege opslag door het formulier gaat.
 */
export async function startBrowser({ model = 'gemini-3.7-flash', seedAI = true } = {}) {
  const key = readKey();
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  if (process.env.HTTPS_PROXY) await context.route(AI_HOSTS, viaNode);
  if (seedAI) {
    await context.addInitScript(([k, m]) => {
      if (!localStorage.getItem('wf.ai.v1')) localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: k, model: m }));
    }, [key, model]);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/ERR_CERT_AUTHORITY_INVALID/.test(t)) return; // Google Fonts in de testomgeving
    errors.push(`console: ${t.slice(0, 300)}`);
  });
  return { browser, context, page, errors, key };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wacht tot een AI-aanvraag klaar is: het gebruikslog groeit, of er verschijnt
 * een fout (AIErrorBox: role="alert", of een foutmelding-toast). Dat laatste
 * was hier lang alleen een belofte in dit commentaar, geen code — een AI-fout
 * die de app zelf al meteen keurig toont (bv. een 503 van de aanbieder) liet de
 * test toch de volle `timeout` blind uitzitten voor ze het als mislukt meldde,
 * met een nietszeggende "Timeout exceeded" i.p.v. de echte oorzaak. `skipErrorCheck`
 * (gezet door runAIStep als er al vóór de klik een fout op het scherm stond,
 * bv. bij een "Opnieuw proberen") schakelt die kortere weg uit, want dan is een
 * bestaande fout geen signaal dat DEZE aanroep al klaar is.
 */
export async function waitForAI(page, before, { timeout = 240000, skipErrorCheck = false } = {}) {
  await page.waitForFunction(({ n, skipErrorCheck }) => {
    try {
      if (JSON.parse(localStorage.getItem('wf.aiusage.v1') || '[]').length > n) return true;
    } catch { /* leest niet, dan maar op de fouttekst vertrouwen */ }
    return !skipErrorCheck && document.querySelector('[role="alert"], .toast-err') !== null;
  }, { n: before, skipErrorCheck }, { timeout });
}

export async function usageCount(page) {
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem('wf.aiusage.v1') || '[]').length; } catch { return 0; } });
}

export async function lastUsage(page) {
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem('wf.aiusage.v1') || '[]')[0] ?? null; } catch { return null; } });
}

/** Resultaatregister: één regel per controle, en een samenvatting op het einde. */
export function makeReport() {
  const rows = [];
  return {
    rows,
    check(flow, name, ok, detail = '') {
      rows.push({ flow, name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
      console.log(`  ${ok ? '✓' : '✗ FAIL:'} ${name}${detail && !ok ? ` — ${String(detail).slice(0, 200)}` : ''}`);
    },
  };
}
