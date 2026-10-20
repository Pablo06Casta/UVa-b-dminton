import { club } from '../../config/site';
import { ButtonLink } from '../ui';

export function QuickContact() {
  return (
    <section className="section section--tint" aria-labelledby="contacto-title">
      <div className="container quick-contact">
        <div>
          <p className="eyebrow">Contacto</p>
          <h2 id="contacto-title">¿Quieres ponerte en contacto con el club?</h2>
          <p className="lead">
            Escríbenos a través del formulario y el equipo responsable te responderá.
            {club.email && (
              <>
                {' '}
                También puedes escribir a <a href={`mailto:${club.email}`}>{club.email}</a>.
              </>
            )}
          </p>
        </div>
        <ButtonLink to="/contacto" arrow>
          Ir al formulario
        </ButtonLink>
      </div>
    </section>
  );
}
