// ── AI-batchorkestratie: hoogstens N gelijktijdige AI-aanroepen ─────────────
//
// Eén megaprompt voor alle gevraagde widgetsoorten (of alle hoofdstukken van
// een cursus) tegelijk levert bij een groter aantal soorten/hoofdstukken al
// snel een afgekapt antwoord op: de tokenlimiet is dan voor iedereen samen.
// Deze module verdeelt zo'n taak in kleinere, onafhankelijke stukken (één
// aanroep per soort/hoofdstuk) en voert ze uit met hoogstens `concurrency`
// tegelijk — de rest wacht in een wachtrij.
//
// Puur en zonder React of fetch: de eigenlijke aanroep (`run`) wordt
// geïnjecteerd, zodat de orkestratie zelf zonder een echte AI-verbinding te
// testen is. Een mislukking van één item stopt de andere items niet; een
// afgebroken `signal` annuleert items die nog niet gestart zijn en laat
// reeds lopende aanroepen hun eigen reactie op diezelfde `signal` geven
// (bv. via fetch's AbortController-ondersteuning).
//
// "Opnieuw proberen" van één mislukt item is gewoon een nieuwe `runBatch`-
// aanroep met alleen dat ene id: er is geen aparte "retry"-API nodig.

export type BatchItemStatus = 'wachten' | 'bezig' | 'klaar' | 'mislukt' | 'geannuleerd';

export interface BatchProgress<Id extends string> {
  id: Id;
  status: BatchItemStatus;
}

export interface RunBatchOptions<Id extends string, R> {
  /** Te verwerken items, in de volgorde waarin ze starten (en de resultaten uitkomen). */
  ids: Id[];
  /** Hoeveel aanroepen hoogstens tegelijk lopen (minstens 1). */
  concurrency: number;
  /** De eigenlijke aanroep voor één item — injecteerbaar, dus testbaar zonder AI. */
  run: (id: Id, signal: AbortSignal) => Promise<R>;
  /** Statuswijziging per item, voor een voortgangsweergave in de UI. */
  onProgress?: (progress: BatchProgress<Id>) => void;
  /** Gedeeld over alle items: afbreken stopt lopende én nog te starten items. */
  signal?: AbortSignal;
}

export interface BatchResult<Id extends string, R> {
  /** Eén ingang per geslaagd item, in de volgorde van `ids` (niet van afronden). */
  results: { id: Id; value: R }[];
  /** Eén ingang per mislukt of geannuleerd item, in de volgorde van `ids`. */
  errors: { id: Id; error: Error }[];
  /** true als de aanroep als geheel afgebroken werd (het `signal` vuurde). */
  canceled: boolean;
}

class BatchAbortError extends Error {
  constructor() {
    super('Geannuleerd');
    this.name = 'AbortError';
  }
}

/**
 * Verwerkt `ids` met hoogstens `concurrency` gelijktijdige aanroepen van
 * `run`. Eén worker per "baan": zodra een aanroep klaar is (gelukt of niet),
 * pakt diezelfde baan meteen het volgende item uit de wachtrij — geen enkele
 * baan blijft stilstaan zolang er nog werk is.
 */
export async function runBatch<Id extends string, R>(opts: RunBatchOptions<Id, R>): Promise<BatchResult<Id, R>> {
  const { ids, run, onProgress, signal } = opts;
  const concurrency = Math.max(1, Math.min(opts.concurrency, ids.length || 1));
  const results: { id: Id; value: R }[] = [];
  const errors: { id: Id; error: Error }[] = [];
  let canceled = signal?.aborted ?? false;
  let cursor = 0;

  const setStatus = (id: Id, status: BatchItemStatus) => onProgress?.({ id, status });
  ids.forEach((id) => setStatus(id, 'wachten'));

  async function worker() {
    for (;;) {
      if (signal?.aborted) canceled = true;
      const i = cursor++;
      if (i >= ids.length) return;
      const id = ids[i];
      if (canceled) {
        setStatus(id, 'geannuleerd');
        errors.push({ id, error: new BatchAbortError() });
        continue;
      }
      setStatus(id, 'bezig');
      try {
        const value = await run(id, signal ?? new AbortController().signal);
        results.push({ id, value });
        setStatus(id, 'klaar');
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          canceled = true;
          setStatus(id, 'geannuleerd');
        } else {
          setStatus(id, 'mislukt');
        }
        errors.push({ id, error: e as Error });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // De volgorde van `results`/`errors` vastzetten op de invoervolgorde: workers
  // ronden niet per se in die volgorde af (de snelste baan haalt de langzame in).
  const order = new Map(ids.map((id, i) => [id, i]));
  results.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  errors.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  return { results, errors, canceled };
}
