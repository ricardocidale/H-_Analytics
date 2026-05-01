import { defineConfig } from "drizzle-kit";
import { requireDbUrl } from "./shared/db-url";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: requireDbUrl(),
  },
});
