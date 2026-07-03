import LZString from 'lz-string';
import type { Submission, Widget } from './types';

/**
 * Delen van widgets:
 * 1. Via code (#/speel/CODE) — werkt binnen dezelfde browser/dezelfde opslag.
 * 2. Via draagbare link (#/open?d=...) — de volledige widget zit gecomprimeerd
 *    in de link zelf en werkt dus op elk toestel, zonder server.
 */

export function encodeWidgetToUrl(widget: Widget): string {
  const payload = JSON.stringify({ v: 1, w: widget });
  const compressed = LZString.compressToEncodedURIComponent(payload);
  const base = location.origin + location.pathname;
  return `${base}#/open?d=${compressed}`;
}

export function decodeWidgetFromParam(d: string): Widget | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(d);
    if (!json) return null;
    const payload = JSON.parse(json);
    if (!payload || payload.v !== 1 || !payload.w) return null;
    return payload.w as Widget;
  } catch {
    return null;
  }
}

export function playUrlForCode(code: string): string {
  const base = location.origin + location.pathname;
  return `${base}#/speel/${code}`;
}

/**
 * Resultaatcode: een leerling die thuis (via de draagbare link) werkte, kan zijn
 * inzending als gecomprimeerde code doorsturen; de leerkracht plakt die bij de
 * resultaten. Zo komt thuiswerk toch centraal terecht, zonder server.
 */
export function encodeSubmission(sub: Submission): string {
  return 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(sub));
}

export function decodeSubmission(code: string): Submission | null {
  try {
    const raw = code.trim();
    if (!raw.startsWith('WF1.')) return null;
    const json = LZString.decompressFromEncodedURIComponent(raw.slice(4));
    if (!json) return null;
    const sub = JSON.parse(json) as Submission;
    if (!sub || typeof sub !== 'object' || !sub.widgetId || !sub.studentName || !sub.answers) return null;
    return sub;
  } catch {
    return null;
  }
}

export function exportWidgetJson(widget: Widget): string {
  return JSON.stringify({ app: 'widgetfabriek', v: 1, widget }, null, 2);
}

const FALLBACK_SETTINGS = {
  accentColor: '#4f46e5',
  shuffle: false,
  showFeedback: true,
  showScore: true,
  timeLimitMin: 0,
  maxAttempts: 0,
  requireName: true,
  instructions: '',
};

export function importWidgetJson(json: string): Widget | null {
  try {
    const data = JSON.parse(json);
    const w = data?.widget ?? data;
    if (!w || typeof w !== 'object' || typeof w.type !== 'string') return null;
    if (!w.config || typeof w.config !== 'object') return null;
    // ontbrekende of kapotte velden aanvullen zodat spelen/bewerken niet crasht
    w.title = typeof w.title === 'string' && w.title.trim() ? w.title : 'Geïmporteerde widget';
    w.settings = { ...FALLBACK_SETTINGS, ...(typeof w.settings === 'object' && w.settings ? w.settings : {}) };
    w.folderId = typeof w.folderId === 'string' ? w.folderId : null;
    w.createdAt = typeof w.createdAt === 'number' ? w.createdAt : Date.now();
    w.updatedAt = Date.now();
    return w as Widget;
  } catch {
    return null;
  }
}

// ── Vakgroeppakketten: een hele map (met widgets) delen met collega's ────────

export interface FolderPackMeta {
  naam: string;
  auteur: string;
  /** ISO-datum van export. */
  datum: string;
  aantal: number;
}

export interface FolderPack {
  meta: FolderPackMeta;
  widgets: Widget[];
}

/**
 * Exporteert een map als vakgroeppakket (JSON). Het pakket bevat diepe kopieën
 * van de widgets, zodat latere wijzigingen het pakket niet meer beïnvloeden.
 */
export function exportFolderPack(folderName: string, widgets: Widget[], author: string): string {
  const copies = JSON.parse(JSON.stringify(widgets)) as Widget[];
  return JSON.stringify(
    {
      app: 'widgetfabriek',
      kind: 'pakket',
      v: 1,
      meta: {
        naam: folderName,
        auteur: author,
        datum: new Date().toISOString(),
        aantal: copies.length,
      },
      widgets: copies,
    },
    null,
    2
  );
}

/**
 * Leest een vakgroeppakket defensief in: kapotte widgets worden overgeslagen,
 * ontbrekende velden aangevuld (zoals importWidgetJson dat doet).
 * Geeft null terug als het geen pakketbestand is.
 */
export function importFolderPack(json: string): FolderPack | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || data.kind !== 'pakket') return null;
    if (!Array.isArray(data.widgets)) return null;

    const widgets: Widget[] = [];
    for (const raw of data.widgets as unknown[]) {
      const w = raw as Record<string, unknown> | null;
      if (!w || typeof w !== 'object' || typeof w.type !== 'string') continue;
      if (!w.config || typeof w.config !== 'object') continue;
      w.title = typeof w.title === 'string' && w.title.trim() ? w.title : 'Geïmporteerde widget';
      w.settings = { ...FALLBACK_SETTINGS, ...(typeof w.settings === 'object' && w.settings ? w.settings : {}) };
      w.folderId = typeof w.folderId === 'string' ? w.folderId : null;
      w.createdAt = typeof w.createdAt === 'number' ? w.createdAt : Date.now();
      w.updatedAt = Date.now();
      widgets.push(w as unknown as Widget);
    }

    const m = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>;
    const meta: FolderPackMeta = {
      naam: typeof m.naam === 'string' && m.naam.trim() ? m.naam.trim() : 'Pakket',
      auteur: typeof m.auteur === 'string' ? m.auteur : '',
      datum: typeof m.datum === 'string' ? m.datum : '',
      aantal: widgets.length,
    };
    return { meta, widgets };
  } catch {
    return null;
  }
}
