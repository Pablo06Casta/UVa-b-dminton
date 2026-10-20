import '@fontsource-variable/libre-franklin';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

// VITE_ROUTER=memory: navegación interna sin tocar la URL (para visores/alojamientos embebidos).
const Router =
  import.meta.env.VITE_ROUTER === 'memory'
    ? MemoryRouter
    : ({ children }: { children: React.ReactNode }) => (
        <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>
      );

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
