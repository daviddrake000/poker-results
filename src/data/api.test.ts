import { describe, expect, it } from 'vitest';
import { rankPlayers, sortMembers, statFromRow, type StatRow } from './api';
import type { Member } from './types';

const base: StatRow = {
  id: 'p1',
  name: 'Ann',
  games_played: 9,
  net_cents: 31250,
  best_night_cents: 0,
  worst_night_cents: 0,
  winning_nights: 0,
};

describe('statFromRow', () => {
  it('reads the carry-over columns once the carry-over SQL is applied', () => {
    expect(statFromRow({ ...base, tracked_games: 0, carried_games: 9, carried_net_cents: 31250 })).toMatchObject({
      gamesPlayed: 9,
      netCents: 31250,
      trackedGames: 0,
      carriedGames: 9,
      carriedNetCents: 31250,
    });
  });

  it('treats every game as played here before the carry-over SQL exists', () => {
    expect(statFromRow({ ...base, games_played: 3, net_cents: 1500 })).toMatchObject({
      gamesPlayed: 3,
      trackedGames: 3,
      carriedGames: 0,
      carriedNetCents: 0,
    });
  });

  it('accepts bigint columns that arrive as strings', () => {
    expect(statFromRow({ ...base, net_cents: '-12345' as unknown as number }).netCents).toBe(-12345);
  });
});

describe('rankPlayers', () => {
  it('ranks carried-over players with everyone else, best net first, ties by name', () => {
    const ranked = rankPlayers([
      statFromRow({ ...base, id: 'b', name: 'Ben', games_played: 2, net_cents: -5000 }),
      statFromRow({ ...base, id: 'c', name: 'Cat', games_played: 10, net_cents: -5000 }),
      statFromRow({ ...base, id: 'a', name: 'Ann', games_played: 9, net_cents: 31250 }),
      statFromRow({ ...base, id: 'x', name: 'Nobody', games_played: 0, net_cents: 0 }),
    ]);
    expect(ranked.map((p) => p.name)).toEqual(['Ann', 'Ben', 'Cat']);
  });
});

function member(name: string, status: Member['status'], requestedAt: string): Member {
  return {
    userId: name,
    email: `${name}@example.test`,
    displayName: name,
    status,
    isAdmin: false,
    requestedAt,
    decidedAt: null,
  };
}

describe('sortMembers', () => {
  it('puts people waiting first, then members, then rejected; newest request first in each', () => {
    const sorted = sortMembers([
      member('old-member', 'approved', '2026-09-01T00:00:00Z'),
      member('rejected', 'rejected', '2026-10-10T00:00:00Z'),
      member('older-wait', 'pending', '2026-10-14T00:00:00Z'),
      member('new-member', 'approved', '2026-10-01T00:00:00Z'),
      member('newer-wait', 'pending', '2026-10-16T00:00:00Z'),
    ]);
    expect(sorted.map((m) => m.userId)).toEqual(['newer-wait', 'older-wait', 'new-member', 'old-member', 'rejected']);
  });
});
