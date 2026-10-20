import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Footer } from './Footer';
import { Header } from './Header';

/** Al cambiar de página: vuelve arriba (o al ancla) y lleva el foco al contenido principal. */
function RouteEffects({ mainRef }: { mainRef: React.RefObject<HTMLElement | null> }) {
  const { pathname, hash } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (first.current) first.current = false;
    else if (!hash) mainRef.current?.focus({ preventScroll: true });
  }, [pathname, hash, mainRef]);

  return null;
}

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido" ref={mainRef} tabIndex={-1}>
        <RouteEffects mainRef={mainRef} />
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
