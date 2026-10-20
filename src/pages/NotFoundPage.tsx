import { ButtonLink, PageHeader } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Página no encontrada');
  return (
    <>
      <PageHeader title="Página no encontrada" lead="La dirección que buscas no existe o ha cambiado de sitio." />
      <div className="section">
        <div className="container">
          <ButtonLink to="/" arrow>
            Volver al inicio
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
