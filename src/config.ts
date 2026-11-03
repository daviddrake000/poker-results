// Set in .env.local (see .env.example) or in the host's settings. The
// publishable key is meant to ship in the browser: it grants only what Row
// Level Security allows. Never use a secret or service_role key here.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';

export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** What everyone buys in for unless the admin changes it: $30.00. */
export const STANDARD_BUY_IN_CENTS = 3000;

/**
 * Nights played before this app. Only per-player totals came across (the
 * carryover table), so the number of nights is recorded here for the
 * standings' game count.
 */
export const CARRIED_OVER_GAMES = 11;
