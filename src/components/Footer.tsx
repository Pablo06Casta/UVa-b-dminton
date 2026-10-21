import { Link } from 'react-router-dom';
import { club, nav } from '../config/site';
import { asset } from '../lib/asset';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <img src={asset('/images/logo-uva-192.webp')} alt="Universidad de Valladolid" width="64" height="64" loading="lazy" />
          <p className="site-footer__name">{club.name}</p>
          <p className="site-footer__uni">{club.university}</p>
        </div>

        <nav aria-label="Enlaces del pie">
          <h2 className="site-footer__title">Navegación</h2>
          <ul>
            {nav.map((item) => (
              <li key={item.to}>
                {'external' in item ? <a href={item.to}>{item.label}</a> : <Link to={item.to}>{item.label}</Link>}
              </li>
            ))}
          </ul>
        </nav>

        {(club.email || club.socials.length > 0) && (
          <div>
            <h2 className="site-footer__title">Síguenos y escríbenos</h2>
            <ul>
              {club.email && (
                <li>
                  <a href={`mailto:${club.email}`}>{club.email}</a>
                </li>
              )}
              {club.socials.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                    <span className="sr-only"> (se abre en una pestaña nueva)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h2 className="site-footer__title">Información legal</h2>
          <ul>
            <li>
              <Link to="/legal#aviso-legal">Aviso legal</Link>
            </li>
            <li>
              <Link to="/legal#privacidad">Política de privacidad</Link>
            </li>
            <li>
              <Link to="/legal#cookies">Cookies</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="container site-footer__bottom">
        <p>
          © {new Date().getFullYear()} {club.name} {club.university}.
        </p>
      </div>
    </footer>
  );
}
