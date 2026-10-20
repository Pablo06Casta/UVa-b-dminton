import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CalendarPage } from './pages/CalendarPage';
import { ContactPage } from './pages/ContactPage';
import { LivePage } from './pages/LivePage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="directo" element={<LivePage />} />
        <Route path="historia" element={<HistoryPage />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="contacto" element={<ContactPage />} />
        <Route path="legal" element={<LegalPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
