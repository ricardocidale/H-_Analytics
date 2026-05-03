ALTER TABLE "users" ADD COLUMN "google_access_token" text;
ALTER TABLE "users" ADD COLUMN "google_refresh_token" text;
ALTER TABLE "users" ADD COLUMN "google_token_expiry" timestamp;
ALTER TABLE "users" ADD COLUMN "google_drive_connected" boolean DEFAULT false NOT NULL;
