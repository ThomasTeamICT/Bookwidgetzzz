import React, { Suspense, lazy, useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { PlayerPage } from './pages/PlayerPage';
import { OpenSharedPage } from './pages/OpenSharedPage';
import { JoinPage } from './pages/JoinPage';
import { migrateDataUrls, pruneOrphanMedia } from './lib/mediaStore';
import { onStorageChange } from './lib/storage';

// ── Code-splitting: zwaardere pagina's laden pas wanneer ze nodig zijn ──────
// (De leerlingroutes /speel, /open en /meedoen blijven in de hoofdbundel:
// die moeten meteen openen, ook op tragere schoolnetwerken.)

// Na een nieuwe deploy bestaan de oude (gehashte) chunk-URL's niet meer; in een
// tab die nog openstond zou elke klik op een lazy route dan stranden. Bij een
// mislukte import herladen we daarom éénmalig automatisch. Een sessionStorage-
// vlag per chunk voorkomt een reload-lus; na een geslaagde import wissen we ze.
function lazyRetry<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>, chunk: string) {
  return lazy(async () => {
    const flag = `wf.chunkreload.${chunk}`;
    try {
      const mod = await load();
      sessionStorage.removeItem(flag);
      return mod;
    } catch (err) {
      if (sessionStorage.getItem(flag) !== '1') {
        sessionStorage.setItem(flag, '1');
        window.location.reload();
        // reload is onderweg: laat de Suspense-fallback staan
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

const TeacherDashboard = lazyRetry(() => import('./pages/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard })), 'TeacherDashboard');
const NewWidgetPage = lazyRetry(() => import('./pages/NewWidgetPage').then((m) => ({ default: m.NewWidgetPage })), 'NewWidgetPage');
const EditorPage = lazyRetry(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })), 'EditorPage');
const ResultsPage = lazyRetry(() => import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage })), 'ResultsPage');
const ResultsOverviewPage = lazyRetry(() => import('./pages/ResultsOverviewPage').then((m) => ({ default: m.ResultsOverviewPage })), 'ResultsOverviewPage');
const PrintPage = lazyRetry(() => import('./pages/PrintPage').then((m) => ({ default: m.PrintPage })), 'PrintPage');
const PrivacyPage = lazyRetry(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })), 'PrivacyPage');
const ProgressPage = lazyRetry(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })), 'ProgressPage');
const HelpPage = lazyRetry(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })), 'HelpPage');
const AIStudioPage = lazyRetry(() => import('./pages/AIStudioPage').then((m) => ({ default: m.AIStudioPage })), 'AIStudioPage');
const AISettingsPage = lazyRetry(() => import('./pages/AISettingsPage').then((m) => ({ default: m.AISettingsPage })), 'AISettingsPage');
const CoursesPage = lazyRetry(() => import('./pages/CoursesPage').then((m) => ({ default: m.CoursesPage })), 'CoursesPage');
const CourseEditorPage = lazyRetry(() => import('./pages/CourseEditorPage').then((m) => ({ default: m.CourseEditorPage })), 'CourseEditorPage');
const CourseViewerPage = lazyRetry(() => import('./pages/CourseViewerPage').then((m) => ({ default: m.CourseViewerPage })), 'CourseViewerPage');
const CourseOpenPage = lazyRetry(() => import('./pages/CourseViewerPage').then((m) => ({ default: m.CourseOpenPage })), 'CourseViewerPage');
const CourseTrackPage = lazyRetry(() => import('./pages/CourseTrackPage').then((m) => ({ default: m.CourseTrackPage })), 'CourseTrackPage');
const CoursePrintPage = lazyRetry(() => import('./pages/CoursePrintPage').then((m) => ({ default: m.CoursePrintPage })), 'CoursePrintPage');

function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }} role="status" aria-label="Pagina wordt geladen">
      <span className="ai-pulse" style={{ fontSize: '2rem' }} aria-hidden>🧩</span>
    </div>
  );
}

