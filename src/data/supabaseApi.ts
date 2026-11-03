import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';
import { FriendlyError, NOT_ADMIN_MESSAGE, friendlyMessage } from '../lib/errors';
import {
  isUuid,
  newestFirst,
  rankPlayers,
  sortEntries,
  sortMembers,
  statFromRow,
  type PokerApi,
  type StatRow,
} from './api';
import type {
  Game,
  GameStatus,
  GameSummary,
  GameWithEntries,
  Member,
  MemberStatus,
  Player,
  Session,
} from './types';

interface GameRow {
  id: string;
  played_on: string;
  location: string | null;
  notes: string | null;
  status: GameStatus;
  created_at: string;
}

interface EntryRow {
  id: string;
  player_id: string;
  buy_in_cents: number;
  cash_out_cents: number;
  players: { name: string } | null;
}

interface MemberRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  status: MemberStatus;
  requested_at: string;
  decided_at: string | null;
}

const GAME_COLUMNS = 'id, played_on, location, notes, status, created_at';

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    playedOn: row.played_on,
    location: row.location,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toSession(session: SupabaseSession | null): Session | null {
  return session ? { userId: session.user.id, email: session.user.email ?? null } : null;
}

/** Throw a friendly error if Supabase returned one. */
function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new FriendlyError(friendlyMessage(result.error));
  return result.data;
}

/**
 * RLS doesn't raise an error when it filters an update or delete down to no
 * rows; it just changes nothing. Treat "changed fewer rows than expected" as
 * a refusal so a non-admin never sees a false "Saved".
 */
function expectRows(rows: unknown[] | null, expected: number): void {
  if ((rows?.length ?? 0) < expected) throw new FriendlyError(NOT_ADMIN_MESSAGE);
}

