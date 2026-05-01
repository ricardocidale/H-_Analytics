import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@calc": path.resolve(import.meta.dirname, "calc"),
      "@domain": path.resolve(import.meta.dirname, "domain"),
      "@analytics": path.resolve(import.meta.dirname, "analytics"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@engine": path.resolve(import.meta.dirname, "engine"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-charts": ["recharts", "d3-selection", "d3-array", "d3-scale", "d3-axis", "d3-color", "d3-interpolate", "d3-shape"],
          "vendor-motion": ["framer-motion"],
          "vendor-exports": ["jspdf", "xlsx", "pptxgenjs"],
          "vendor-tanstack": ["@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      allow: [
        path.resolve(import.meta.dirname, "client"),
        path.resolve(import.meta.dirname, "engine"),
        path.resolve(import.meta.dirname, "shared"),
        path.resolve(import.meta.dirname, "calc"),
        path.resolve(import.meta.dirname, "domain"),
        path.resolve(import.meta.dirname, "analytics"),
        path.resolve(import.meta.dirname, "attached_assets"),
        path.resolve(import.meta.dirname, "node_modules"),
      ],
      deny: ["**/.*"],
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/server/**",
        "**/calc/**",
        "**/tests/**",
        "**/script/**",
        "**/.claude/**",
        "**/.local/**",
        "**/.canvas/**",
        "**/attached_assets/**",
        "**/tmp/**",
      ],
    },
    hmr: {
      overlay: true,
    },
  },
});
