import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectMediaRefs, configureMediaStore, dataUrlToBlob, findLargeDataUrls, inlineMedia, mediaStats,
  MEDIA_REF_PREFIX, migrateDataUrls, parseWithMedia, preloadMedia, pruneOrphanMedia, replaceMedia,
  resolveMediaRef, storeMedia, stringifyWithMedia, type MediaBackend,
} from './mediaStore';
import type { FileRecord } from './idb';

// ── Testomgeving: geheugen-IndexedDB, nep-localStorage, nep-blob-URL's ──────

function memoryBackend(seed: FileRecord[] = []) {
  const map = new Map<string, FileRecord>(seed.map((r) => [r.id, r]));
  const backend: MediaBackend = {
    getAll: async () => [...map.values()],
    get: async (id) => map.get(id),
    put: async (rec) => { map.set(rec.id, rec); },
    delete: async (id) => { map.delete(id); },
    clear: async () => { map.clear(); },
  };
  return { backend, map };
}

function memoryStorage(init: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(init));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

let urlCounter = 0;
const urlToBlob = new Map<string, Blob>();
function setup(opts: { records?: FileRecord[]; storage?: Record<string, string> } = {}) {
  const { backend, map } = memoryBackend(opts.records);
  const storage = memoryStorage(opts.storage);
  urlToBlob.clear();
  configureMediaStore({
    backend,
    storage: () => storage,
    createObjectUrl: (blob) => {
      const url = `blob:test/${++urlCounter}`;
      urlToBlob.set(url, blob);
      return url;
    },
    revokeObjectUrl: () => {},
  });
  return { backend, map, storage };
}

