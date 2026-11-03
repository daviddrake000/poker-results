export type GameStatus = 'draft' | 'final';

export interface Player {
  id: string;
  name: string;
  active: boolean;
}

export interface Game {
  id: string;
  /** Calendar date, "YYYY-MM-DD". */
  playedOn: string;
  location: string | null;
  notes: string | null;
  status: GameStatus;
  createdAt: string;
}

export interface Entry {
  id: string;
  playerId: string;
  playerName: string;
  buyInCents: number;
  cashOutCents: number;
}

export interface GameWithEntries extends Game {
  entries: Entry[];
}

export interface GameSummary extends Game {
  playerCount: number;
  /** Total bought in. */
  potCents: number;
}

export interface PlayerStat {
  id: string;
  name: string;
  /** All games: played here plus carried over from before this app. */
  gamesPlayed: number;
  /** All winnings, including carried-over totals. */
  netCents: number;
  /** Best and worst only cover games played here (see trackedGames). */
  bestNightCents: number;
  worstNightCents: number;
  winningNights: number;
  /** Finalized games played in this app. */
  trackedGames: number;
  /** Games and net carried over from before this app. */
  carriedGames: number;
  carriedNetCents: number;
}

export interface GameDetails {
  playedOn: string;
  location: string | null;
  notes: string | null;
}

export interface Session {
  userId: string;
  email: string | null;
}

export type MemberStatus = 'pending' | 'approved' | 'rejected';

/**
 * What the signed-in account may see. 'none' means signed in but not on the
 * members list at all (e.g. created before membership existed).
 */
export type Access = 'admin' | MemberStatus | 'none';

export interface Member {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: MemberStatus;
  isAdmin: boolean;
  requestedAt: string;
  decidedAt: string | null;
}
