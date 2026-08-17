// ── Pdf-opslag in IndexedDB ─────────────────────────────────────────────────
//
// Pdf's zijn te groot voor localStorage (quota ±5 MB voor de héle app), dus
// bewaren we ze als Blob in IndexedDB — daar is doorgaans honderden MB ruimte.
// Widgets/cursussen verwijzen ernaar met een pdfId. Let op bij delen:
// een geüploade pdf zit in dít toestel; via de draagbare link reist hij NIET
// mee (te groot voor een URL). Wel mee: in het export-bestand (base64) als hij
// klein genoeg is, of via een openbare URL als bron.

const DB_NAME = 'wf-files';
const STORE = 'pdfs';

interface PdfRecord {
  id: string;
  name: string;
  blob: Blob;
  size: number;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export async function savePdf(id: string, name: string, blob: Blob): Promise<void> {
  const rec: PdfRecord = { id, name, blob, size: blob.size, createdAt: Date.now() };
  await tx('readwrite', (s) => s.put(rec));
}

export async function getPdf(id: string): Promise<{ name: string; blob: Blob } | null> {
  try {
    const rec = (await tx<PdfRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<PdfRecord | undefined>)) ?? null;
    return rec ? { name: rec.name, blob: rec.blob } : null;
  } catch {
    return null;
  }
}

export async function deletePdf(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* opruimen mag nooit iets blokkeren */
  }
}

/** Voor export naar een widget-/cursusbestand: pdf als data-URL (base64). */
export async function pdfToDataUrl(id: string): Promise<{ name: string; dataUrl: string } | null> {
  const rec = await getPdf(id);
  if (!rec) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(rec.blob);
  });
  return { name: rec.name, dataUrl };
}

/** Voor import uit een bestand: data-URL terug naar IndexedDB. */
export async function importPdfFromDataUrl(id: string, name: string, dataUrl: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await savePdf(id, name, blob);
    return true;
  } catch {
    return false;
  }
}

/** Menselijk leesbare bestandsgrootte. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
