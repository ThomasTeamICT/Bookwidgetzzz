// ── Gedeelde IndexedDB-toegang ──────────────────────────────────────────────
//
// Eén database ('wf-files') met één object store ('pdfs') voor álle blobs van
// de app: geüploade pdf's, ingeleverde leerlingbestanden én (sinds de
// media-migratie) afbeeldingen, audio en bijlagen uit widgets en cursussen.
// De records hebben dezelfde vorm; het id-voorvoegsel zegt wat het is
// (pdf's en inzendingen: uid(), media: 'm_…'). Eén store betekent geen
// versiebump en geen VersionError tussen modules die de db apart openen.

export const FILES_DB_NAME = 'wf-files';
export const FILES_STORE = 'pdfs';

export interface FileRecord {
  id: string;
  name: string;
  blob: Blob;
  size: number;
  createdAt: number;
}

export function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(FILES_DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FILES_STORE)) {
        req.result.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB geblokkeerd'));
  });
}

/** Eén verzoek in één transactie; de db gaat na afloop weer dicht. */
export function filesTx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openFilesDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let req: IDBRequest<T>;
        try {
          const t = db.transaction(FILES_STORE, mode);
          req = run(t.objectStore(FILES_STORE));
          t.oncomplete = () => db.close();
          t.onabort = () => { db.close(); reject(t.error); };
        } catch (e) {
          db.close();
          reject(e);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Sleutelbereik voor alle id's met een voorvoegsel (bv. 'm_'). */
export function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + '\uffff');
}

/** Hele bestandsdatabase weg (privacypagina: "alles wissen"). */
export function deleteFilesDb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(FILES_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
