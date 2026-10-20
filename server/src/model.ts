/** Modelo de datos del servidor: lo que el motor necesita saber de un torneo, sus cuadros y sus partidos. */

export type MatchStatus = 'scheduled' | 'on_court' | 'finished' | 'walkover' | 'retired' | 'unknown';

export interface PlayerRef {
  /** Número del jugador dentro del torneo. */
  tsPlayerId?: number;
  name: string;
}

export interface Team {
  players: PlayerRef[];
  /** Plaza aún por decidir («Ganador partido 12»…). */
  placeholder?: string;
}

/** Un partido del orden de juego de un día. */
export interface MatchRow {
  /** Clave estable para deduplicar. */
  key: string;
  tournamentId: string;
  drawName: string;
  /** Prueba: IM, IF, DM, DF, DX… */
  eventCode?: string;
  round?: string;
  /** Fecha local de la sede (YYYY-MM-DD) y hora oficial local (HH:MM) y en UTC (ISO). */
  date?: string;
  plannedClock?: string;
  plannedUtc?: string;
  team1: Team;
  team2: Team;
  winner?: 1 | 2;
  sets: [number, number][];
  scoreText?: string;
  durationMin?: number;
  court?: string;
  status: MatchStatus;
  orderIndex?: number;
}

export interface TournamentInfo {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  days: string[];
  venue?: string;
  city?: string;
  tz: string;
  level?: string;
}

export interface DrawInfo {
  drawId: number;
  name: string;
  type: 'knockout' | 'roundrobin';
}

export interface StandingRow {
  rank: number;
  names: string[];
  ids: number[];
  club?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  matches: string;
  games: string;
  points: string;
  pts: number;
  form: string[];
}

export interface Entrant {
  names: string[];
  ids: number[];
  club?: string;
  seed?: string;
  bye?: boolean;
  placeholder?: string;
}

export interface BracketMatch {
  a: Entrant;
  b: Entrant;
  winner?: 1 | 2;
  sets: [number, number][];
  when?: string;
  court?: string;
  note?: string;
}

export interface BracketRound {
  title: string;
  matches: BracketMatch[];
}
