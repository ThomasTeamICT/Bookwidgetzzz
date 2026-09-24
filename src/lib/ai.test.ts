import { beforeEach, describe, expect, it } from 'vitest';
import { getAISettings, PROVIDER_INFO, readSSE, saveAISettings } from './ai';

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
