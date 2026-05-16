-- T2-2: Portfolio grouping — create portfolios table + add portfolio_id to properties

CREATE TABLE "portfolios" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "portfolios_user_id_idx" ON "portfolios" ("user_id");

ALTER TABLE "properties" ADD COLUMN "portfolio_id" integer;

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_portfolio_id_portfolios_id_fk"
  FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL;
