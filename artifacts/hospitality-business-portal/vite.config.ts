import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
      { find: "@assets", replacement: path.resolve(import.meta.dirname, "..", "..", "attached_assets") },
      { find: "@norfolk/shared", replacement: path.resolve(import.meta.dirname, "../../lib/shared/src") },
      { find: "@shared", replacement: path.resolve(import.meta.dirname, "../../lib/shared/src") },
      { find: "@engine", replacement: path.resolve(import.meta.dirname, "../../lib/engine/src") },
      { find: "@calc", replacement: path.resolve(import.meta.dirname, "../../lib/calc/src") },
      { find: "@analytics", replacement: path.resolve(import.meta.dirname, "../../lib/analytics/src") },
      { find: "@domain", replacement: path.resolve(import.meta.dirname, "../../lib/domain/src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: [
      "drizzle-orm/node-postgres",
      "drizzle-orm/postgres-js",
      "drizzle-orm/neon-serverless",
      "drizzle-orm/neon-http",
      "pg",
      "postgres",
      "postgres-bytea",
    ],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: false,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
