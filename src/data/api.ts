import type { SheetEntry } from '../lib/sheet';
import type {
  Access,
  Game,
  GameDetails,
  GameStatus,
  GameSummary,
  GameWithEntries,
  Member,
  MemberStatus,
  Player,
  PlayerStat,
  Session,
} from './types';

/**
 * Everything the screens need from the database. Who may do what is decided
 * by Row Level Security in Supabase, not here; failed writes throw with a
 * message ready to show.
 */
export interface PokerApi {
  /** Players with at least one finalized game, best net first. */
  leaderboard(): Promise<PlayerStat[]>;
  /** Games with the given status, newest first. */
  games(status: GameStatus): Promise<GameSummary[]>;
  /**
   * One game with its entries, or null if it doesn't exist or the caller
   * can't see it. `finalOnly` makes drafts look missing even to admins.
   */
  game(id: string, options: { finalOnly: boolean }): Promise<GameWithEntries | null>;

  players(): Promise<Player[]>;
  addPlayer(name: string): Promise<Player>;
  createGame(details: GameDetails): Promise<Game>;
  updateGameDetails(id: string, details: GameDetails): Promise<void>;
  /** Make the game's entries exactly this list. */
  saveEntries(gameId: string, entries: SheetEntry[]): Promise<void>;
  setStatus(id: string, status: GameStatus): Promise<void>;
  deleteDraft(id: string): Promise<void>;

  getSession(): Promise<Session | null>;
  onAuthChange(callback: (session: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /**
   * Request an account. It starts as a pending member. `needsConfirmation`
   * is true when Supabase emailed a confirmation link instead of signing in.
   */
  signUp(details: { email: string; password: string; displayName: string }): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  /** What the signed-in account may see (a hint for routing; RLS enforces it). */
  myAccess(): Promise<Access>;

  /** Admins only: everyone who has an account, newest request first. */
  members(): Promise<Member[]>;
  setMemberStatus(userId: string, status: MemberStatus): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}

/** A row of the player_stats view, as PostgREST returns it. */
export interface StatRow {
  id: string;
  name: string;
  games_played: number;
  net_cents: number;
  best_night_cents: number;
  worst_night_cents: number;
  winning_nights: number;
  // Added by the carry-over SQL; missing until it's applied.
  tracked_games?: number;
  carried_games?: number;
  carried_net_cents?: number;
}

export function statFromRow(r: StatRow): PlayerStat {
  return {
    id: r.id,
    name: r.name,
    gamesPlayed: Number(r.games_played),
    netCents: Number(r.net_cents),
    bestNightCents: Number(r.best_night_cents),
    worstNightCents: Number(r.worst_night_cents),
    winningNights: Number(r.winning_nights),
    // Before the carry-over SQL, every game counted was played here.
    trackedGames: Number(r.tracked_games ?? r.games_played),
    carriedGames: Number(r.carried_games ?? 0),
    carriedNetCents: Number(r.carried_net_cents ?? 0),
  };
}

/** Best net first; ties by name so the order never jumps around. */
export function rankPlayers(stats: PlayerStat[]): PlayerStat[] {
  return stats
    .filter((s) => s.gamesPlayed > 0)
    .sort((a, b) => b.netCents - a.netCents || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Newest first: by date played, then by when the game was created. */
export function newestFirst<T extends Game>(games: T[]): T[] {
  return games.sort(
    (a, b) =>
      (a.playedOn < b.playedOn ? 1 : a.playedOn > b.playedOn ? -1 : 0) ||
      (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
  );
}

/** Members in the order an admin deals with them: waiting first, then newest request. */
export function sortMembers(members: Member[]): Member[] {
  const rank: Record<MemberStatus, number> = { pending: 0, approved: 1, rejected: 2 };
  return members.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0),
  );
}

/** Biggest winner first, then by name. */
export function sortEntries<T extends { playerName: string; buyInCents: number; cashOutCents: number }>(
  entries: T[],
): T[] {
  return entries.sort(
    (a, b) =>
      b.cashOutCents - b.buyInCents - (a.cashOutCents - a.buyInCents) ||
      (a.playerName < b.playerName ? -1 : a.playerName > b.playerName ? 1 : 0),
  );
}
