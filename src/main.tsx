import '@fontsource-variable/libre-franklin';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import { warmUpApi } from './lib/api';
import './styles/global.css';

// Con servidor: la conexión y las primeras peticiones empiezan ya, sin esperar a que arranque la interfaz (el plan gratuito de Render tarda en despertar).
warmUpApi();

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
