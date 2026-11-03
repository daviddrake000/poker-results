// DEV ONLY. An in-memory stand-in for Supabase so the screens can be built
// and clicked through without the real project. It copies the rules the real
// database enforces (members-only reads, drafts for admins only, balance
// check on finalize, locked entries, unique names, pending sign-ups) but
// proves nothing about the real RLS. Loaded only by `npm run dev:fake`;
// never shipped.

import { FriendlyError, NOT_ADMIN_MESSAGE, friendlyMessage } from '../lib/errors';
import { isUuid, newestFirst, rankPlayers, sortEntries, sortMembers, type PokerApi } from './api';
import type { Game, GameStatus, Member, MemberStatus, Player, PlayerStat, Session } from './types';

/**
 * Test-only accounts for the fake database. Not real accounts anywhere.
 * All use the same password.
 */
export const FAKE_PASSWORD = 'fake-dev-only';
export const FAKE_ACCOUNTS = {
  admin: 'admin@example.test',
  approvedMember: 'member@example.test',
  pendingMember: 'hal@example.test',
} as const;

interface FakeUser {
  userId: string;
  email: string;
  password: string;
}

interface FakeEntry {
  id: string;
  gameId: string;
  playerId: string;
  buyInCents: number;
  cashOutCents: number;
}

/** Like the carryover table: totals from before this app. */
interface FakeCarryover {
  playerId: string;
  gamesPlayed: number;
  netCents: number;
}

interface FakeState {
  players: Player[];
  games: Game[];
  entries: FakeEntry[];
  carryover: FakeCarryover[];
  users: FakeUser[];
  members: Omit<Member, 'isAdmin'>[];
  admins: string[];
  session: Session | null;
}

const STORAGE_KEY = 'poker-fake-db-v5';

function uuid(): string {
  return crypto.randomUUID();
}

function seed(): FakeState {
  // Gus only has carried-over games, to show a player with no games here yet.
  const names = ['Ann', 'Ben', 'Cat', 'Dev', 'Eve', 'Fay', 'Gus', 'Hal'];
  const players = names.map((name) => ({ id: uuid(), name, active: true }));
  const id = (name: string) => players.find((p) => p.name === name)!.id;
  const game = (playedOn: string, status: GameStatus, location: string | null): Game => ({
    id: uuid(),
    playedOn,
    location,
    notes: null,
    status,
    createdAt: `${playedOn}T23:00:00Z`,
  });
  const g1 = game('2026-09-18', 'final', 'Ann’s place');
  const g2 = game('2026-10-02', 'final', 'Ben’s kitchen');
  const g3 = game('2026-10-16', 'draft', 'Cat’s basement');
  const row = (g: Game, name: string, buyIn: number, cashOut: number): FakeEntry => ({
    id: uuid(),
    gameId: g.id,
    playerId: id(name),
    buyInCents: buyIn,
    cashOutCents: cashOut,
  });
  const account = (email: string, displayName: string, status: MemberStatus, requestedAt: string) => {
    const user = { userId: uuid(), email, password: FAKE_PASSWORD };
    const member = {
      userId: user.userId,
      email,
      displayName,
      status,
      requestedAt,
      decidedAt: status === 'pending' ? null : requestedAt,
    };
    return { user, member };
  };
  const accounts = [
    account(FAKE_ACCOUNTS.admin, 'Admin', 'approved', '2026-09-01T12:00:00Z'),
    account(FAKE_ACCOUNTS.approvedMember, 'Ann', 'approved', '2026-09-20T12:00:00Z'),
    account(FAKE_ACCOUNTS.pendingMember, 'Hal', 'pending', '2026-10-15T18:30:00Z'),
    account('kim@example.test', 'Kim', 'pending', '2026-10-16T09:10:00Z'),
  ];
  return {
    users: accounts.map((a) => a.user),
    members: accounts.map((a) => a.member),
    admins: [accounts[0]!.user.userId],
    players,
    // Sums to zero, like a real import.
    carryover: [
      { playerId: id('Ann'), gamesPlayed: 3, netCents: 2500 },
      { playerId: id('Hal'), gamesPlayed: 2, netCents: -1000 },
      { playerId: id('Gus'), gamesPlayed: 2, netCents: -1500 },
    ],
    games: [g1, g2, g3],
    entries: [
      row(g1, 'Ann', 2000, 3500),
      row(g1, 'Ben', 2000, 500),
      row(g1, 'Cat', 4000, 4000),
      row(g2, 'Ann', 2000, 0),
      row(g2, 'Ben', 4000, 7250),
      row(g2, 'Dev', 2000, 1250),
      row(g2, 'Eve', 2000, 1500),
      row(g3, 'Cat', 2000, 0),
      row(g3, 'Dev', 2000, 3000),
    ],
    session: null,
  };
}

