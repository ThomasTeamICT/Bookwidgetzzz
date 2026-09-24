import { beforeEach, describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { askAI, effectiveMaxTokens, getAISettings, PROVIDER_INFO, readSSE, saveAISettings } from './ai';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

describe('AI-instellingen: modellen', () => {
  it('biedt geen Gemini-model aan dat de API niet kent', () => {
    const ids = PROVIDER_INFO.gemini.models.map((m) => m.id);
    expect(ids).not.toContain('gemini-3.1-pro');
    expect(ids).toContain('gemini-pro-latest');
  });

  it('schuift een bewaard, verdwenen model door naar zijn opvolger', () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.1-pro' });
    expect(getAISettings().model).toBe('gemini-pro-latest');
  });

  it('laat een geldig bewaard model met rust', () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.7-flash' });
    expect(getAISettings().model).toBe('gemini-3.7-flash');
  });
});

describe('readSSE', () => {
  function streamOf(chunks: string[]): Response {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({
      start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
    }));
  }

  it('leest data-regels, ook over stukgeknipte chunks heen', async () => {
    const got: string[] = [];
    await readSSE(streamOf(['data: {"a":', '1}\n\nda', 'ta: [DONE]\n']), (d) => got.push(d));
    expect(got).toEqual(['{"a":1}', '[DONE]']);
  });

  it('verliest de laatste regel niet als de stroom zonder regeleinde stopt', async () => {
    const got: string[] = [];
    await readSSE(streamOf(['data: {"x":1}\n\n', 'data: {"usage":{"prompt_tokens":5}}']), (d) => got.push(d));
    expect(got).toEqual(['{"x":1}', '{"usage":{"prompt_tokens":5}}']);
  });
});

describe('effectiveMaxTokens', () => {
  it('geeft Gemini ruimte voor het denkwerk: minstens 8192, het dubbele van de vraag, hoogstens 65.536', () => {
    expect(effectiveMaxTokens('gemini', 250)).toBe(8192);
    expect(effectiveMaxTokens('gemini', 16000)).toBe(32000);
    expect(effectiveMaxTokens('gemini', 32000)).toBe(64000);
    expect(effectiveMaxTokens('gemini', 50000)).toBe(65536);
    expect(effectiveMaxTokens('gemini', undefined)).toBe(32000);
  });
  it('laat andere aanbieders ongemoeid', () => {
    expect(effectiveMaxTokens('anthropic', 250)).toBe(250);
    expect(effectiveMaxTokens('openai', undefined)).toBe(16000);
  });
});

describe('askAI: afgekapte antwoorden', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function sse(lines: string[]): Response {
    const body = lines.map((l) => `data: ${l}\n\n`).join('');
    return new Response(body, { status: 200 });
  }

  it('Gemini: finish_reason "length" wordt een leesbare fout in plaats van een halve zin', async () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.7-flash' });
    const fetchMock = vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { content: 'Je bent al goed op weg, want je' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 80, completion_tokens: 9 } }),
      '[DONE]',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askAI({ prompt: 'p', task: 't', maxTokens: 250 })).rejects.toThrow(/afgekapt/);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(8192);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('Anthropic: stop_reason "max_tokens" wordt dezelfde fout', async () => {
    saveAISettings({ provider: 'anthropic', apiKey: 'x', model: 'claude-sonnet-5' });
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Half' } }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 250 } }),
    ])));
    await expect(askAI({ prompt: 'p', task: 't', maxTokens: 250 })).rejects.toThrow(/afgekapt/);
  });

  it('een normaal beëindigd antwoord komt gewoon terug', async () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.7-flash' });
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { content: 'Goed zo.' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).resolves.toBe('Goed zo.');
  });
});
