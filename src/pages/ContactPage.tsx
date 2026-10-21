import { ContactForm } from '../components/ContactForm';
import { Icon } from '../components/Icon';
import { Notice, PageHeader } from '../components/ui';
import { club, isContactFormConfigured } from '../config/site';
import { usePageTitle } from '../hooks/usePageTitle';

export function ContactPage() {
  usePageTitle('Contacto');
  return (
    <>
      <PageHeader title="Contacto" lead="Escribe al club: dudas, propuestas o petición de información." />
      <div className="section">
        <div className="container contact-layout">
          <div>
            {!isContactFormConfigured && (
              <Notice kind="warning" title="Formulario pendiente de configuración">
                El formulario valida los datos, pero todavía no está conectado a ningún servicio de envío, por lo que
                los mensajes no llegan al club.
                {club.email ? ' Mientras tanto, escribe directamente al correo del club.' : ''}
              </Notice>
            )}
            <ContactForm />
          </div>

          <aside className="contact-info" aria-label="Datos de contacto">
            <h2>Datos del club</h2>
            <ul>
              {club.email ? (
                <li>
                  <Icon name="mail" />
                  <a href={`mailto:${club.email}`}>{club.email}</a>
                </li>
              ) : (
                <li>
                  <Icon name="mail" />
                  <span>Correo oficial pendiente de facilitar.</span>
                </li>
              )}
              {club.address && (
                <li>
                  <Icon name="pin" />
                  <span>{club.address}</span>
                </li>
              )}
              {club.socials.map((s) => (
                <li key={s.url}>
                  <Icon name={/instagram/i.test(s.url) ? 'instagram' : 'external'} />
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                    <span className="sr-only"> (se abre en una pestaña nueva)</span>
                  </a>
                </li>
              ))}
            </ul>
            {club.socials.length === 0 && <p className="field__hint">Redes sociales pendientes de confirmar.</p>}
          </aside>
        </div>
      </div>
    </>
  );
}
