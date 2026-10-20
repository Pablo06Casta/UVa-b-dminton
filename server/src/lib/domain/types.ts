/** Estado de la inscripción del jugador en un torneo (según la lista oficial de entradas). */
export type EntryStatus =
  | "confirmed" // Maindraw / Qualification: admitido en el cuadro
  | "reserve" // Lista de reserva
  | "excluded" // Exclude list: no admitido
  | "pending" // Aparece vinculado al torneo pero la organización no ha publicado la admisión
  | "unknown";

/** Momento del torneo. */
export type TimelineStatus = "upcoming" | "live" | "finished";

export type MatchStatus =
  | "scheduled" // pendiente
  | "on_court" // asignado a pista y sin resultado: en juego
  | "finished"
  | "walkover" // W.O. / no hay partido
  | "retired" // retirada
  | "unknown";

export interface PlayerRef {
  /** ID del jugador dentro del torneo (player.aspx?player=N). */
  tsPlayerId?: number;
  name: string;
  seed?: string;
  country?: string;
}

export interface Team {
  players: PlayerRef[];
  /** Plaza aún por decidir: "Grupo D #1", "Ganador partido 12"… */
  placeholder?: string;
}

export interface Match {
  /** Clave estable para deduplicar. */
  key: string;
  tournamentId: string;
  /** ID oficial del partido (match.aspx?match=N), si se conoce. */
  matchId?: number;
  drawId?: number;
  drawName: string;
  /** Prueba: IM, DM, DX, IF, DF, IM-N4… */
  eventCode?: string;
  /** Fase: "Grupo A", "Cuartos", "R16"… */
  round?: string;
  /** Fecha local de la sede (YYYY-MM-DD). */
  date?: string;
  /** Hora oficial local (HH:MM). */
  plannedClock?: string;
  /** Hora oficial en UTC (ISO). */
  plannedUtc?: string;
  team1: Team;
  team2: Team;
  winner?: 1 | 2;
  sets: [number, number][];
  scoreText?: string;
  durationMin?: number;
  court?: string;
  courtId?: number;
  status: MatchStatus;
  /**
   * La página marca los partidos en juego con etiqueta y esta fila tiene pista pero ni etiqueta ni resultado.
   * Observado en directo: es un partido ya jugado cuyo resultado aún no se ha introducido (ver live.ts).
   */
  courtNoTag?: boolean;
  /** Lado del jugador seguido (1 o 2), si participa. */
  mySide?: 1 | 2;
  /** Posición en el orden de juego del día. */
  orderIndex?: number;
  /** URL oficial donde se puede comprobar. */
  sourceUrl?: string;
}

export interface TournamentInfo {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  days: string[];
  venue?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  organizer?: string;
  tz: string;
  hasLiveScore: boolean;
  lastUpdatedText?: string;
  categories: string[];
  entryOpen?: string;
  entryClose?: string;
  withdrawalDeadline?: string;
  level?: string;
}

export interface MyEvent {
  eventId?: number;
  name: string;
  seed?: string;
  partner?: string;
  entryStatus: EntryStatus;
  /** Literal oficial: "Maindraw", "Qualification", "Reserve list 2", "Exclude list"… */
  entryLabel?: string;
}

export interface TournamentLink {
  tournamentId: string;
  tsPlayerId: number;
  name: string;
  startDate?: string;
  endDate?: string;
}

export interface Identity {
  profileGuid: string;
  name: string;
  license?: string;
  rankingPlayerIds: number[];
  club?: string;
  verifiedAt: string;
  method: string;
}

export interface RankingLine {
  ranking: string;
  category: string;
  position: number;
  points?: number;
}

export interface ChangeEvent {
  id?: number;
  at: string;
  tournamentId: string;
  matchKey?: string;
  kind: "time" | "court" | "opponent" | "order" | "status" | "score" | "result" | "entry" | "new_tournament" | "draw";
  label: string;
  before?: string;
  after?: string;
  important: boolean;
}