/** Een base64-data-URL van precies `bytes` bytes (png-mimetype, inhoud willekeurig maar deterministisch). */
function fakeDataUrl(bytes: number, seed = 1): string {
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) arr[i] = (i * 31 + seed * 7) & 0xff;
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(bin)}`;
}

async function blobText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

beforeEach(() => {
  setup();
});

// ── Data-URL's ──────────────────────────────────────────────────────────────

describe('dataUrlToBlob', () => {
  it('decodeert een base64-data-URL naar een blob met het juiste mimetype', async () => {
    const blob = dataUrlToBlob('data:text/plain;base64,' + btoa('hallo'));
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('text/plain');
    expect(await blobText(blob!)).toBe('hallo');
  });

  it('weigert een data-URL zonder base64 en gewone URL\'s', () => {
    expect(dataUrlToBlob('data:image/svg+xml;utf8,<svg/>')).toBeNull();
    expect(dataUrlToBlob('https://example.org/foto.png')).toBeNull();
  });
});

describe('findLargeDataUrls', () => {
  it('vindt alleen hele JSON-stringwaarden die een grote data-URL zijn', () => {
    const big = fakeDataUrl(3000);
    const small = fakeDataUrl(100);
    const raw = JSON.stringify({ a: big, b: small, c: `zie ${big}`, d: [big] });
    expect(findLargeDataUrls(raw)).toEqual([big]);
  });

  it('geeft niets terug zonder base64 in de tekst', () => {
    expect(findLargeDataUrls('{"a":"blob:x"}')).toEqual([]);
  });
});

// ── Bewaren, lezen, schrijven ───────────────────────────────────────────────

describe('storeMedia + reviver/replacer', () => {
  it('geeft dezelfde URL voor dezelfde inhoud (inhoudsgebaseerd id) en bewaart één record', async () => {
    const { map } = setup();
    const a = await storeMedia(new Blob(['abc'], { type: 'text/plain' }), 'a.txt');
    const b = await storeMedia(new Blob(['abc'], { type: 'text/plain' }), 'b.txt');
    expect(a).toBe(b);
    expect(map.size).toBe(1);
    expect([...map.keys()][0]).toMatch(/^m_[0-9a-f]{32}$/);
  });

  it('schrijft blob:-URL\'s als verwijzing weg en leest ze weer als blob:-URL', async () => {
    setup();
    const url = await storeMedia(new Blob(['png']));
    const json = stringifyWithMedia({ title: 'x', config: { imageUrl: url, items: [{ img: url }] } });
    expect(json).not.toContain('blob:');
    const refs = collectMediaRefs(json);
    expect(refs.size).toBe(1);
    const back = parseWithMedia<{ config: { imageUrl: string; items: { img: string }[] } }>(json);
    expect(back.config.imageUrl).toBe(url);
    expect(back.config.items[0].img).toBe(url);
  });

  it('laat onbekende blob:-URL\'s en gewone strings met rust', () => {
    expect(replaceMedia('', 'blob:onbekend')).toBe('blob:onbekend');
    expect(replaceMedia('', 'https://x/y.png')).toBe('https://x/y.png');
    expect(replaceMedia('', 42)).toBe(42);
  });

  it('geeft een onbekende verwijzing ongewijzigd terug (nooit een placeholder die bewaard zou worden)', async () => {
    setup();
    await preloadMedia();
    const ref = MEDIA_REF_PREFIX + 'm_bestaatniet';
    expect(resolveMediaRef(ref)).toBe(ref);
    // en dat blijft zo na de achtergrondpoging
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaRef(ref)).toBe(ref);
  });

  it('laadt een verwijzing die pas later in de achterkant verschijnt bij (ander tabblad)', async () => {
    const { map } = setup();
    await preloadMedia();
    const rec: FileRecord = { id: 'm_later', name: '', blob: new Blob(['x']), size: 1, createdAt: Date.now() };
    map.set(rec.id, rec);
    const ref = MEDIA_REF_PREFIX + 'm_later';
    expect(resolveMediaRef(ref)).toBe(ref); // nog niet in het geheugen: achtergrondlading gestart
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaRef(ref)).toMatch(/^blob:/);
  });

  it('preload brengt bestaande records in het geheugen', async () => {
    setup({ records: [{ id: 'm_1', name: 'a', blob: new Blob(['aaaa']), size: 4, createdAt: 1 }] });
    await preloadMedia();
    expect(resolveMediaRef(MEDIA_REF_PREFIX + 'm_1')).toMatch(/^blob:/);
    expect(mediaStats()).toEqual({ count: 1, bytes: 4 });
  });
});

// ── Inline voor delen ───────────────────────────────────────────────────────

describe('inlineMedia', () => {
  it('maakt van blob:-URL\'s en verwijzingen weer data-URL\'s, in een diepe kopie', async () => {
    setup();
    const url = await storeMedia(new Blob(['hallo'], { type: 'text/plain' }));
    const ref = stringifyWithMedia(url).slice(1, -1);
    const src = { a: url, b: { c: [ref, 'tekst'] }, n: 3 };
    const out = await inlineMedia(src);
    expect(out).not.toBe(src);
    expect(out.a).toBe('data:text/plain;base64,' + btoa('hallo'));
    expect(out.b.c[0]).toBe(out.a);
    expect(out.b.c[1]).toBe('tekst');
    expect(out.n).toBe(3);
    expect(src.a).toBe(url); // origineel onaangeroerd
  });

  it('laat een verwijzing zonder blob ongewijzigd', async () => {
    setup();
    await preloadMedia();
    const out = await inlineMedia({ x: MEDIA_REF_PREFIX + 'm_weg' });
    expect(out.x).toBe(MEDIA_REF_PREFIX + 'm_weg');
  });
});

// ── Migratie van bestaande opslag ───────────────────────────────────────────

describe('migrateDataUrls', () => {
  it('verhuist grote data-URL\'s naar de achterkant en laat kleine staan', async () => {
    const big = fakeDataUrl(4000);
    const small = fakeDataUrl(64);
    const widgets = [{ id: 'w1', config: { imageUrl: big, icon: small, pairs: [{ img: big }] } }];
    const { map, storage } = setup({ storage: { 'wf.widgets.v1': JSON.stringify(widgets) } });
    const moved = await migrateDataUrls(['wf.widgets.v1']);
    expect(moved).toBe(1); // één unieke data-URL, op twee plaatsen
    expect(map.size).toBe(1);
    const raw = storage.getItem('wf.widgets.v1')!;
    expect(raw).not.toContain(big);
    expect(raw).toContain(small);
    expect(collectMediaRefs(raw).size).toBe(1);
    // en na het lezen staat er weer iets bruikbaars
    const back = parseWithMedia<typeof widgets>(raw);
    expect(back[0].config.imageUrl).toMatch(/^blob:/);
    expect(back[0].config.pairs[0].img).toBe(back[0].config.imageUrl);
    // de bytes kloppen
    const blob = [...map.values()][0].blob;
    const original = dataUrlToBlob(big)!;
    expect(await blob.arrayBuffer()).toEqual(await original.arrayBuffer());
  });

  it('overschrijft geen tussentijdse wijziging: vervangt exact de strings in de verse inhoud', async () => {
    const big = fakeDataUrl(4000);
    setup();
    // Eigen opslag met een haakje: tussen de eerste lezing en het terugschrijven
    // komt een autosave binnen die een nieuwe titel wegschrijft (en de data-URL
    // nog even houdt). Die titel mag de migratie niet overschrijven.
    let injected = false;
    const data = new Map<string, string>([['wf.widgets.v1', JSON.stringify([{ id: 'w1', title: 'oud', img: big }])]]);
    const hooked = {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => {
        const v = data.get(k) ?? null;
        if (!injected && v) {
          injected = true;
          // tussen de eerste lezing en het terugschrijven komt een autosave binnen
          data.set(k, JSON.stringify([{ id: 'w1', title: 'nieuw', img: big }]));
        }
        return v;
      },
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
      clear: () => data.clear(),
    } as Storage;
    configureMediaStore({ storage: () => hooked });
    await migrateDataUrls(['wf.widgets.v1']);
    const raw = data.get('wf.widgets.v1')!;
    expect(raw).toContain('"nieuw"');
    expect(raw).not.toContain(big);
  });

  it('de replacer kent een verhuisde data-URL, zodat een editor met de oude waarde in het geheugen geen ping-pong veroorzaakt', async () => {
    const big = fakeDataUrl(4000);
    setup({ storage: { 'wf.widgets.v1': JSON.stringify([{ img: big }]) } });
    await migrateDataUrls(['wf.widgets.v1']);
    const json = stringifyWithMedia({ img: big });
    expect(json).not.toContain(big);
    expect(collectMediaRefs(json).size).toBe(1);
  });
});

// ── Wezen opruimen ──────────────────────────────────────────────────────────

describe('pruneOrphanMedia', () => {
  it('verwijdert oude blobs zonder verwijzing, maar nooit jonge of gebruikte', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    const { map } = setup({
      records: [
        { id: 'm_used', name: '', blob: new Blob(['a']), size: 1, createdAt: old },
        { id: 'm_orphan', name: '', blob: new Blob(['b']), size: 1, createdAt: old },
        { id: 'm_fresh', name: '', blob: new Blob(['c']), size: 1, createdAt: Date.now() },
      ],
      storage: {
        'wf.widgets.v1': JSON.stringify([{ img: MEDIA_REF_PREFIX + 'm_used' }]),
        'wf.autosave.x.y': JSON.stringify({ answers: {} }),
      },
    });
    const removed = await pruneOrphanMedia();
    expect(removed).toBe(1);
    expect([...map.keys()].sort()).toEqual(['m_fresh', 'm_used']);
  });

  it('beperkt zich tot `only` (na het verwijderen van één widget)', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    const { map } = setup({
      records: [
        { id: 'm_a', name: '', blob: new Blob(['a']), size: 1, createdAt: old },
        { id: 'm_b', name: '', blob: new Blob(['b']), size: 1, createdAt: old },
      ],
      storage: {},
    });
    expect(await pruneOrphanMedia({ only: ['m_a'] })).toBe(1);
    expect([...map.keys()]).toEqual(['m_b']);
  });

  it('gooit niets weg als de sjablonen of cursussen er nog naar verwijzen', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    const { map } = setup({
      records: [{ id: 'm_t', name: '', blob: new Blob(['t']), size: 1, createdAt: old }],
      storage: { 'wf.customtemplates.v1': JSON.stringify([{ widget: { config: { img: MEDIA_REF_PREFIX + 'm_t' } } }]) },
    });
    expect(await pruneOrphanMedia()).toBe(0);
    expect(map.size).toBe(1);
  });
});
