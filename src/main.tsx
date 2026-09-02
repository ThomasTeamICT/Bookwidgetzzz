import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';
import { preloadMedia } from './lib/mediaStore';
import './styles/global.css';

initTheme();

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
