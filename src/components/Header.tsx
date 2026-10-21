import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { club, nav } from '../config/site';
import { Icon } from './Icon';
import { asset } from '../lib/asset';

export function Header() {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const { pathname } = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Cabecera fija que reduce ligeramente su altura al desplazarse.
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cierra el menú móvil al navegar, con Escape o al pasar a escritorio.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const mq = window.matchMedia('(min-width: 900px)');
    const onChange = () => mq.matches && setOpen(false);
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onChange);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onChange);
    };
  }, [open]);

  return (
    <header className={`site-header${compact ? ' is-compact' : ''}`}>
      <div className="container site-header__inner">
        <Link to="/" className="brand" aria-label={`${club.name} ${club.university}. Ir al inicio`}>
          <img className="brand__logo" src={asset('/images/logo-uva-96.webp')} srcSet={`${asset('/images/logo-uva-96.webp')} 1x, ${asset('/images/logo-uva-192.webp')} 2x`} alt="" width="48" height="48" />
          <span className="brand__text">
            <span className="brand__name">{club.name}</span>
            <span className="brand__uni">{club.university}</span>
          </span>
        </Link>

        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'close' : 'menu'} size={24} />
          <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
        </button>

        <nav id="main-nav" className={`nav${open ? ' is-open' : ''}`} aria-label="Principal">
          <ul>
            {nav.map((item) => (
              <li key={item.to}>
                {'external' in item ? (
                  <a href={item.to} className="nav__link">
                    {item.label}
                  </a>
                ) : (
                  <NavLink to={item.to} end={item.to === '/'} className="nav__link">
                    {item.label}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
