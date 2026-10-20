import achievementsJson from '../../data/achievements.json';
import type { Achievement } from '../../types';
import { SectionHeading, PendingTag } from '../ui';

const achievements = achievementsJson as Achievement[];

export function AchievementsSection() {
  const hasPending = achievements.some((a) => a.status === 'pending' || a.value === null);
  return (
    <section className="section section--indigo" aria-labelledby="logros-title">
      <div className="container">
        <SectionHeading
          id="logros-title"
          eyebrow="Trayectoria"
          title="Trayectoria y logros deportivos"
          lead="Campeonatos, podios y reconocimientos del club."
          light
        />
        <ul className="stats">
          {achievements.map((a) => (
            <li key={a.id} className="stat">
              <p className="stat__value" aria-label={a.value ?? 'Dato pendiente'}>
                <span aria-hidden="true">{a.value ?? '—'}</span>
              </p>
              <p className="stat__title">{a.title}</p>
              <p className="stat__desc">{a.description}</p>
              {(a.status === 'pending' || a.value === null) && <PendingTag>Dato pendiente</PendingTag>}
            </li>
          ))}
        </ul>
        {hasPending && (
          <p className="stats__note">
            Las cifras se publicarán cuando el club facilite datos verificables. Hasta entonces no se muestra ningún
            resultado.
          </p>
        )}
      </div>
    </section>
  );
}
