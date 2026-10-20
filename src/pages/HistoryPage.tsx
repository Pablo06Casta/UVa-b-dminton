import historyJson from '../data/history.json';
import { Notice, PageHeader, PendingTag } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';
import type { HistoryData } from '../types';

const history = historyJson as HistoryData;

export function HistoryPage() {
  usePageTitle('Historia');
  const hasPending = history.sections.some((s) => s.status === 'pending');

  return (
    <>
      <PageHeader
        title="Historia"
        lead="La trayectoria deportiva del club y su vinculación con la Universidad de Valladolid."
      />
      <div className="section">
        <div className="container container--narrow">
          {hasPending && (
            <Notice title="Contenido histórico pendiente de completar">
              El texto definitivo se incorporará cuando el club lo facilite, con fuentes que lo respalden. Mientras
              tanto, cada apartado indica qué información hay que aportar. No se muestran fechas, victorias ni hitos
              sin verificar.
            </Notice>
          )}

          <ol className="history">
            {history.sections.map((s, i) => (
              <li key={s.id} className="history__item" aria-labelledby={`h-${s.id}`}>
                <span className="history__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 id={`h-${s.id}`}>{s.title}</h2>
                  {s.status === 'pending' ? (
                    <div className="pending-box">
                      <PendingTag>Pendiente de completar</PendingTag>
                      <p>
                        <strong>Información necesaria:</strong> {s.needed}
                      </p>
                    </div>
                  ) : (
                    s.paragraphs.map((p) => <p key={p}>{p}</p>)
                  )}
                </div>
              </li>
            ))}
          </ol>

          <section aria-labelledby="timeline-title" className="history__block">
            <h2 id="timeline-title">Línea temporal</h2>
            {history.timeline.length > 0 ? (
              <ol className="timeline">
                {history.timeline.map((e) => (
                  <li key={e.id}>
                    <p className="timeline__date">{e.date}</p>
                    <h3>{e.title}</h3>
                    <p>{e.description}</p>
                    {e.source && <p className="timeline__source">Fuente: {e.source}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="pending-box">
                <PendingTag>Pendiente de completar</PendingTag>
                <p>
                  La línea temporal se mostrará cuando existan hitos verificados (fecha y fuente) que la justifiquen.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="fotos-title" className="history__block">
            <h2 id="fotos-title">Fotografías históricas</h2>
            {history.photos.length > 0 ? (
              <ul className="photo-grid">
                {history.photos.map((p) => (
                  <li key={p.id}>
                    <figure>
                      <img src={p.src} alt={p.alt} loading="lazy" />
                      <figcaption>
                        {p.caption}
                        {p.year && ` (${p.year})`}
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pending-box">
                <PendingTag>Pendiente de completar</PendingTag>
                <p>Fotografías históricas del club, con su año y la autorización de quien las aporte.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
