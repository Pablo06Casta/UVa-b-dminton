import { club } from '../../config/site';
import { ButtonLink } from '../ui';

export function Hero() {
  const { hero } = club.images;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <img className="hero__img" src={hero.src} alt={hero.alt} fetchPriority="high" />
      <div className="hero__overlay" aria-hidden="true" />

      <div className="container hero__content">
        <img
          className="hero__logo"
          src="/images/logo-uva.png"
          alt="Universidad de Valladolid"
          width="96"
          height="96"
        />
        <h1 id="hero-title">
          <span className="hero__title">
            Club
            <br />
            Bádminton
          </span>{' '}
          <span className="hero__subtitle">{club.university}</span>
        </h1>
        <p className="hero__message">{club.heroMessage}</p>
        <div className="hero__actions">
          <ButtonLink to="/#club" variant="light" arrow>
            Conoce nuestro club
          </ButtonLink>
          <ButtonLink to="/calendario" variant="outline-light">
            Próximos torneos
          </ButtonLink>
        </div>
      </div>

      {hero.provisional && (
        <p className="hero__tag">Imagen provisional · se sustituirá por la fotografía oficial del equipo</p>
      )}
    </section>
  );
}
