import React, { useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { NewWidgetPage } from './pages/NewWidgetPage';
import { EditorPage } from './pages/EditorPage';
import { PlayerPage } from './pages/PlayerPage';
import { OpenSharedPage } from './pages/OpenSharedPage';
import { JoinPage } from './pages/JoinPage';
import { ProgressPage } from './pages/ProgressPage';
import { ResultsPage } from './pages/ResultsPage';
import { ResultsOverviewPage } from './pages/ResultsOverviewPage';
import { PrintPage } from './pages/PrintPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { AIStudioPage } from './pages/AIStudioPage';
import { AISettingsPage } from './pages/AISettingsPage';
import { CoursesPage } from './pages/CoursesPage';
import { CourseEditorPage } from './pages/CourseEditorPage';
import { CourseViewerPage, CourseOpenPage } from './pages/CourseViewerPage';
import { CourseTrackPage } from './pages/CourseTrackPage';
import { CoursePrintPage } from './pages/CoursePrintPage';
import { seedIfEmpty } from './lib/seed';

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/widgets', element: <TeacherDashboard /> },
      { path: '/nieuw', element: <NewWidgetPage /> },
      { path: '/resultaten', element: <ResultsOverviewPage /> },
      { path: '/resultaten/:id', element: <ResultsPage /> },
      { path: '/cursussen', element: <CoursesPage /> },
      { path: '/cursus/volg/:id', element: <CourseTrackPage /> },
      { path: '/ai-studio', element: <AIStudioPage /> },
      { path: '/ai-instellingen', element: <AISettingsPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
    ],
  },
  // spelersweergave zonder leerkracht-navigatie
  { path: '/bewerk/:id', element: <EditorPage /> },
  { path: '/print/:id', element: <PrintPage /> },
  { path: '/speel/:code', element: <PlayerPage /> },
  { path: '/open', element: <OpenSharedPage /> },
  { path: '/meedoen', element: <JoinPage /> },
  { path: '/voortgang', element: <ProgressPage /> },
  // cursussen: leerlingweergave en bewerken zonder leerkracht-navigatie
  { path: '/cursus/bewerk/:id', element: <CourseEditorPage /> },
  { path: '/cursus/lees/:code', element: <CourseViewerPage /> },
  { path: '/cursus/open', element: <CourseOpenPage /> },
  { path: '/cursus/print/:id', element: <CoursePrintPage /> },
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
