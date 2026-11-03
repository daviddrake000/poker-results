import type { PokerApi } from './api';

let instance: PokerApi | null = null;

/** Pick the backend once at startup: the real Supabase project, or the dev-only fake. */
export async function initApi(): Promise<void> {
  if (import.meta.env.MODE === 'fake') {
    instance = (await import('./fakeApi')).createFakeApi();
  } else {
    instance = (await import('./supabaseApi')).createSupabaseApi();
  }
}

export function api(): PokerApi {
  if (!instance) throw new Error('initApi() must run before the app renders');
  return instance;
}
