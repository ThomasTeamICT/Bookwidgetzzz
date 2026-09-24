import { describe, expect, it } from 'vitest';
import { runBatch } from './aiBatch';
import type { BatchProgress } from './aiBatch';

/** Wacht `ms` milliseconden (echte timers — de suite draait niet met fake timers). */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runBatch', () => {
  it('geeft resultaten terug in de volgorde van ids, ook als ze niet in die volgorde afronden', async () => {
    const delays: Record<string, number> = { a: 30, b: 5, c: 15 };
    const outcome = await runBatch({
      ids: ['a', 'b', 'c'],
      concurrency: 3,
      run: async (id) => {
        await wait(delays[id]);
        return `resultaat-${id}`;
      },
    });
    expect(outcome.results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(outcome.results.map((r) => r.value)).toEqual(['resultaat-a', 'resultaat-b', 'resultaat-c']);
    expect(outcome.errors).toEqual([]);
    expect(outcome.canceled).toBe(false);
  });

  it('houdt de gelijktijdigheid binnen de opgegeven grens (≤ 3)', async () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7'];
    let current = 0;
    let max = 0;
    await runBatch({
      ids,
      concurrency: 3,
      run: async () => {
        current++;
        max = Math.max(max, current);
        await wait(10);
        current--;
        return 'ok';
      },
    });
    expect(max).toBeLessThanOrEqual(3);
    // met 7 items en een grens van 3 moet de grens ook echt bereikt worden
    expect(max).toBe(3);
  });

  it('laat de andere items intact als er precies één mislukt', async () => {
    const outcome = await runBatch({
      ids: ['quiz', 'worksheet', 'exitticket'],
      concurrency: 3,
      run: async (id) => {
        if (id === 'worksheet') throw new Error('onvolledig antwoord');
        return `widgets-${id}`;
      },
    });
    expect(outcome.results.map((r) => r.id)).toEqual(['quiz', 'exitticket']);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]).toMatchObject({ id: 'worksheet' });
    expect(outcome.errors[0].error.message).toBe('onvolledig antwoord');
    expect(outcome.canceled).toBe(false);
  });

  it('meldt statusovergangen per item via onProgress: wachten → bezig → klaar/mislukt', async () => {
    const seen: BatchProgress<'a' | 'b'>[] = [];
    await runBatch<'a' | 'b', string>({
      ids: ['a', 'b'],
      concurrency: 2,
      run: async (id) => {
        if (id === 'b') throw new Error('nope');
        await wait(5);
        return 'ok';
      },
      onProgress: (p) => seen.push(p),
    });
    const forA = seen.filter((p) => p.id === 'a').map((p) => p.status);
    const forB = seen.filter((p) => p.id === 'b').map((p) => p.status);
    expect(forA).toEqual(['wachten', 'bezig', 'klaar']);
    expect(forB).toEqual(['wachten', 'bezig', 'mislukt']);
  });

  it('annuleren stopt nog niet gestarte items en meldt canceled', async () => {
    const ctrl = new AbortController();
    const started: string[] = [];
    const outcome = await runBatch({
      ids: ['a', 'b', 'c', 'd', 'e'],
      concurrency: 2,
      signal: ctrl.signal,
      run: async (id, signal) => {
        started.push(id);
        if (id === 'a') ctrl.abort(); // annuleer zodra het eerste item start
        await wait(5);
        if (signal.aborted) throw new DOMException('Geannuleerd', 'AbortError');
        return `ok-${id}`;
      },
    });
    expect(outcome.canceled).toBe(true);
    // Alleen 'a' was al onderweg vóór de annulering; de rest wordt nooit
    // gestart (elke andere baan ziet het afgebroken signaal meteen bij zijn
    // eerste beurt uit de wachtrij, nog voor die 'run' aanroept).
    expect(started).toEqual(['a']);
    expect(outcome.results).toEqual([]);
    expect(outcome.errors).toHaveLength(5);
    expect(outcome.errors.every((e) => e.error.name === 'AbortError')).toBe(true);
  });

  it('een lege signal-annulering vóór de start annuleert alle items meteen', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let calls = 0;
    const outcome = await runBatch({
      ids: ['a', 'b'],
      concurrency: 2,
      signal: ctrl.signal,
      run: async () => { calls++; return 'ok'; },
    });
    expect(calls).toBe(0);
    expect(outcome.canceled).toBe(true);
    expect(outcome.errors).toHaveLength(2);
    expect(outcome.errors.every((e) => e.error.name === 'AbortError')).toBe(true);
  });

  it('opnieuw proberen: een tweede runBatch-aanroep met alleen het mislukte id kan alsnog slagen', async () => {
    let attempt = 0;
    const run = async (id: string) => {
      if (id === 'worksheet' && attempt === 0) {
        attempt++;
        throw new Error('onvolledig antwoord');
      }
      return `widgets-${id}`;
    };
    const first = await runBatch({ ids: ['quiz', 'worksheet'], concurrency: 2, run });
    expect(first.errors.map((e) => e.id)).toEqual(['worksheet']);

    const failedIds = first.errors.map((e) => e.id);
    const retry = await runBatch({ ids: failedIds, concurrency: 1, run });
    expect(retry.errors).toEqual([]);
    expect(retry.results).toEqual([{ id: 'worksheet', value: 'widgets-worksheet' }]);
  });
});
