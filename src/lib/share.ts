import LZString from 'lz-string';
import type { Widget } from './types';

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

export function exportWidgetJson(widget: Widget): string {
  return JSON.stringify({ app: 'widgetfabriek', v: 1, widget }, null, 2);
}

export function importWidgetJson(json: string): Widget | null {
  try {
    const data = JSON.parse(json);
    const w = data?.widget ?? data;
    if (!w || typeof w !== 'object' || !w.type || !w.config) return null;
    return w as Widget;
  } catch {
    return null;
  }
}
