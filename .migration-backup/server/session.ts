import session from "express-session";
import connectPg from "connect-pg-simple";
import { getDbUrl } from "@shared/db-url";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

/**
 * Creates Express session middleware backed by a PostgreSQL session store.
 * Used by both local auth and Replit OIDC auth providers.
 */
export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: getDbUrl(),
    createTableIfMissing: false,
    ttl: SESSION_TTL_MS,
    // user_sessions, NOT sessions — sessions is our custom cookie-based table
    // with a different shape (id/user_id/expires_at vs sid/sess/expire).
    tableName: "user_sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: SESSION_TTL_MS,
    },
  });
}
