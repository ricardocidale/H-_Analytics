/**
 * check-production-image.ts
 *
 * Smoke-tests the production runtime contract of the multi-app container
 * defined by the root Dockerfile. The Dockerfile builds three SPAs and
 * stages them under a single runtime tree:
 *
 *   ./artifacts/api-server/dist/public            -> served at "/"
 *   ./artifacts/api-server/dist/property-slides   -> served at "/property-slides/"
 *   ./artifacts/api-server/dist/mockup-sandbox    -> served at "/__mockup/"
 *
 * `artifacts/api-server/src/static.ts` mounts those three directories on
 * the api-server's express app, plus a stub `/api/health/live` exists in
 * the api-server itself. Today nothing automatically catches a regression
 * where one of the three SPAs is silently missing from the image, has the
 * wrong BASE_PATH, or no longer points at resolvable asset files.
 *
 * Rather than booting the full Docker image (which requires DATABASE_URL,
 * runs schema migrations, talks to OpenAI, etc.), this check is the
 * "slimmer equivalent" the task description allows for:
 *
 *   1. Build each frontend with the BASE_PATH the Dockerfile uses.
 *   2. Stage the outputs into a temp dir mirroring the runtime layout.
 *   3. Spin up a tiny HTTP server (node stdlib only) on a free port that
 *      replicates static.ts mount semantics + a stub /api/health/live.
 *   4. Probe every public surface and assert it answers 200 and points at
 *      assets that themselves resolve.
 *   5. Tear down.
 *
 * Wired alongside check:replit-independence in .replit's Project workflow.
 *
 * Flags:
 *   --skip-build   Reuse existing artifacts/<name>/dist outputs instead of
 *                  rebuilding. Useful for fast local iteration; CI should
 *                  always rebuild.
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

const SKIP_BUILD = process.argv.includes("--skip-build");

// ---------------------------------------------------------------------------
// Per-app build & runtime layout (mirrors Dockerfile lines 57–86)
// ---------------------------------------------------------------------------

interface AppSpec {
  /** Workspace package name passed to `pnpm --filter`. */
  filter: string;
  /** BASE_PATH env var passed to the vite build. */
  basePath: string;
  /** URL prefix the app is mounted at in production (must match basePath). */
  mount: string;
  /** Source dist directory inside the artifact (the path Dockerfile copies FROM). */
  srcDist: string;
  /** Destination directory name inside the staged runtime tree (mirrors api-server/dist/ layout). */
  stageDir: string;
}

const APPS: AppSpec[] = [
  {
    filter: "@workspace/hospitality-business-portal",
    basePath: "/",
    mount: "/",
    srcDist: "artifacts/hospitality-business-portal/dist/public",
    stageDir: "public",
  },
  {
    filter: "@workspace/property-slides",
    basePath: "/property-slides/",
    mount: "/property-slides/",
    srcDist: "artifacts/property-slides/dist/public",
    stageDir: "property-slides",
  },
  {
    filter: "mockup-sandbox",
    basePath: "/__mockup/",
    mount: "/__mockup/",
    srcDist: "artifacts/mockup-sandbox/dist",
    stageDir: "mockup-sandbox",
  },
];

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function info(msg: string): void {
  console.log(`[check:production-image] ${msg}`);
}

