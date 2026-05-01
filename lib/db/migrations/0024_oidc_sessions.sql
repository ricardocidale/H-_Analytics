-- 0024_oidc_sessions.sql
--
-- Creates the table backing the Replit OIDC login flow (connect-pg-simple).
-- Until now, server/replit_integrations/auth/replitAuth.ts pointed
-- connect-pg-simple at the existing `sessions` table, which is keyed by
-- (id text, user_id integer, expires_at, created_at) for our custom cookie
-- auth. connect-pg-simple expects (sid, sess, expire), so every real OIDC
-- login fell over with a column-not-found error and only the `DEV_SKIP_AUTH`
-- bypass kept admins logged in. This table gives the OIDC store its own
-- correctly-shaped storage so production logins persist a session row.
CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar PRIMARY KEY NOT NULL,
        "sess" jsonb NOT NULL,
        "expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" USING btree ("expire");