export function createSupabaseApi(): PokerApi {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY: copy .env.example to .env.local.');
  }
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  return {
    async leaderboard() {
      const rows = check(await db.from('player_stats').select('*').gt('games_played', 0)) as StatRow[];
      return rankPlayers(rows.map(statFromRow));
    },

    async games(status) {
      const rows = check(
        await db
          .from('games')
          .select(`${GAME_COLUMNS}, game_entries(buy_in_cents)`)
          .eq('status', status)
          .order('played_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ) as (GameRow & { game_entries: { buy_in_cents: number }[] })[];
      return newestFirst(
        rows.map(
          (r): GameSummary => ({
            ...toGame(r),
            playerCount: r.game_entries.length,
            potCents: r.game_entries.reduce((sum, e) => sum + e.buy_in_cents, 0),
          }),
        ),
      );
    },

    async game(id, { finalOnly }) {
      if (!isUuid(id)) return null;
      let query = db
        .from('games')
        .select(`${GAME_COLUMNS}, game_entries(id, player_id, buy_in_cents, cash_out_cents, players(name))`)
        .eq('id', id);
      if (finalOnly) query = query.eq('status', 'final');
      const row = check(await query.maybeSingle()) as (GameRow & { game_entries: EntryRow[] }) | null;
      if (!row) return null;
      const game: GameWithEntries = {
        ...toGame(row),
        entries: sortEntries(
          row.game_entries.map((e) => ({
            id: e.id,
            playerId: e.player_id,
            playerName: e.players?.name ?? 'Unknown player',
            buyInCents: e.buy_in_cents,
            cashOutCents: e.cash_out_cents,
          })),
        ),
      };
      return game;
    },

    async players() {
      const rows = check(await db.from('players').select('id, name, active').order('name')) as Player[];
      return rows;
    },

    async addPlayer(name) {
      return check(await db.from('players').insert({ name }).select('id, name, active').single()) as Player;
    },

    async createGame(details) {
      const row = check(
        await db
          .from('games')
          .insert({ played_on: details.playedOn, location: details.location, notes: details.notes })
          .select(GAME_COLUMNS)
          .single(),
      );
      return toGame(row as GameRow);
    },

    async updateGameDetails(id, details) {
      const rows = check(
        await db
          .from('games')
          .update({ played_on: details.playedOn, location: details.location, notes: details.notes })
          .eq('id', id)
          .select('id'),
      );
      expectRows(rows, 1);
    },

    async saveEntries(gameId, entries) {
      // Not one transaction: if a step fails the screen keeps what was typed
      // and the admin can save again, which converges on the same rows.
      if (entries.length > 0) {
        const rows = check(
          await db
            .from('game_entries')
            .upsert(
              entries.map((e) => ({
                game_id: gameId,
                player_id: e.playerId,
                buy_in_cents: e.buyInCents,
                cash_out_cents: e.cashOutCents,
              })),
              { onConflict: 'game_id,player_id' },
            )
            .select('id'),
        );
        expectRows(rows, entries.length);
      }

      const existing = check(await db.from('game_entries').select('player_id').eq('game_id', gameId)) as {
        player_id: string;
      }[];
      const keep = new Set(entries.map((e) => e.playerId));
      const stale = existing.filter((r) => !keep.has(r.player_id)).map((r) => r.player_id);
      if (stale.length > 0) {
        const rows = check(
          await db.from('game_entries').delete().eq('game_id', gameId).in('player_id', stale).select('id'),
        );
        expectRows(rows, stale.length);
      }
    },

    async setStatus(id, status) {
      const rows = check(await db.from('games').update({ status }).eq('id', id).select('id'));
      expectRows(rows, 1);
    },

    async deleteDraft(id) {
      const rows = check(await db.from('games').delete().eq('id', id).eq('status', 'draft').select('id'));
      expectRows(rows, 1);
    },

    async getSession() {
      const { data } = await db.auth.getSession();
      return toSession(data.session);
    },

    onAuthChange(callback) {
      const { data } = db.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw new FriendlyError(friendlyMessage(error));
    },

    async signUp({ email, password, displayName }) {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          // Read by the handle_new_user() trigger into members.display_name.
          data: { display_name: displayName },
          // Where the confirmation link lands. Must be in Supabase's redirect allow list.
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw new FriendlyError(friendlyMessage(error));
      // With "Confirm email" on, Supabase doesn't say outright that an email is
      // taken (so strangers can't probe for accounts); it returns a user with
      // no identities instead.
      if (data.user && data.user.identities?.length === 0) {
        throw new FriendlyError(friendlyMessage({ code: 'user_already_exists', message: 'User already registered' }));
      }
      return { needsConfirmation: data.session === null };
    },

    async signOut() {
      const { error } = await db.auth.signOut();
      if (error) throw new FriendlyError(friendlyMessage(error));
    },

    async myAccess() {
      const { data } = await db.auth.getSession();
      if (!data.session) return 'none';
      const userId = data.session.user.id;
      // Admins first: they don't depend on the members table at all.
      const admin = check(await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle());
      if (admin) return 'admin';
      const member = check(
        await db.from('members').select('status').eq('user_id', userId).maybeSingle(),
      ) as { status: MemberStatus } | null;
      return member?.status ?? 'none';
    },

    async members() {
      const [rows, admins] = await Promise.all([
        db.from('members').select('user_id, email, display_name, status, requested_at, decided_at'),
        db.from('admins').select('user_id'),
      ]);
      const adminIds = new Set((check(admins) as { user_id: string }[]).map((a) => a.user_id));
      return sortMembers(
        (check(rows) as MemberRow[]).map(
          (r): Member => ({
            userId: r.user_id,
            email: r.email,
            displayName: r.display_name,
            status: r.status,
            isAdmin: adminIds.has(r.user_id),
            requestedAt: r.requested_at,
            decidedAt: r.decided_at,
          }),
        ),
      );
    },

    async setMemberStatus(userId, status) {
      const rows = check(await db.from('members').update({ status }).eq('user_id', userId).select('user_id'));
      expectRows(rows, 1);
    },
  };
}
