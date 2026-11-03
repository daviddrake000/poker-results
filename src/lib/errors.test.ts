import { describe, expect, it } from 'vitest';
import { FriendlyError, NOT_ADMIN_MESSAGE, friendlyMessage } from './errors';

describe('friendlyMessage', () => {
  it('turns the balance trigger’s "off by" into plain words', () => {
    // Raised by assert_game_balances(): off by = cash-outs − buy-ins.
    expect(friendlyMessage({ message: 'Game does not balance: 4000 in, 3500 out (off by -500)', code: 'P0001' })).toBe(
      'This night doesn’t balance yet. Cash-outs are $5.00 less than buy-ins.',
    );
    expect(friendlyMessage({ message: 'Game does not balance: 4000 in, 4001 out (off by 1)' })).toBe(
      'This night doesn’t balance yet. Cash-outs are $0.01 more than buy-ins.',
    );
  });

  it('explains the 2-player rule', () => {
    expect(friendlyMessage({ message: 'Game needs at least 2 players before it can be finalized' })).toBe(
      'A game needs at least 2 players before it can be finalized.',
    );
  });

  it('explains the finalized-game lock', () => {
    expect(
      friendlyMessage({ message: 'This game is finalized. Set it back to draft before editing entries.' }),
    ).toMatch(/Reopen it to edit/);
  });

  it('explains an RLS refusal', () => {
    expect(friendlyMessage({ code: '42501', message: 'new row violates row-level security policy for table "games"' })).toBe(
      NOT_ADMIN_MESSAGE,
    );
  });

  it('explains duplicate names and players', () => {
    expect(
      friendlyMessage({ code: '23505', message: 'duplicate key value violates unique constraint "players_name_key"' }),
    ).toBe('A player with that name already exists.');
    expect(
      friendlyMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint "game_entries_game_id_player_id_key"',
      }),
    ).toBe('That player is already in this game.');
  });

  it('explains sign-in and network failures', () => {
    expect(friendlyMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Wrong email or password.',
    );
    expect(friendlyMessage(new TypeError('Failed to fetch'))).toMatch(/Can’t reach the database/);
  });

  it('explains sign-up problems', () => {
    expect(friendlyMessage({ code: 'user_already_exists', message: 'User already registered' })).toMatch(
      /already exists\. Sign in instead/,
    );
    expect(friendlyMessage({ code: 'weak_password', message: 'Password should be at least 6 characters' })).toMatch(
      /too weak/,
    );
    expect(friendlyMessage({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toMatch(
      /sign-ups are turned off/,
    );
    expect(friendlyMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toMatch(
      /Too many attempts/,
    );
  });

  it('says when the members table hasn’t been created yet', () => {
    expect(
      friendlyMessage({ code: 'PGRST205', message: "Could not find the table 'public.members' in the schema cache" }),
    ).toMatch(/isn’t set up for members yet/);
  });

  it('passes friendly errors and unknown errors through unchanged', () => {
    expect(friendlyMessage(new FriendlyError('Already friendly'))).toBe('Already friendly');
    expect(friendlyMessage({ message: 'Something new' })).toBe('Something new');
    expect(friendlyMessage('plain string')).toBe('plain string');
  });
});
