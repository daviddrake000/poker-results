import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // Fail the build rather than deploy a site that can't reach its database.
  if (command === 'build' && mode !== 'fake') {
    const env = loadEnv(mode, '.', 'VITE_');
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing ${missing.join(' and ')}: set them in .env.local or the host's settings.`);
    }
  }

  return {
    plugins: [react()],
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
