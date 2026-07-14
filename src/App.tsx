import React, { Suspense, lazy, useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { PlayerPage } from './pages/PlayerPage';
import { OpenSharedPage } from './pages/OpenSharedPage';
import { JoinPage } from './pages/JoinPage';
import { seedIfEmpty } from './lib/seed';

// ── Code-splitting: zwaardere pagina's laden pas wanneer ze nodig zijn ──────
// (De leerlingroutes /speel, /open en /meedoen blijven in de hoofdbundel:
// die moeten meteen openen, ook op tragere schoolnetwerken.)

const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard })));
const NewWidgetPage = lazy(() => import('./pages/NewWidgetPage').then((m) => ({ default: m.NewWidgetPage })));
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const ResultsPage = lazy(() => import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage })));
const ResultsOverviewPage = lazy(() => import('./pages/ResultsOverviewPage').then((m) => ({ default: m.ResultsOverviewPage })));
const PrintPage = lazy(() => import('./pages/PrintPage').then((m) => ({ default: m.PrintPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const AIStudioPage = lazy(() => import('./pages/AIStudioPage').then((m) => ({ default: m.AIStudioPage })));
const AISettingsPage = lazy(() => import('./pages/AISettingsPage').then((m) => ({ default: m.AISettingsPage })));
const CoursesPage = lazy(() => import('./pages/CoursesPage').then((m) => ({ default: m.CoursesPage })));
const CourseEditorPage = lazy(() => import('./pages/CourseEditorPage').then((m) => ({ default: m.CourseEditorPage })));
const CourseViewerPage = lazy(() => import('./pages/CourseViewerPage').then((m) => ({ default: m.CourseViewerPage })));
const CourseOpenPage = lazy(() => import('./pages/CourseViewerPage').then((m) => ({ default: m.CourseOpenPage })));
const CourseTrackPage = lazy(() => import('./pages/CourseTrackPage').then((m) => ({ default: m.CourseTrackPage })));
const CoursePrintPage = lazy(() => import('./pages/CoursePrintPage').then((m) => ({ default: m.CoursePrintPage })));

function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }} role="status" aria-label="Pagina wordt geladen">
      <span className="ai-pulse" style={{ fontSize: '2rem' }} aria-hidden>🧩</span>
    </div>
  );
}

const lz = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

const router = createHashRouter([
  {
    element: <Layout />,
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
  { path: '/bewerk/:id', element: lz(<EditorPage />) },
  { path: '/print/:id', element: lz(<PrintPage />) },
  { path: '/speel/:code', element: <PlayerPage /> },
  { path: '/open', element: <OpenSharedPage /> },
  { path: '/meedoen', element: <JoinPage /> },
  { path: '/voortgang', element: lz(<ProgressPage />) },
  // cursussen: leerlingweergave en bewerken zonder leerkracht-navigatie
  { path: '/cursus/bewerk/:id', element: lz(<CourseEditorPage />) },
  { path: '/cursus/lees/:code', element: lz(<CourseViewerPage />) },
  { path: '/cursus/open', element: lz(<CourseOpenPage />) },
  { path: '/cursus/print/:id', element: lz(<CoursePrintPage />) },
  { path: '*', element: <JoinPage /> },
]);

export default function App() {
  useEffect(() => {
    seedIfEmpty();
  }, []);
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
