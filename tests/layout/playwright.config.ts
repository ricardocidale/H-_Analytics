import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Browser resolution ────────────────────────────────────────────────────
//
// Priority order:
//   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var (explicit override)
//   2. Nix-store Chromium (Replit dev environment — NixOS-based)
//   3. undefined → Playwright uses its own downloaded Chromium (Ubuntu CI,
//      installed via `playwright install --with-deps chromium`)

const NIX_CHROMIUM =
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

function resolveExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  if (fs.existsSync(NIX_CHROMIUM)) {
    return NIX_CHROMIUM;
  }
  // Let Playwright use its own downloaded browser (CI environment).
  return undefined;
}

export default defineConfig({
  testDir: "./tests",
  timeout: 20_000,
  use: {
    headless: true,
    viewport: { width: 768, height: 1024 },
    launchOptions: {
      executablePath: resolveExecutablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  projects: [
    {
      name: "chromium-768px",
      use: { viewport: { width: 768, height: 1024 } },
    },
  ],
  reporter: [["list"]],
});
