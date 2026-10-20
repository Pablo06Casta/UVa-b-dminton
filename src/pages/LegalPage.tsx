import { Notice, PageHeader, PendingTag } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';

export function LegalPage() {
  usePageTitle('Información legal');
  return (
    <>
      <PageHeader title="Información legal" lead="Aviso legal y política de privacidad de la web del club." />
      <div className="section">
        <div className="container container--narrow">
          <Notice kind="warning" title="Textos legales pendientes">
            Los textos definitivos deben ser redactados o validados por la Universidad de Valladolid o por quien
            ostente la responsabilidad de la web. No se han inventado cláusulas: a continuación se indica qué datos hacen
            falta.
          </Notice>

          <section id="aviso-legal" className="legal" aria-labelledby="aviso-title">
            <h2 id="aviso-title">Aviso legal</h2>
            <PendingTag>Pendiente de completar</PendingTag>
            <ul>
              <li>Titular de la web y datos de identificación (denominación, domicilio, contacto).</li>
              <li>Condiciones de uso del sitio y propiedad intelectual (incluido el uso autorizado de la marca UVa).</li>
              <li>Responsabilidad y enlaces a terceros.</li>
            </ul>
          </section>

          <section id="privacidad" className="legal" aria-labelledby="priv-title">
            <h2 id="priv-title">Política de privacidad</h2>
            <PendingTag>Pendiente de completar</PendingTag>
            <ul>
              <li>Responsable del tratamiento y contacto del delegado de protección de datos.</li>
              <li>Finalidad y base jurídica del tratamiento de los datos del formulario de contacto.</li>
              <li>Plazo de conservación, destinatarios y encargados del tratamiento (p. ej. servicio de envío).</li>
              <li>Derechos de las personas interesadas y cómo ejercerlos.</li>
              <li>Política de cookies, si se incorporan servicios de analítica u otros elementos de terceros.</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
