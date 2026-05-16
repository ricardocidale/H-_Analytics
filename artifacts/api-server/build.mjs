import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(artifactDir, "../..");

function pathAliasPlugin(aliases) {
  return {
    name: "path-alias",
    setup(build) {
      for (const [prefix, target] of Object.entries(aliases)) {
        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const filter = new RegExp(`^${escapedPrefix}(/.*)?$`);
        build.onResolve({ filter }, (args) => {
          const sub = args.path.slice(prefix.length);
          const resolved = path.resolve(target + sub);
          return build.resolve(resolved, {
            resolveDir: workspaceRoot,
            kind: args.kind,
          });
        });
      }
    },
  };
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    // `instrument.ts` is a separate entry so it can be loaded via
    // `node --import ./dist/instrument.mjs ./dist/index.mjs` BEFORE express
    // is imported. Without this, Sentry's express auto-instrumentation is
    // silently disabled and we lose HTTP spans / per-request error context.
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/instrument.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      // "@swc/*" — bundled (no native modules in @swc/helpers)
      "@aws-sdk/*",
      "@azure/*",
      // "@opentelemetry/*" — bundled (Sentry peer deps, no native modules)
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
      // Heavy doc/media libraries — externalized to keep the production
      // bundle small. Each must remain in `dependencies` (not devDeps) so
      // pnpm installs them in the deployed container at runtime.
      "@react-pdf/renderer",
      "pptxgenjs",
      "xlsx",
      "docx",
      "jspdf",
      "archiver",
      // AI SDK clients — only loaded on AI request paths. Externalizing
      // keeps the production bundle small. Each must remain in
      // `dependencies` so pnpm installs them at runtime.
      "@ai-sdk/anthropic",
      "@ai-sdk/google",
      "@anthropic-ai/sdk",
      "@google/genai",
      "@mistralai/mistralai",
      "@perplexity-ai/perplexity_ai",
      "openai",
      "ai",
      // Heavy reference-data library (~8 MB of bundled JSON for every
      // country/state/city). Only used by `src/routes/geo.ts`. Must remain
      // in `dependencies` so pnpm installs it at runtime.
      "country-state-city",
      // Observability / auth runtime SDKs — keep external so the bundle
      // stays under the 10 MB target. All remain in `dependencies` so
      // pnpm installs them in the deployed container at runtime.
      "@sentry/*",
      "google-auth-library",
      // Express MUST stay external. Sentry's express auto-instrumentation
      // (OpenTelemetry + import-in-the-middle) can only wrap a real package
      // import at runtime — when express is bundled and inlined, IITM never
      // sees an `import "express"` statement and we get
      // `[Sentry] express is not instrumented` on every boot. See Task #949
      // and src/instrument.ts. Express is in `dependencies` so pnpm installs
      // it in the deployed container.
      "express",
      // pg MUST stay external for the same reason as express: Sentry's
      // postgresIntegration() (OpenTelemetry + import-in-the-middle) can only
      // wrap a real package import at runtime. If pg is bundled, IITM never
      // sees an `import "pg"` and we lose per-query spans, slow-query traces,
      // and DB error context in Sentry. See Task #952. pg is in `dependencies`.
      "pg",
    ],
    sourcemap: process.env.NODE_ENV === "production" ? false : "linked",
    plugins: [
      pathAliasPlugin({
        "@norfolk/shared": path.resolve(artifactDir, "../../lib/shared/src"),
        "@shared": path.resolve(artifactDir, "../../lib/shared/src"),
        "@engine": path.resolve(artifactDir, "../../lib/engine/src"),
        "@calc": path.resolve(artifactDir, "../../lib/calc/src"),
        "@analytics": path.resolve(artifactDir, "../../lib/analytics/src"),
        "@domain": path.resolve(artifactDir, "../../lib/domain/src"),
        "@server": path.resolve(artifactDir, "src"),
      }),
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
