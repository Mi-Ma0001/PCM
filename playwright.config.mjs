// Tests de bout en bout : npm run test:e2e (construit dist/ puis lance les tests)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  use: { baseURL: 'http://localhost:4173', locale: 'fr-FR', timezoneId: 'Africa/Tunis', trace: 'retain-on-failure' },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile-android', use: { ...devices['Pixel 7'] } }
  ],
  webServer: [
    { command: 'node scripts/serve.mjs dist 4173', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, env: { PMCMS_CSP_EXTRA: 'http://127.0.0.1:54399' } },
    { command: 'node tests/e2e/supabase-simule.mjs 54399', url: 'http://127.0.0.1:54399/__test/plans', reuseExistingServer: !process.env.CI }
  ]
});
