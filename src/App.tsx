import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';

// Cada página se descarga al visitarla: la portada carga solo lo suyo.
const named = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) => lazy(() => load().then((m) => ({ default: m[name] })));
const LigaPage = named(() => import('./pages/LigaPage'), 'LigaPage');
const LivePage = named(() => import('./pages/LivePage'), 'LivePage');
const CalendarPage = named(() => import('./pages/CalendarPage'), 'CalendarPage');
const HistoryPage = named(() => import('./pages/HistoryPage'), 'HistoryPage');
const ContactPage = named(() => import('./pages/ContactPage'), 'ContactPage');
const LegalPage = named(() => import('./pages/LegalPage'), 'LegalPage');
const NotFoundPage = named(() => import('./pages/NotFoundPage'), 'NotFoundPage');

export default function App() {
  return (
    <Suspense fallback={<p className="empty" role="status">Cargando…</p>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="liga" element={<LigaPage />} />
        <Route path="directo" element={<LivePage />} />
        <Route path="historia" element={<HistoryPage />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="contacto" element={<ContactPage />} />
        <Route path="legal" element={<LegalPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
