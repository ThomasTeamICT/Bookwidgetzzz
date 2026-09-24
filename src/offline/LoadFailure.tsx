import React, { useEffect, useState } from 'react';
import { BrandMark } from '../components/Brand';
import { isChunkLoadError, isOfflineError, probeOnline } from '../lib/offline';

// ── Foutscherm wanneer een deel van de app niet laadt ──────────────────────
//
// Twee gevallen, twee boodschappen:
//  - geen netwerk en dit deel werd op dit toestel nog nooit geopend (dus niet
//    bewaard door de service worker): een rustige offline-melding;
//  - wel netwerk: waarschijnlijk een nieuwe versie; opnieuw laden helpt.
// "Opnieuw proberen" herlaadt pas als er echt netwerk is. Zonder netwerk en
// zonder service worker zou herladen de foutpagina van de browser tonen.
//
// Dit component zit in de hoofdbundel (het moet offline kunnen verschijnen):
// houd het klein.

/** Is er echt verbinding? Een HEAD-verzoek naar de map van de app (zie probeOnline). */
export function isOnlineNow(): Promise<boolean> {
  return probeOnline(new URL('./', document.baseURI).href, navigator.onLine);
}

/** sessionStorage, of null wanneer de browser het weigert (privévenster, strenge instellingen). */
export function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

type View = 'checking' | 'offline' | 'error';

const soft = { color: 'var(--text-soft)' };
const title = { fontSize: '1.3rem' };

export function LoadFailure({ error }: { error: unknown }) {
  const [view, setView] = useState<View>(() =>
    isOfflineError(error) ? 'offline' : !isChunkLoadError(error) ? 'error' : navigator.onLine ? 'checking' : 'offline'
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Een chunk die niet laadt: eerst nagaan of er netwerk is. Terwijl de
  // offline-melding staat: melden wanneer de verbinding terug lijkt.
  useEffect(() => {
    let live = true;
    const back = () => setNote('De verbinding lijkt terug. Kies "Opnieuw proberen".');
    if (view === 'checking') void isOnlineNow().then((online) => live && setView(online ? 'error' : 'offline'));
    if (view === 'offline') window.addEventListener('online', back);
    return () => {
      live = false;
      window.removeEventListener('online', back);
    };
  }, [view]);

  const offline = view === 'offline';
  const retry = async () => {
    setBusy(true);
    setNote('');
    if (await isOnlineNow()) return window.location.reload();
    setBusy(false);
    setNote('Nog altijd geen verbinding. Probeer het zo meteen opnieuw.');
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: 20 }}>
      <div className="card card-pad" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
          <BrandMark size={48} pulse={view === 'checking'} />
        </div>
        {view !== 'checking' && (
          <>
            <h1 style={title}>{offline ? 'Je bent offline' : 'Er ging iets mis bij het laden'}</h1>
            <p style={soft}>
              {offline
                ? 'Dit deel van Boosterz werd op dit toestel nog niet geopend. Je antwoorden en materiaal blijven bewaard.'
                : 'Waarschijnlijk is er net een nieuwe versie van de app verschenen. Opnieuw laden lost dit meestal op.'}
            </p>
            <button className="btn btn-primary" onClick={offline ? () => void retry() : () => window.location.reload()} disabled={busy}>
              {!offline ? 'Opnieuw laden' : busy ? 'Even kijken…' : 'Opnieuw proberen'}
            </button>
          </>
        )}
        <p role="status" aria-live="polite" style={{ ...soft, margin: '12px 0 0' }}>
          {view === 'checking' ? 'Even kijken of er verbinding is…' : note}
        </p>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <a href="#/" style={{ ...soft, fontSize: '0.9rem' }}>← Naar de startpagina</a>
        </p>
      </div>
    </div>
  );
}