// Nederlandstalige foutgrens i.p.v. react-routers Engelse standaardpagina
// (bv. wanneer een chunk na een nieuwe deploy definitief niet meer laadt).
function LoadError() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: 20 }}>
      <div className="card card-pad" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2.4rem' }} aria-hidden>🧩</div>
        <h1 style={{ fontSize: '1.3rem' }}>Er ging iets mis bij het laden</h1>
        <p style={{ color: 'var(--text-soft)' }}>
          Waarschijnlijk is er net een nieuwe versie van de app verschenen. Opnieuw laden lost dit meestal op.
        </p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Opnieuw laden</button>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <a href="#/" style={{ color: 'var(--text-soft)', fontSize: '0.9rem' }}>← Naar de startpagina</a>
        </p>
      </div>
    </div>
  );
}

const lz = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;
const errorElement = <LoadError />;

const router = createHashRouter([
  {
    element: <Layout />,
    errorElement,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/widgets', element: lz(<TeacherDashboard />) },
      { path: '/nieuw', element: lz(<NewWidgetPage />) },
      { path: '/resultaten', element: lz(<ResultsOverviewPage />) },
      { path: '/resultaten/:id', element: lz(<ResultsPage />) },
      { path: '/cursussen', element: lz(<CoursesPage />) },
      { path: '/cursus/volg/:id', element: lz(<CourseTrackPage />) },
      { path: '/ai-studio', element: lz(<AIStudioPage />) },
      { path: '/ai-instellingen', element: lz(<AISettingsPage />) },
      { path: '/hulp', element: lz(<HelpPage />) },
      { path: '/privacy', element: lz(<PrivacyPage />) },
    ],
  },
  // spelersweergave zonder leerkracht-navigatie
  { path: '/bewerk/:id', element: lz(<EditorPage />), errorElement },
  { path: '/print/:id', element: lz(<PrintPage />), errorElement },
  { path: '/speel/:code', element: <PlayerPage />, errorElement },
  { path: '/open', element: <OpenSharedPage />, errorElement },
  { path: '/meedoen', element: <JoinPage />, errorElement },
  { path: '/voortgang', element: lz(<ProgressPage />), errorElement },
  // cursussen: leerlingweergave en bewerken zonder leerkracht-navigatie
  { path: '/cursus/bewerk/:id', element: lz(<CourseEditorPage />), errorElement },
  { path: '/cursus/lees/:code', element: lz(<CourseViewerPage />), errorElement },
  { path: '/cursus/open', element: lz(<CourseOpenPage />), errorElement },
  { path: '/cursus/print/:id', element: lz(<CoursePrintPage />), errorElement },
  { path: '*', element: <JoinPage />, errorElement },
]);

export default function App() {
  useEffect(() => {
    // De voorbeeldinhoud is puur leerkrachtmateriaal; een leerling die met een
    // code binnenkomt heeft ze nooit nodig. Lui laden houdt ~3 kB gzip uit de
    // hoofdbundel die iedereen op /speel/:code binnenhaalt.
    void import('./lib/seed').then((m) => m.seedIfEmpty());
  }, []);

  useEffect(() => {
    // Media-onderhoud, altijd buiten het kritieke pad:
    //  – data-URL's die nog in localStorage staan (oude opslag, import, link,
    //    resultaatcode, AI) verhuizen naar IndexedDB — kort na elke wijziging,
    //    ontdubbeld, zodat de opslag nooit meer volloopt met base64;
    //  – bij het opstarten één keer wezen opruimen (blobs zonder verwijzing).
    let timer: number | null = null;
    const schedule = (delay: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void migrateDataUrls().catch(() => { /* best-effort */ });
      }, delay);
    };
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const maintenance = () => {
      void migrateDataUrls()
        .then(() => pruneOrphanMedia())
        .catch(() => { /* best-effort */ });
    };
    const idleHandle = hasIdle ? window.requestIdleCallback(maintenance) : window.setTimeout(maintenance, 800);
    const off = onStorageChange(() => schedule(2500));
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
      if (hasIdle) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, []);
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
