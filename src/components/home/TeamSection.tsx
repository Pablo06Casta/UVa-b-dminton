import playersJson from '../../data/players.json';
import type { Player } from '../../types';
import { Notice, SectionHeading } from '../ui';
import { asset } from '../../lib/asset';

// Solo se publican personas con autorización expresa (consent: true).
const players = (playersJson as Player[]).filter((p) => p.consent === true);

function Silhouette() {
  return (
    <svg viewBox="0 0 100 125" className="player__silhouette" aria-hidden="true" focusable="false">
      <circle cx="50" cy="46" r="18" />
      <path d="M14 125c0-26 16-42 36-42s36 16 36 42z" />
    </svg>
  );
}

function PlayerCard({ player }: { player?: Player }) {
  return (
    <li className={`player${player ? '' : ' player--placeholder'}`}>
      <div className="player__photo">
        {player?.photo ? (
          <img src={asset(player.photo)} alt={`Fotografía de ${player.name}`} loading="lazy" width="400" height="500" />
        ) : (
          <Silhouette />
        )}
      </div>
      <h3 className="player__name">{player ? player.name : 'Integrante por confirmar'}</h3>
      <p className="player__role">{player ? player.role : 'Función por confirmar'}</p>
      {player?.info && <p className="player__info">{player.info}</p>}
    </li>
  );
}

export function TeamSection() {
  return (
    <section id="equipo" className="section" aria-labelledby="equipo-title">
      <div className="container">
        <SectionHeading
          id="equipo-title"
          eyebrow="Personas"
          title="Nuestro equipo"
          lead="Jugadores y demás integrantes del club."
        />
        {players.length === 0 && (
          <Notice title="Plantilla pendiente de publicar">
            Los integrantes se mostrarán aquí cuando el club facilite sus datos y la autorización para publicar sus
            nombres e imágenes. Las tarjetas siguientes son solo un marcador de posición.
          </Notice>
        )}
        <ul className="team-grid">
          {players.length > 0
            ? players.map((p) => <PlayerCard key={p.id} player={p} />)
            : [0, 1, 2, 3].map((i) => <PlayerCard key={i} />)}
        </ul>
      </div>
    </section>
  );
}
