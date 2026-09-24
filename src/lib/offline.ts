// ── Offline: pure hulpfuncties voor de pagina ──────────────────────────────
//
// De service worker (src/offline/serviceWorker.js) bewaart de app-schil en de
// chunks die al eens geladen werden. Wat nooit geladen werd, kan offline niet
// openen. Deze module beslist wat de app dan doet: herladen (er is een nieuwe
// versie), of een rustige offline-melding tonen (er is geen netwerk).
//
// Alles hier is puur of krijgt zijn afhankelijkheden mee, zodat het zonder
// browser te testen is (src/lib/offline.test.ts).

/**
 * Fout die aangeeft: dit deel van de app kon niet laden omdat er geen netwerk
 * is. Een gewone Error met een merkteken (geen klasse: dat houdt de hoofdbundel
 * kleiner). `original` is de fout van de import zelf.
 */
export function offlineError(message: string, original?: unknown): Error {
  return Object.assign(new Error(message), { name: 'OfflineError', offline: true, original });
}

export function isOfflineError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { offline?: unknown }).offline === true;
}

/**
 * Herkent een mislukte dynamische import (een lazy chunk) in de gangbare
 * browsers. De meldingen verschillen per engine:
 *  - Chrome/Edge: "Failed to fetch dynamically imported module: …"
 *  - Firefox: "error loading dynamically imported module: …"
 *  - Safari: "Importing a module script failed."
 *  - Vite (css van een chunk): "Unable to preload CSS for …"
 */
export function isChunkLoadError(err: unknown): boolean {
  if (isOfflineError(err)) return true;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /dynamically imported module|importing a module script failed|unable to preload css/i.test(msg);
}

/** De herlaadvlag in sessionStorage. 'unavailable' = de opslag is niet bruikbaar. */
export type ReloadFlag = 'set' | 'unset' | 'unavailable';

/**
 * Lees, zet of wis de herlaadvlag en geef de toestand daarna terug. Na 'set'
 * lezen we terug: alleen 'set' betekent dat de vlag echt bewaard is. Elke fout
 * van de opslag geeft 'unavailable', en dan herladen we nooit (geen lus).
 */
export function reloadFlag(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  key: string,
  op: 'read' | 'set' | 'clear'
): ReloadFlag {
  try {
    if (!storage) return 'unavailable';
    if (op === 'set') storage.setItem(key, '1');
    else if (op === 'clear') storage.removeItem(key);
    return storage.getItem(key) === '1' ? 'set' : 'unset';
  } catch {
    return 'unavailable';
  }
}

/**
 * Wat te doen wanneer een lazy chunk niet laadt?
 *  - geen netwerk: nooit herladen (dat eindigt in een lus of op de foutpagina
 *    van de browser), maar de offline-melding tonen;
 *  - wel netwerk en nog niet herladen: één keer herladen. Waarschijnlijk is er
 *    een nieuwe versie uitgerold en bestaat de oude chunk niet meer;
 *  - anders (al herladen, of de vlag kan niet bewaard worden): de foutmelding.
 *    Zonder bruikbare vlag nooit herladen: anders dreigt een eindeloze lus.
 */
export function chunkFailureAction(online: boolean, flag: ReloadFlag): 'offline' | 'reload' | 'error' {
  if (!online) return 'offline';
  if (flag === 'unset') return 'reload';
  return 'error';
}

type FetchLike = (input: string, init?: RequestInit) => Promise<unknown>;

/**
 * Is er echt netwerk? `navigator.onLine === false` is betrouwbaar, `true` niet:
 * een toestel dat met het schoolwifi verbonden is terwijl dat wifi zelf geen
 * internet heeft, meldt nog altijd `true`. Daarom een klein HEAD-verzoek naar
 * de app zelf, langs elke cache heen. De service worker laat HEAD-verzoeken
 * ongemoeid, dus dit gaat altijd naar het netwerk. Eender welk antwoord (ook
 * een 404) betekent: er is verbinding. Een fout of time-out: geen verbinding.
 */
export function probeOnline(url: string, onLine: boolean, doFetch: FetchLike = fetch, timeoutMs = 4000): Promise<boolean> {
  if (!onLine) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    Promise.resolve()
      .then(() => doFetch(url, { method: 'HEAD', cache: 'no-store' }))
      .then(() => resolve(true), () => resolve(false))
      .finally(() => clearTimeout(timer));
  });
}
