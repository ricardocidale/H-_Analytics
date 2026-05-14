/**
 * startup/migrations.ts — Schema migration helpers
 *
 * Contains the Drizzle migration runner and runtime migration patches that
 * execute after the HTTP port opens. These are called from boot.ts as part of
 * Phase 2a startup.
 *
 * All paths use `../` because this file lives in src/startup/ not src/.
 */

/**
 * Runs all Drizzle schema migrations and idempotent runtime data-fix patches.
 * Fatal — throws on failure so the caller can process.exit(1).
 */
export async function runSchemaMigrations() {
  const { bootstrapDrizzleMigrationState, runDataFixes, isMigrationApplied, markMigrationApplied } = await import("../migrations/consolidated-schema");
  await bootstrapDrizzleMigrationState();

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db: drizzleDb } = await import("../db");

  // Resolve the drizzle migrations folder robustly across platforms:
  //   - Railway/Docker: Dockerfile copies migrations to /app/migrations,
  //     and cwd is /app, so "./migrations" works.
  //   - Replit deploy: cwd is repo root; migrations live at
  //     artifacts/api-server/migrations.
  //   - Local dev (`pnpm --filter @workspace/api-server run dev`): cwd is
  //     the artifact dir, so "./migrations" works.
  // We probe a list of candidates and use the first one whose
  // meta/_journal.json exists (drizzle's required entrypoint).
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const bundleDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationCandidates = [
    path.resolve(bundleDir, "../../migrations"),                            // dist/startup/../../migrations → artifacts/api-server/migrations
    path.resolve(process.cwd(), "migrations"),                              // /app/migrations (Docker/Railway)
    path.resolve(process.cwd(), "artifacts/api-server/migrations"),         // repo-root cwd (Replit deploy)
  ];
  const migrationsFolder = migrationCandidates.find(
    (p) => existsSync(path.join(p, "meta", "_journal.json")),
  );
  if (!migrationsFolder) {
    throw new Error(
      `drizzle migrations folder not found; checked: ${migrationCandidates.join(", ")}`,
    );
  }
  await migrate(drizzleDb, { migrationsFolder });

  const { withRetry } = await import("../db");
  await withRetry(() => runDataFixes(), {
    retries: 3,
    baseDelayMs: 2000,
    label: "data-fixes",
  });

  // db_hygiene_001, fix_shared_ownership, role_partner_to_user_001,
  // role_checker_investor_to_user_001, property_notnull_001 consolidated into
  // 0037_batch8_datafix_and_unique.sql (Phase C batch 8)

  // can_manage_scenarios_001, fk_hardening_001, scenario_overrides_001
  // consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // appearance_defaults_001 consolidated into 0034_batch6_ga_columns.sql (Phase C batch 6)

  // scenario_system_unique_001 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // seed_external_integrations_001 → moved to runSeeds() seedTasks (idempotent: skips if rows exist)

  // photo_image_data_001, scenario_access_001, source_call_logs_001, property_urls_001
  // consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // drop_engine_suggested_lines_001 consolidated into 0031_batch2_drops.sql (Phase C batch 2)

  // enhanced_photo_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // rebecca_guardrails_001 → moved to runSeeds() seedTasks (ON CONFLICT DO NOTHING)
  // rebecca_kb_001 → moved to runSeeds() seedTasks (skips if rows exist)

  // rebecca_language_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // calc_audit_001, admin_resources_001, admin_resources_002, admin_resources_003,
  // property_dd_001 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // admin_resources_004 → moved to runSeeds() seedTasks (ON CONFLICT DO NOTHING)

  // specialist_observed_missing_001, specialist_recommendation_events_001,
  // specialist_recommendation_counters_001 consolidated into
  // 0033_batch4_specialists.sql (Phase C batch 4)

  // specialist_multi_model_001 — columns now owned by Drizzle migration
  // 0022_specialist_llm_overrides.sql. Runtime patch removed; existing DBs
  // have the migration key recorded in _applied_migrations.

  // pipeline_n1_global_models_001, vector_chunks_gin_001 consolidated into
  // 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // admin_resources_005 → moved to runSeeds() seedTasks (ON CONFLICT DO NOTHING)

  // properties_financials_computed_at_001 consolidated into
  // 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // financials_computed_at_backfill_001, app_logo_001 consolidated into
  // 0037_batch8_datafix_and_unique.sql (Phase C batch 8)

  // scenario_service_templates_001 consolidated: its DDL (ADD COLUMN service_templates
  // on scenarios) was already shipped via 0010_scenario_service_templates.sql in the
  // Drizzle migration path. Runtime gate removed as part of Phase C batch 1.

  // drop_company_fk_001 consolidated into 0038_batch9_drop_company_fk.sql (Phase C batch 9)

  // rebecca_opt_out_001, rebecca_fixtures_001 consolidated into
  // 0032_batch3_rebecca.sql (Phase C batch 3)

  // app_name_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // market_data_tables_001 consolidated into 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // index_coverage_001 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // scheduler_runs_001, scheduler_runs_002, storage_drift_sweep_runs_001
  // consolidated into 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // rebecca_fixture_replay_001 consolidated into 0032_batch3_rebecca.sql (Phase C batch 3)

  // assumption_guidance_dedupe_001, benchmark_snapshots_unique_001,
  // audit_unique_constraints_001 consolidated into
  // 0037_batch8_datafix_and_unique.sql (Phase C batch 8)

  // funding_cascade_001 consolidated into 0034_batch6_ga_columns.sql (Phase C batch 6)

  // cache_entries_001, reference_range_001 consolidated into
  // 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // icp_model_tier_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // fk_indexes_002 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // property_slide_decks_001, property_slide_decks_002, reference_brands_001,
  // property_photos_hero_unique_001, reference_brands_run_fk_001,
  // property_slide_deck_variants_001 → consolidated into
  // 0029_batch10_slide_decks_and_constraints.sql (Phase C batch 10)

  // slide_recipe_001 → moved to runSeeds() seedTasks (skips if rows exist)

  if (!(await isMigrationApplied("sync_property_assumptions_001"))) {
    const { runSyncPropertyAssumptions001 } = await import("../migrations/sync-property-assumptions-001");
    await runSyncPropertyAssumptions001();
    await markMigrationApplied("sync_property_assumptions_001");
  }

  // Task #919 — backfill `users.google_drive_connected` on production. The
  // legacy bootstrap pre-marked Drizzle migration 0005 as applied without
  // running it, and this column is the only DDL artifact from 0005–0027
  // that the Phase D audit found genuinely missing on prod. Idempotent
  // ADD COLUMN IF NOT EXISTS — safe no-op on any DB that already has it.
  if (!(await isMigrationApplied("users_google_drive_connected_001"))) {
    const { runUsersGoogleDriveConnected001 } = await import("../migrations/users-google-drive-connected-001");
    await runUsersGoogleDriveConnected001();
    await markMigrationApplied("users_google_drive_connected_001");
  }

  // Task #971 — missing FK indexes. Uses CREATE INDEX CONCURRENTLY (which
  // cannot run inside a transaction), so it lives here as a runtime patch
  // rather than as a numbered Drizzle SQL migration. Idempotent.
  if (!(await isMigrationApplied("fk_indexes_003"))) {
    const { runFkIndexes003 } = await import("../migrations/fk-indexes-003");
    const { allApplied } = await runFkIndexes003();
    // Only mark applied when every target index was created. If a table was
    // skipped (e.g. rebecca_context_contract_turns provisioned later by
    // rebecca-context-contract-001), retry on the next boot rather than
    // silently masking schema drift.
    if (allApplied) {
      await markMigrationApplied("fk_indexes_003");
    }
  }

  // Task #1409 — ICP Bracket Catalog seed + admin_resources registration.
  // Belt-and-suspenders companion to 0056_icp_bracket_catalog.sql.
  // Idempotent: creates icp_brackets (IF NOT EXISTS), seeds 4 starter
  // brackets (ON CONFLICT DO NOTHING), registers admin_resources entry
  // (ON CONFLICT DO NOTHING).
  if (!(await isMigrationApplied("icp_brackets_001"))) {
    const { runIcpBrackets001 } = await import("../migrations/icp-brackets-001");
    await runIcpBrackets001();
    await markMigrationApplied("icp_brackets_001");
  }

  // Task #1486 — Normalise bracket_mix persisted shape to BracketMixData.
  // Converts any legacy flat-array rows ([ { bracketSlug, weight } ]) to the
  // canonical BracketMixData shape ({ entries, assignedAt, evidence }).
  // Idempotent: rows already in BracketMixData shape or NULL are untouched.
  if (!(await isMigrationApplied("icp_brackets_002"))) {
    const { runIcpBrackets002 } = await import("../migrations/icp-brackets-002");
    await runIcpBrackets002();
    await markMigrationApplied("icp_brackets_002");
  }

  // Plan 2026-05-13-001 U5 — Layer-2 default-overlay columns on icp_brackets.
  // Belt-and-suspenders companion to 0063_icp_brackets_default_overlay.sql.
  // Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS for both columns.
  if (!(await isMigrationApplied("icp_brackets_003"))) {
    const { runIcpBrackets003 } = await import("../migrations/icp-brackets-003");
    await runIcpBrackets003();
    await markMigrationApplied("icp_brackets_003");
  }

  // Plan 2026-05-13-003 Phase 5 — refi LTV cap column on properties.
  // Belt-and-suspenders companion to 0064_properties_refi_ltv_cap.sql.
  // Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
  if (!(await isMigrationApplied("properties_refi_ltv_cap_001"))) {
    const { runPropertiesRefiLtvCap001 } = await import("../migrations/properties-refi-ltv-cap-001");
    await runPropertiesRefiLtvCap001();
    await markMigrationApplied("properties_refi_ltv_cap_001");
  }

  // Plan 2026-05-13-005 P2 — recalibrate refi_max_ltv_to_original on all property rows.
  // Fixes rows seeded with 1.00 (uncapped) to the correct 0.70 cap. Also fills any NULLs.
  // One-time migration; no every-boot assertion (slider allows values up to 150%).
  if (!(await isMigrationApplied("properties_refi_ltv_recalibration_001"))) {
    const { runPropertiesRefiLtvRecalibration001 } = await import("../migrations/properties-refi-ltv-recalibration-001");
    await runPropertiesRefiLtvRecalibration001();
    await markMigrationApplied("properties_refi_ltv_recalibration_001");
  }

  // Plan 2026-05-13-006 U1 — extend business_brands for multi-flag brand family model.
  // Belt-and-suspenders companion to 0065_extend_business_brands_multi_flag.sql.
  // Adds slug, business_model, segment, sort_order, is_active, updated_at columns,
  // flips FK on properties.brand_id to ON DELETE RESTRICT, backfills NULLs, sets NOT NULL.
  if (!(await isMigrationApplied("business_brands_multi_flag_001"))) {
    const { runBusinessBrandsMultiFlag001 } = await import("../migrations/business-brands-multi-flag-001");
    await runBusinessBrandsMultiFlag001();
    await markMigrationApplied("business_brands_multi_flag_001");
  }

  // Plan 2026-05-13-006 U2 — create management_company_fees + brand_fees tables.
  // Belt-and-suspenders companion to 0066_create_mgmt_co_and_brand_fees.sql.
  // Creates both tables, makes business_brands.slug NOT NULL + UNIQUE (FK target),
  // seeds Tier-A mgmt fees, seeds H+ Hotel + STR Ultra-Luxury brand fees,
  // and assigns Medellin Duplex to the STR flag.
  if (!(await isMigrationApplied("mgmt_co_fees_tables_001"))) {
    const { runMgmtCoFeesTables001 } = await import("../migrations/mgmt-co-fees-tables-001");
    await runMgmtCoFeesTables001();
    await markMigrationApplied("mgmt_co_fees_tables_001");
  }
}

// ── Boot orchestration: schema migrations (fatal) ─────────────────────
export async function runSchemaMigrationsWithRetry(): Promise<void> {
  const { withRetry } = await import("../db");
  await withRetry(() => runSchemaMigrations(), {
    retries: 3,
    baseDelayMs: 2000,
    label: "schema-migrations",
  });
}
