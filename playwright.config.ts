import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4318',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node tests/fixtures/dify-server.mjs',
      url: 'http://127.0.0.1:4319/health',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm build && pnpm start --hostname 127.0.0.1 --port 4318',
      url: 'http://127.0.0.1:4318',
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        // Match Vercel's build output (no Docker standalone symlinks).
        VERCEL: '1',
        VERCEL_ENV: '',
        CHAT_LOG_MODE: 'test',
        CHAT_LOG_URL: 'http://127.0.0.1:4319/chat-log',
        CHAT_LOG_SECRET: 'local-chat-log-test-secret-12345678',
        NEXT_PUBLIC_APP_ID: 'ci-test-app',
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4319/v1',
        DIFY_API_KEY: 'ci-test-key',
        NEXT_PUBLIC_APP_KEY: '',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
})
