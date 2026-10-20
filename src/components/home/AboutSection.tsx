import { club } from '../../config/site';
import { ButtonLink, PendingTag } from '../ui';

/** Bloque de presentación: imagen + panel de texto (composición de referencia de portales deportivos). */
export function AboutSection() {
  const { about } = club;
  const img = club.images.about;
  return (
    <section id="club" className="section" aria-labelledby="club-title">
      <div className="container">
        <div className="feature">
          <figure className="feature__media">
            <img src={img.src} alt={img.alt} loading="lazy" width="1200" height="900" />
            {img.provisional && <figcaption className="media-tag">Imagen provisional</figcaption>}
          </figure>
          <div className="feature__panel">
            <p className="eyebrow">El club</p>
            <h2 id="club-title">{about.title}</h2>
            {about.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {about.status === 'pending' && <PendingTag>Texto pendiente de facilitar</PendingTag>}
            <div className="feature__actions">
              <ButtonLink to="/historia" arrow>
                Conoce nuestra historia
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
