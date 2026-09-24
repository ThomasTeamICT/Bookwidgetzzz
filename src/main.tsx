import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';
import { preloadMedia } from './lib/mediaStore';
import './styles/global.css';

initTheme();

// Offline-schil (src/offline/): alleen in de gebouwde app, en pas na `load`
// zodat het de eerste weergave niet vertraagt. `import.meta.url` is hier de
// URL van de hoofdbundel; daaruit volgen sw.js en de scope, zodat het werkt
// onder /Boosterz/ en onder / (lokale preview). Mislukt het: stil, de app
// werkt dan gewoon zonder offline-schil.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const entryUrl = import.meta.url;
  const register = () => {
    import('./offline/register')
      .then((m) => m.registerServiceWorker(entryUrl))
      .catch((err) => console.warn('Boosterz: offline-modus niet beschikbaar.', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

// Afbeeldingen, audio en bijlagen staan in IndexedDB (lib/mediaStore). Eén
// keer vooraf inladen — enkele milliseconden — zodat de eerste render meteen
// blob:-URL's krijgt. Blijft IndexedDB hangen, dan renderen we toch na 1,5 s;
// wat later binnenkomt, verschijnt via het wijzigingsevent.
const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
void Promise.race([preloadMedia(), timeout]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
