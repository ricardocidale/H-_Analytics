import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@calc": path.resolve(__dirname, "calc"),
      "@domain": path.resolve(__dirname, "domain"),
      "@engine": path.resolve(__dirname, "engine"),
      "@statements": path.resolve(__dirname, "statements"),
      "@analytics": path.resolve(__dirname, "analytics"),
      "@/lib": path.resolve(__dirname, "client/src/lib"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