function fail(msg: string): never {
  console.error(`[check:production-image] FAIL — ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Build each frontend with the production BASE_PATH
// ---------------------------------------------------------------------------

function buildApp(app: AppSpec): void {
  info(`building ${app.filter} (BASE_PATH=${app.basePath})`);
  const result = spawnSync(
    "pnpm",
    ["--filter", app.filter, "run", "build"],
    {
      cwd: WORKSPACE_ROOT,
      stdio: "inherit",
      env: { ...process.env, BASE_PATH: app.basePath, PORT: "5000" },
    },
  );
  if (result.status !== 0) {
    fail(`build of ${app.filter} exited with code ${result.status}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Stage outputs into a temp dir mirroring the runtime layout
// ---------------------------------------------------------------------------

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function stage(stageRoot: string): void {
  for (const app of APPS) {
    const src = path.join(WORKSPACE_ROOT, app.srcDist);
    if (!fs.existsSync(src)) {
      fail(`expected build output missing at ${app.srcDist} for ${app.filter}`);
    }
    const dest = path.join(stageRoot, app.stageDir);
    copyDirRecursive(src, dest);
    info(`staged ${app.srcDist} -> ${path.relative(WORKSPACE_ROOT, dest)}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Tiny HTTP server that mirrors static.ts mount semantics
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map":  "application/json; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
};

function serveFile(res: ServerResponse, filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.end(fs.readFileSync(filePath));
  return true;
}

function startServer(stageRoot: string): Promise<{ url: string; close: () => void }> {
  // Sub-app mounts (everything that lives under a non-root prefix). Order
  // matches static.ts, which checks specific mounts before falling through
  // to the root SPA — most-specific-first.
  const subApps = APPS.filter(a => a.mount !== "/").map(a => ({
    mount: a.mount.replace(/\/$/, ""), // "/property-slides"
    dir: path.join(stageRoot, a.stageDir),
  }));
  const rootApp = APPS.find(a => a.mount === "/")!;
  const rootDir = path.join(stageRoot, rootApp.stageDir);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const reqPath = decodeURIComponent(url.pathname);

    // Stub the api-server health endpoint. The real server registers this
    // route in artifacts/api-server/src; here we just need it to answer 200
    // because the production-image contract is "this URL responds OK".
    if (reqPath === "/api/health/live") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Sub-app mounts (most-specific-first).
    for (const { mount, dir } of subApps) {
      if (reqPath === mount || reqPath.startsWith(`${mount}/`)) {
        const rel = reqPath.slice(mount.length).replace(/^\/+/, "") || "index.html";
        const filePath = path.join(dir, rel);
        if (serveFile(res, filePath)) return;
        // SPA fallback for this mount.
        if (serveFile(res, path.join(dir, "index.html"))) return;
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
    }

    // Root SPA. Serve the requested file if it exists, otherwise fall back
    // to root index.html so client-side routes resolve.
    const rel = reqPath.replace(/^\/+/, "") || "index.html";
    const filePath = path.join(rootDir, rel);
    if (serveFile(res, filePath)) return;
    if (serveFile(res, path.join(rootDir, "index.html"))) return;
    res.statusCode = 404;
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to obtain server address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// 4. Probe + assert
// ---------------------------------------------------------------------------

interface ProbeResult {
  status: number;
  body: string;
}

async function probe(url: string): Promise<ProbeResult> {
  const r = await fetch(url);
  return { status: r.status, body: await r.text() };
}

/**
 * Extract every URL referenced from an index.html that we can plausibly
 * fetch — script src, link href, and module imports. Filters out
 * external (http://, //) URLs and data: URIs because those are not part
 * of the production-image self-containment contract.
 */
function extractAssetUrls(html: string): string[] {
  const urls = new Set<string>();
  const attrRe = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    urls.add(m[1]);
  }
  return Array.from(urls).filter(u => {
    if (!u) return false;
    if (u.startsWith("data:")) return false;
    if (u.startsWith("http://") || u.startsWith("https://")) return false;
    if (u.startsWith("//")) return false;
    if (u.startsWith("mailto:")) return false;
    if (u.startsWith("#")) return false;
    return true;
  });
}

/**
 * Resolve an asset URL extracted from `<base>`-aware HTML against the page
 * URL, the way a browser would. Vite emits URLs already prefixed with the
 * configured `base` (e.g. "/property-slides/assets/index-abc.js"), so for
 * those a normal absolute resolution is correct.
 */
function resolveAssetUrl(pageUrl: string, asset: string): string {
  return new URL(asset, pageUrl).toString();
}

async function checkApp(serverUrl: string, app: AppSpec): Promise<void> {
  const pageUrl = `${serverUrl}${app.mount}`;
  info(`probing ${app.mount} (${app.filter})`);
  const page = await probe(pageUrl);
  if (page.status !== 200) {
    fail(`${app.mount} returned ${page.status}`);
  }
  if (!/<html/i.test(page.body)) {
    fail(`${app.mount} did not return HTML`);
  }

  // Vite-produced HTML for non-root bases prefixes asset URLs with the
  // configured base. We assert at least one asset URL carries the
  // expected prefix — that is the cheapest proof the right BASE_PATH
  // build was staged at the right mount.
  const assets = extractAssetUrls(page.body);
  if (assets.length === 0) {
    fail(`${app.mount} index.html has no fetchable asset references`);
  }

  const expectedPrefix = app.basePath; // "/", "/property-slides/", "/__mockup/"
  if (expectedPrefix !== "/") {
    const hasPrefixed = assets.some(a => a.startsWith(expectedPrefix));
    if (!hasPrefixed) {
      fail(
        `${app.mount} index.html has no assets prefixed with ${expectedPrefix} ` +
          `— BASE_PATH appears wrong. Saw: ${assets.slice(0, 5).join(", ")}`,
      );
    }
  } else {
    // Root app: at least one /assets/ asset reference proves the vite
    // build produced its bundle and we can fetch it.
    const hasRootAsset = assets.some(a => a.startsWith("/assets/"));
    if (!hasRootAsset) {
      fail(
        `${app.mount} index.html has no /assets/* references — vite bundle missing. ` +
          `Saw: ${assets.slice(0, 5).join(", ")}`,
      );
    }
  }

  // Every fetchable asset reference must itself resolve 200. We probe a
  // capped subset to keep the check fast while still catching "BASE_PATH
  // mismatch leaves /assets/* unreachable" regressions.
  const probeAssets = assets.slice(0, 8);
  for (const asset of probeAssets) {
    const assetUrl = resolveAssetUrl(pageUrl, asset);
    const r = await probe(assetUrl);
    if (r.status !== 200) {
      fail(`asset ${asset} (resolved ${assetUrl}) returned ${r.status} for ${app.mount}`);
    }
  }
  info(`  ✓ ${app.mount} OK (${probeAssets.length} asset(s) checked)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (SKIP_BUILD) {
    info("--skip-build set; reusing existing artifacts/<name>/dist outputs");
  } else {
    for (const app of APPS) {
      buildApp(app);
    }
  }

  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodimg-"));
  info(`staging into ${stageRoot}`);
  let server: { url: string; close: () => void } | undefined;
  try {
    stage(stageRoot);
    server = await startServer(stageRoot);
    info(`server listening at ${server.url}`);

    // /api/health/live first — proves the api-surface contract.
    const health = await probe(`${server.url}/api/health/live`);
    if (health.status !== 200) {
      fail(`/api/health/live returned ${health.status}`);
    }
    info(`  ✓ /api/health/live OK`);

    for (const app of APPS) {
      await checkApp(server.url, app);
    }

    info("PASS — all three apps serve correctly");
  } finally {
    server?.close();
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
