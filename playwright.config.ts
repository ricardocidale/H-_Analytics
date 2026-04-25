import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for executable browser-driven e2e tests.
 *
 * Playwright owns its dev server: the `webServer` block below spawns
 * a dedicated `npm run dev` process on port 8080 with the
 * `PHOTO_ENHANCE_TEST_MODE=1` bypass enabled. This keeps the human
 * dev server on port 5000 untouched (so interactive AI enhance
 * still hits real Replicate during normal development) while
 * letting CI exercise the enhance → preview → accept lifecycle
 * deterministically without burning Replicate quota.
 *
 * The bypass is gated server-side to dev only — it is ignored
 * whenever `NODE_ENV === "production"`.
 *
 * To run locally:
 *
 *     npx playwright test tests/playwright/photo-album.spec.ts
 *
 * To target a specific server (e.g. an already-running dev instance
 * with bypass enabled), set `E2E_BASE_URL` and the spec will hit
 * that origin instead. In that case, set `PW_NO_WEBSERVER=1` to skip
 * Playwright's own server.
 *
 * In dev, `server/dev-flags.ts` sets `DEV_SKIP_AUTH = true`, which
 * auto-grants the seeded super_admin session, so specs do not need
 * to perform an interactive login.
 */
const PW_PORT = 8080;
const useExternalServer = !!process.env.E2E_BASE_URL || process.env.PW_NO_WEBSERVER === "1";

export default defineConfig({
  testDir: "tests/playwright",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 240_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://localhost:${PW_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: useExternalServer
    ? undefined
    : {
        // Invoke tsx directly (rather than `npm run dev`) so the
        // server is launched without an npm-script wrapper. The
        // wrapper is incompatible with some sandboxed shells used in
        // CI that intercept `npm run dev`.
        command: "npx tsx server/index.ts",
        url: `http://localhost:${PW_PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PORT: String(PW_PORT),
          NODE_ENV: "development",
          PHOTO_ENHANCE_TEST_MODE: "1",
        },
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
