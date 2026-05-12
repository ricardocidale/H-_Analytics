import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { requireDbUrl } from "./db-url";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = new Pool({ connectionString: requireDbUrl() });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./property-descriptor-catalog-seed";
export * from "./property-descriptor-accessor";
