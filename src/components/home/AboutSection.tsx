import { club } from '../../config/site';
import { ButtonLink, PendingTag } from '../ui';
import { asset, srcSetOf } from '../../lib/asset';

/** Bloque de presentación: imagen + panel de texto (composición de referencia de portales deportivos). */
export function AboutSection() {
  const { about } = club;
  const img = club.images.about;
  return (
    <section id="club" className="section" aria-labelledby="club-title">
      <div className="container">
        <div className="feature">
          <figure className="feature__media">
            <img
              src={asset(img.src)}
              srcSet={img.responsive ? srcSetOf(img.responsive) : undefined}
              sizes="(min-width: 900px) 1100px, 92vw"
              alt={img.alt}
              loading="lazy"
              decoding="async"
              width="1254"
              height="1254"
            />
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
