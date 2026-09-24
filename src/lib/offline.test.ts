import { describe, expect, it, vi } from 'vitest';
import { chunkFailureAction, isChunkLoadError, isOfflineError, offlineError, probeOnline, reloadFlag } from './offline';

describe('isChunkLoadError', () => {
  it('herkent de meldingen van Chrome, Firefox, Safari en Vite', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Layout-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
  });

  it('een gewone fout in een pagina is geen chunkfout', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({ status: 404 })).toBe(false);
  });

  it('een offline-fout telt als chunkfout', () => {
    expect(isChunkLoadError(offlineError('Offline: Layout'))).toBe(true);
  });
});

describe('offlineError', () => {
  it('is een Error met merkteken en bewaart de oorspronkelijke fout', () => {
    const cause = new TypeError('Failed to fetch dynamically imported module');
    const err = offlineError('Offline: Layout', cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OfflineError');
    expect(isOfflineError(err)).toBe(true);
    expect((err as Error & { original: unknown }).original).toBe(cause);
  });

  it('andere waarden zijn geen offline-fout', () => {
    expect(isOfflineError(new Error('x'))).toBe(false);
    expect(isOfflineError('offline')).toBe(false);
    expect(isOfflineError({ offline: 'ja' })).toBe(false);
    expect(isOfflineError(null)).toBe(false);
  });
});

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('reloadFlag', () => {
  it('lezen, zetten en wissen', () => {
    const s = memoryStorage();
    expect(reloadFlag(s, 'k', 'read')).toBe('unset');
    expect(reloadFlag(s, 'k', 'set')).toBe('set');
    expect(reloadFlag(s, 'k', 'read')).toBe('set');
    expect(reloadFlag(s, 'k', 'clear')).toBe('unset');
  });

  it('zonder opslag: unavailable', () => {
    expect(reloadFlag(null, 'k', 'read')).toBe('unavailable');
    expect(reloadFlag(null, 'k', 'set')).toBe('unavailable');
    expect(reloadFlag(null, 'k', 'clear')).toBe('unavailable');
  });

  it('opslag die gooit (privévenster, quota): unavailable, nooit een uitzondering', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    const s = { getItem: boom, setItem: boom, removeItem: boom };
    expect(reloadFlag(s, 'k', 'read')).toBe('unavailable');
    expect(reloadFlag(s, 'k', 'set')).toBe('unavailable');
    expect(reloadFlag(s, 'k', 'clear')).toBe('unavailable');
  });

  it('een schrijfactie die stil niets bewaart, telt niet als gezet', () => {
    const s = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(reloadFlag(s, 'k', 'set')).toBe('unset');
  });
});

describe('chunkFailureAction', () => {
  it('offline: nooit herladen, altijd de offline-melding', () => {
    expect(chunkFailureAction(false, 'unset')).toBe('offline');
    expect(chunkFailureAction(false, 'set')).toBe('offline');
    expect(chunkFailureAction(false, 'unavailable')).toBe('offline');
  });

  it('online en nog niet herladen: één keer herladen', () => {
    expect(chunkFailureAction(true, 'unset')).toBe('reload');
  });

  it('online maar al herladen, of de vlag is niet te bewaren: foutmelding (geen lus)', () => {
    expect(chunkFailureAction(true, 'set')).toBe('error');
    expect(chunkFailureAction(true, 'unavailable')).toBe('error');
  });
});

describe('probeOnline', () => {
  it('navigator.onLine === false: meteen offline, zonder verzoek', async () => {
    const f = vi.fn();
    expect(await probeOnline('https://x/Boosterz/', false, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('eender welk antwoord (ook 404) = online; HEAD en langs de cache heen', async () => {
    const f = vi.fn(async () => ({ status: 404 }));
    expect(await probeOnline('https://x/Boosterz/', true, f)).toBe(true);
    expect(f).toHaveBeenCalledWith('https://x/Boosterz/', { method: 'HEAD', cache: 'no-store' });
  });

  it('netwerkfout = offline', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await probeOnline('https://x/', true, f)).toBe(false);
  });

  it('fetch die synchroon gooit = offline', async () => {
    const f = vi.fn(() => {
      throw new TypeError('kapot');
    });
    expect(await probeOnline('https://x/', true, f)).toBe(false);
  });

  it('hangend netwerk (wifi zonder internet): offline na de time-out', async () => {
    const f = vi.fn(() => new Promise<unknown>(() => {}));
    const t0 = Date.now();
    expect(await probeOnline('https://x/', true, f, 30)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
