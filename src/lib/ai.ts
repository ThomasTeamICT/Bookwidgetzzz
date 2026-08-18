// ── AI-laag: rechtstreeks vanuit de browser naar de AI-aanbieder ─────────────
//
// De app blijft 100% client-side: de leerkracht bewaart een eigen API-sleutel
// in de lokale opslag van dit toestel. Aanvragen gaan rechtstreeks van de
// browser naar de gekozen aanbieder; er zit geen eigen server tussen.

const SETTINGS_KEY = 'wf.ai.v1';
const USAGE_KEY = 'wf.aiusage.v1';

export type AIProviderId = 'anthropic' | 'openai' | 'gemini' | 'custom';

export interface AISettings {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  /** Alleen voor 'custom': OpenAI-compatibel basisadres, bv. https://openrouter.ai/api */
  baseUrl?: string;
}

export interface AIUsageEntry {
  at: number;
  /** Korte taakomschrijving, bv. "widgets uit bron" of "cursus uit leerplandoelen". */
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Gemaskeerde sleutel (bv. "AQ.…2NhQ") — zo zie je per sleutel het verbruik op dit toestel. */
  keyLabel?: string;
}

/** Maskeert een sleutel tot een herkenbaar maar onbruikbaar label. */
export function maskAIKey(key: string): string {
  const k = key.trim();
  if (!k) return '';
  if (k.length <= 8) return '••••••';
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

export const PROVIDER_INFO: Record<AIProviderId, { name: string; models: { id: string; label: string }[] }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — beste kwaliteit (aanbevolen)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — snel en voordelig' },
    ],
  },
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini — voordelig' },
    ],
  },
  gemini: {
    name: 'Google (Gemini)',
    models: [
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash — beste prijs-kwaliteit (aanbevolen)' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — zuinigst' },
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro — hoogste kwaliteit, duurder' },
    ],
  },
  custom: {
    name: 'Eigen aanbieder (OpenAI-compatibel)',
    models: [],
  },
};

const DEFAULT_SETTINGS: AISettings = { provider: 'anthropic', apiKey: '', model: 'claude-sonnet-5' };

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<AISettings>;
    return {
      provider: s.provider === 'openai' || s.provider === 'gemini' || s.provider === 'custom' ? s.provider : 'anthropic',
      apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
      model: typeof s.model === 'string' && s.model ? s.model : DEFAULT_SETTINGS.model,
      baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : undefined,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAISettings(s: AISettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function hasAIKey(): boolean {
  return getAISettings().apiKey.trim().length > 0;
}

// ── Gebruikslog (kostentransparantie) ────────────────────────────────────────

export function getAIUsage(): AIUsageEntry[] {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    return raw ? (JSON.parse(raw) as AIUsageEntry[]) : [];
  } catch {
    return [];
  }
}

function logUsage(entry: AIUsageEntry) {
  try {
    const all = getAIUsage();
    all.unshift(entry);
    localStorage.setItem(USAGE_KEY, JSON.stringify(all.slice(0, 200)));
  } catch {
    /* log is nice-to-have */
  }
}

export function clearAIUsage() {
  localStorage.removeItem(USAGE_KEY);
}

// ── Fouten ──────────────────────────────────────────────────────────────────

export class AIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AIError';
  }
}

function friendlyError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError('De API-sleutel is ongeldig of geeft geen toegang. Controleer de sleutel bij de AI-instellingen.', status);
  }
  if (status === 404) {
    return new AIError('Het gekozen model bestaat niet (meer) bij deze aanbieder. Kies een ander model bij de AI-instellingen.', status);
  }
  if (status === 429) {
    return new AIError('De aanbieder geeft aan dat de limiet bereikt is (te veel aanvragen of tegoed op). Probeer het zo dadelijk opnieuw.', status);
  }
  if (status === 529 || status === 503) {
    return new AIError('De AI-dienst is tijdelijk overbelast. Probeer het over een minuutje opnieuw.', status);
  }
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message ?? j?.message ?? '';
  } catch {
    detail = body.slice(0, 200);
  }
  return new AIError(`De AI-aanvraag mislukte (HTTP ${status}). ${detail}`.trim(), status);
}

// ── Kernaanroep met streaming ───────────────────────────────────────────────

