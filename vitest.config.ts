import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    pool: "threads",
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@calc": path.resolve(__dirname, "calc"),
      "@domain": path.resolve(__dirname, "domain"),
      "@engine": path.resolve(__dirname, "engine"),
      "@statements": path.resolve(__dirname, "statements"),
      "@analytics": path.resolve(__dirname, "analytics"),
      "@/lib": path.resolve(__dirname, "client/src/lib"),
      "@/components": path.resolve(__dirname, "client/src/components"),
      "@/hooks": path.resolve(__dirname, "client/src/hooks"),
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