function load(): FakeState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as FakeState;
  } catch {
    // Storage blocked or corrupt: start from the seed.
  }
  return seed();
}

export function createFakeApi(): PokerApi {
  const state = load();
  const listeners = new Set<(s: Session | null) => void>();

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Fine: the fake just won't survive a reload.
    }
  };
  const delay = () => new Promise((r) => setTimeout(r, 120));
  const isAdmin = () => !!state.session && state.admins.includes(state.session.userId);
  const memberRow = () => state.members.find((m) => m.userId === state.session?.userId);
  // Mirrors is_member(): admins and approved members can read.
  const isMember = () => isAdmin() || memberRow()?.status === 'approved';
  const requireAdmin = () => {
    if (!isAdmin()) throw new FriendlyError(NOT_ADMIN_MESSAGE);
  };
  const setSession = (session: Session | null) => {
    state.session = session;
    persist();
    listeners.forEach((l) => l(session));
  };
  // What RLS lets the caller see: nothing for non-members, drafts only for admins.
  const visibleGames = () =>
    isMember() ? state.games.filter((g) => g.status === 'final' || isAdmin()) : [];
  const entriesOf = (gameId: string) => state.entries.filter((e) => e.gameId === gameId);
  const findGame = (id: string) => state.games.find((g) => g.id === id);
  const assertUnlocked = (gameId: string) => {
    if (findGame(gameId)?.status === 'final') {
      throw new FriendlyError(
        friendlyMessage({ message: 'This game is finalized. Set it back to draft before editing entries.' }),
      );
    }
  };

  return {
    async leaderboard() {
      await delay();
      if (!isMember()) return [];
      const finalIds = new Set(state.games.filter((g) => g.status === 'final').map((g) => g.id));
      return rankPlayers(
        state.players.map((p): PlayerStat => {
          const nets = state.entries
            .filter((e) => e.playerId === p.id && finalIds.has(e.gameId))
            .map((e) => e.cashOutCents - e.buyInCents);
          const carried = state.carryover.filter((c) => c.playerId === p.id);
          const carriedGames = carried.reduce((s, c) => s + c.gamesPlayed, 0);
          const carriedNetCents = carried.reduce((s, c) => s + c.netCents, 0);
          // Same arithmetic as the player_stats view.
          return {
            id: p.id,
            name: p.name,
            gamesPlayed: nets.length + carriedGames,
            netCents: nets.reduce((a, b) => a + b, 0) + carriedNetCents,
            bestNightCents: nets.length ? Math.max(...nets) : 0,
            worstNightCents: nets.length ? Math.min(...nets) : 0,
            winningNights: nets.filter((n) => n > 0).length,
            trackedGames: nets.length,
            carriedGames,
            carriedNetCents,
          };
        }),
      );
    },

    async games(status) {
      await delay();
      return newestFirst(
        visibleGames()
          .filter((g) => g.status === status)
          .map((g) => {
            const rows = entriesOf(g.id);
            return { ...g, playerCount: rows.length, potCents: rows.reduce((s, e) => s + e.buyInCents, 0) };
          }),
      );
    },

    async game(id, { finalOnly }) {
      await delay();
      if (!isUuid(id)) return null;
      const g = visibleGames().find((x) => x.id === id && (!finalOnly || x.status === 'final'));
      if (!g) return null;
      return {
        ...g,
        entries: sortEntries(
          entriesOf(g.id).map((e) => ({
            id: e.id,
            playerId: e.playerId,
            playerName: state.players.find((p) => p.id === e.playerId)?.name ?? 'Unknown player',
            buyInCents: e.buyInCents,
            cashOutCents: e.cashOutCents,
          })),
        ),
      };
    },

    async players() {
      await delay();
      if (!isMember()) return [];
      return [...state.players].sort((a, b) => (a.name < b.name ? -1 : 1));
    },

    async addPlayer(name) {
      await delay();
      requireAdmin();
      if (state.players.some((p) => p.name === name)) {
        throw new FriendlyError(friendlyMessage({ code: '23505', message: 'players_name_key' }));
      }
      const player = { id: uuid(), name, active: true };
      state.players.push(player);
      persist();
      return player;
    },

    async createGame(details) {
      await delay();
      requireAdmin();
      const game: Game = {
        id: uuid(),
        ...details,
        status: 'draft',
        createdAt: new Date().toISOString(),
      };
      state.games.push(game);
      persist();
      return game;
    },

    async updateGameDetails(id, details) {
      await delay();
      requireAdmin();
      const g = findGame(id);
      if (!g) throw new FriendlyError(NOT_ADMIN_MESSAGE);
      Object.assign(g, details);
      persist();
    },

    async saveEntries(gameId, entries) {
      await delay();
      requireAdmin();
      assertUnlocked(gameId);
      if (entries.some((e) => e.buyInCents < 0 || e.cashOutCents < 0)) {
        throw new FriendlyError(friendlyMessage({ code: '23514', message: 'check violation' }));
      }
      const others = state.entries.filter((e) => e.gameId !== gameId);
      const existing = entriesOf(gameId);
      state.entries = [
        ...others,
        ...entries.map((e) => ({
          id: existing.find((x) => x.playerId === e.playerId)?.id ?? uuid(),
          gameId,
          ...e,
        })),
      ];
      persist();
    },

    async setStatus(id, status) {
      await delay();
      requireAdmin();
      const g = findGame(id);
      if (!g) throw new FriendlyError(NOT_ADMIN_MESSAGE);
      if (status === 'final') {
        const rows = entriesOf(id);
        const totalIn = rows.reduce((s, e) => s + e.buyInCents, 0);
        const totalOut = rows.reduce((s, e) => s + e.cashOutCents, 0);
        if (rows.length < 2) {
          throw new FriendlyError(friendlyMessage({ message: 'Game needs at least 2 players before it can be finalized' }));
        }
        if (totalIn !== totalOut) {
          throw new FriendlyError(
            friendlyMessage({
              message: `Game does not balance: ${totalIn} in, ${totalOut} out (off by ${totalOut - totalIn})`,
            }),
          );
        }
      }
      g.status = status;
      persist();
    },

    async deleteDraft(id) {
      await delay();
      requireAdmin();
      if (findGame(id)?.status !== 'draft') throw new FriendlyError(NOT_ADMIN_MESSAGE);
      state.games = state.games.filter((g) => g.id !== id);
      state.entries = state.entries.filter((e) => e.gameId !== id);
      persist();
    },

    async getSession() {
      return state.session;
    },

    onAuthChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    async signIn(email, password) {
      await delay();
      const user = state.users.find((u) => u.email === email.trim().toLowerCase());
      if (!user || user.password !== password) {
        throw new FriendlyError(friendlyMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }));
      }
      setSession({ userId: user.userId, email: user.email });
    },

    async signUp({ email, password, displayName }) {
      await delay();
      const clean = email.trim().toLowerCase();
      if (state.users.some((u) => u.email === clean)) {
        throw new FriendlyError(friendlyMessage({ code: 'user_already_exists', message: 'User already registered' }));
      }
      // Like handle_new_user(): every sign-up starts as a pending member.
      const user = { userId: uuid(), email: clean, password };
      state.users.push(user);
      state.members.push({
        userId: user.userId,
        email: clean,
        displayName: displayName || null,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        decidedAt: null,
      });
      // The fake skips the confirmation email and signs straight in.
      setSession({ userId: user.userId, email: clean });
      return { needsConfirmation: false };
    },

    async signOut() {
      setSession(null);
    },

    async myAccess() {
      await delay();
      if (!state.session) return 'none';
      if (isAdmin()) return 'admin';
      return memberRow()?.status ?? 'none';
    },

    async members() {
      await delay();
      requireAdmin();
      return sortMembers(state.members.map((m) => ({ ...m, isAdmin: state.admins.includes(m.userId) })));
    },

    async setMemberStatus(userId, status) {
      await delay();
      requireAdmin();
      const member = state.members.find((m) => m.userId === userId);
      if (!member) throw new FriendlyError(NOT_ADMIN_MESSAGE);
      if (member.status !== status) {
        member.status = status;
        member.decidedAt = new Date().toISOString();
      }
      persist();
    },
  };
}
