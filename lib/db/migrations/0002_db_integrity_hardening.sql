-- FK constraints: companies.logo_id -> logos.id
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- FK constraints: companies.theme_id -> design_themes.id
ALTER TABLE "companies" ADD CONSTRAINT "companies_theme_id_design_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "design_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- FK constraints: users.user_group_id -> user_groups.id
ALTER TABLE "users" ADD CONSTRAINT "users_user_group_id_user_groups_id_fk" FOREIGN KEY ("user_group_id") REFERENCES "user_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- FK constraints: users.selected_theme_id -> design_themes.id
ALTER TABLE "users" ADD CONSTRAINT "users_selected_theme_id_design_themes_id_fk" FOREIGN KEY ("selected_theme_id") REFERENCES "design_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- FK constraints: user_groups.asset_description_id -> asset_descriptions.id
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_asset_description_id_asset_descriptions_id_fk" FOREIGN KEY ("asset_description_id") REFERENCES "asset_descriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Add user_id column to conversations table with FK to users.id
ALTER TABLE "conversations" ADD COLUMN "user_id" integer;--> statement-breakpoint

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conversations_user_id_idx" ON "conversations" USING btree ("user_id");