export interface AskAIOptions {
  /** Systeeminstructie (rol/kader). */
  system?: string;
  /** De eigenlijke opdracht + bronmateriaal. */
  prompt: string;
  maxTokens?: number;
  /** Korte taaknaam voor de gebruikslog. */
  task: string;
  /** Wordt aangeroepen met elk stukje tekst zodra het binnenkomt. */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

/**
 * Stelt één vraag aan het geconfigureerde model en geeft de volledige
 * tekstuitvoer terug. Streamt tussentijds via onDelta zodat de leerkracht
 * ziet dat er gewerkt wordt. Gooit AIError met een leesbare uitleg.
 */
export async function askAI(opts: AskAIOptions): Promise<string> {
  const s = getAISettings();
  if (!s.apiKey.trim()) {
    throw new AIError('Er is nog geen API-sleutel ingesteld. Ga naar de AI-instellingen om er één toe te voegen.');
  }
  if (s.provider === 'anthropic') return askAnthropic(s, opts);
  return askOpenAICompatible(s, opts);
}

async function askAnthropic(s: AISettings, opts: AskAIOptions): Promise<string> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        // Nodig om rechtstreeks vanuit de browser te mogen aanroepen (CORS).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: s.model,
        max_tokens: opts.maxTokens ?? 8192,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
        stream: true,
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('Kon de AI-dienst niet bereiken. Controleer de internetverbinding (of een adblocker die api.anthropic.com blokkeert).');
  }
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ''));

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    await readSSE(res, (data) => {
      try {
        const ev = JSON.parse(data);
        if (ev.type === 'message_start') inputTokens = ev.message?.usage?.input_tokens ?? 0;
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          full += ev.delta.text;
          opts.onDelta?.(ev.delta.text);
        }
        if (ev.type === 'message_delta' && ev.usage?.output_tokens) outputTokens = ev.usage.output_tokens;
        if (ev.type === 'error') throw new AIError(ev.error?.message ?? 'De AI-dienst meldde een fout tijdens het genereren.');
      } catch (e) {
        if (e instanceof AIError) throw e;
        /* niet-JSON regels negeren */
      }
    });
  } finally {
    // Ook geannuleerde of halverwege mislukte aanvragen loggen: de
    // invoertokens zijn dan al aangerekend door de aanbieder.
    if (outputTokens === 0 && full) outputTokens = Math.round(full.length / 4);
    logUsage({ at: Date.now(), task: opts.task, model: s.model, inputTokens, outputTokens, keyLabel: maskAIKey(s.apiKey) });
  }
  return full;
}

async function askOpenAICompatible(s: AISettings, opts: AskAIOptions): Promise<string> {
  // Gemini spreekt hetzelfde OpenAI-compatibele protocol, maar op een eigen pad
  // (…/v1beta/openai/chat/completions — zonder extra /v1 ervoor).
  const base = (
    s.provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta/openai'
      : s.provider === 'custom' && s.baseUrl ? s.baseUrl : 'https://api.openai.com'
  ).replace(/\/+$/, '');
  const url = s.provider === 'gemini' ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${s.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: s.model,
        max_tokens: opts.maxTokens ?? 8192,
        messages: [
          ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: opts.prompt },
        ],
        stream: true,
        ...(s.provider === 'openai' ? { stream_options: { include_usage: true } } : {}),
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('Kon de AI-dienst niet bereiken. Controleer de internetverbinding en het basisadres van de aanbieder.');
  }
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ''));

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    await readSSE(res, (data) => {
      if (data === '[DONE]') return;
      try {
        const ev = JSON.parse(data);
        const delta = ev.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          full += delta;
          opts.onDelta?.(delta);
        }
        if (ev.usage) {
          inputTokens = ev.usage.prompt_tokens ?? inputTokens;
          outputTokens = ev.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        /* niet-JSON regels negeren */
      }
    });
  } finally {
    // Aanbieders zonder usage in de stream (of afgebroken streams): ruw
    // schatten op tekstlengte, zodat het logboek nooit stil onderrapporteert.
    if (outputTokens === 0 && full) outputTokens = Math.round(full.length / 4);
    logUsage({ at: Date.now(), task: opts.task, model: s.model, inputTokens, outputTokens, keyLabel: maskAIKey(s.apiKey) });
  }
  return full;
}

/** Leest een SSE-stroom en roept onData aan per "data:"-regel. */
async function readSSE(res: Response, onData: (data: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new AIError('De AI-dienst gaf een leeg antwoord.');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('data:')) onData(t.slice(5).trim());
    }
  }
}

// ── JSON uit modeluitvoer halen ─────────────────────────────────────────────

/**
 * Haalt het eerste JSON-object of de eerste JSON-array uit modeluitvoer.
 * Verdraagt ```json-hekken en tekst er omheen zónder de inhoud aan te raken:
 * de gebalanceerde scanner begint bij de eerste { of [ en respecteert
 * strings, dus backticks BINNEN stringwaarden blijven intact.
 */
export function extractJson(text: string): unknown {
  const raw = text.trim();
  // snelle poging: alles is al JSON
  try {
    return JSON.parse(raw);
  } catch {
    /* verder zoeken */
  }
  const start = raw.search(/[{[]/);
  if (start < 0) throw new AIError('De AI gaf geen bruikbare JSON terug. Probeer het opnieuw.');
  const open = raw[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          throw new AIError('De AI gaf JSON terug die niet ontleed kon worden. Probeer het opnieuw.');
        }
      }
    }
  }
  throw new AIError('De JSON in het AI-antwoord was onvolledig (mogelijk te lang afgekapt). Probeer het opnieuw of vraag minder tegelijk.');
}

/** Som van het gelogde gebruik, voor de instellingenpagina. */
export function usageTotals(): { calls: number; inputTokens: number; outputTokens: number } {
  const all = getAIUsage();
  return {
    calls: all.length,
    inputTokens: all.reduce((a, u) => a + u.inputTokens, 0),
    outputTokens: all.reduce((a, u) => a + u.outputTokens, 0),
  };
}
