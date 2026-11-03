import { describeDifference } from './sheet';

/** An error whose message is ready to show to the admin. */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlyError';
  }
}

interface RawError {
  message?: string;
  code?: string;
}

export const NOT_ADMIN_MESSAGE =
  'The database refused the change because this account isn’t an admin. Ask the owner to add you to the admins table.';

/**
 * Turn a database, auth or network error into a plain sentence.
 * Unknown errors keep their original text so nothing is hidden.
 */
export function friendlyMessage(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const raw: RawError = typeof error === 'object' && error !== null ? (error as RawError) : {};
  const message = raw.message ?? String(error);

  const offBy = /off by (-?\d+)/.exec(message);
  if (offBy) {
    return `This night doesn’t balance yet. ${describeDifference(Number(offBy[1]))}.`;
  }
  if (/at least 2 players/i.test(message)) {
    return 'A game needs at least 2 players before it can be finalized.';
  }
  if (/game is finalized/i.test(message)) {
    return 'This game is finalized, so its entries are locked. Reopen it to edit.';
  }
  if (raw.code === '42501' || /row-level security/i.test(message)) {
    return NOT_ADMIN_MESSAGE;
  }
  if (raw.code === '23505') {
    if (/players_name_key|\(name\)/.test(message)) return 'A player with that name already exists.';
    return 'That player is already in this game.';
  }
  if (raw.code === '23514') {
    return 'Amounts can’t be negative.';
  }
  if (raw.code === 'PGRST205' || raw.code === '42P01') {
    return 'The database isn’t set up for members yet. The owner needs to run the members SQL in supabase/proposed/.';
  }
  if (raw.code === 'user_already_exists' || /user already registered/i.test(message)) {
    return 'An account with that email already exists. Sign in instead.';
  }
  if (raw.code === 'weak_password') {
    return 'That password is too weak. Use at least 8 characters, mixing letters and numbers.';
  }
  if (raw.code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return 'New sign-ups are turned off right now. Ask an admin.';
  }
  if (raw.code === 'email_address_invalid') {
    return 'That email address doesn’t look right.';
  }
  if (raw.code === 'over_email_send_rate_limit' || raw.code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (raw.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Wrong email or password.';
  }
  if (raw.code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'This account’s email isn’t confirmed. The owner can confirm the user in the Supabase dashboard.';
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'Can’t reach the database. Check your connection and try again.';
  }
  return message;
}
