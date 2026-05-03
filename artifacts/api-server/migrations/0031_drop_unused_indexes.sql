-- 0030_drop_unused_indexes.sql
--
-- Task #973: Audit and remove unused database indexes.
--
-- Source of evidence: pg_stat_user_indexes, idx_scan = 0 over the current
-- stats window. Each index below was confirmed to be:
--   * not a PRIMARY KEY
--   * not a UNIQUE constraint
--   * not the only index on a foreign-key column (FK-supporting indexes
--     are kept even when their query stats are zero, since they accelerate
--     ON DELETE CASCADE / SET NULL and join planning regardless of
--     application read patterns).
--
-- Indexes dropped here fall into one of these categories (notes inline):
--   (a) timestamp filter rarely used in practice
--   (b) low-cardinality status / kind / category filter
--   (c) composite redundant with an FK-leading single-column index
--   (d) JSON / GIN / lookup index on a feature path with no live readers
--   (e) audit-log secondary filter that hasn't been queried
--
-- All DROPs use IF EXISTS so the migration is safe to re-run.
--
-- Indexes intentionally kept despite zero scans (do NOT drop):
--   * vector_chunks_embedding_hnsw   - HNSW vector index used by
--     vector-store-service / knowledge-base for similarity search.
--     Expensive to rebuild; kept for production AI features.
--   * users_phone_number_idx         - auth/identity lookup path.
--   * research_runs_cache_key_idx    - partial index used by the research
--     cache key short-circuit; not yet hot in dev.
--   * properties_brand_id_idx        - brand_id is intended-FK semantics
--     (reference_brands), kept to avoid a future re-add.
--   * companies_logo_id_idx, companies_theme_id_idx - declared FK
--     columns; FK-supporting.
--   * All *_user_id_idx / *_property_id_idx / *_scenario_id_idx /
--     *_conversation_id_idx / *_specialist_id_idx single-column indexes
--     on FK columns - FK-supporting.

--> statement-breakpoint

-- (a) timestamp filters with no observed scans
DROP INDEX IF EXISTS "activity_logs_created_at_idx";
DROP INDEX IF EXISTS "properties_created_at_idx";
DROP INDEX IF EXISTS "verification_runs_created_at_idx";
DROP INDEX IF EXISTS "calc_audit_computed_at_idx";
DROP INDEX IF EXISTS "break_glass_expires_idx";
DROP INDEX IF EXISTS "sessions_expires_at_idx";
DROP INDEX IF EXISTS "market_research_updated_at_idx";
DROP INDEX IF EXISTS "source_call_logs_ts_idx";
-- scheduled_research_workflows_next_run_idx kept — Task #972 superseded
-- by the partial (next_run_at, priority) WHERE is_enabled; the unfiltered
-- singleton remains as the fallback for non-enabled scans.
DROP INDEX IF EXISTS "assumption_change_log_created_idx";
DROP INDEX IF EXISTS "analyst_refresh_audit_started_idx";

-- (b) low-cardinality / category / kind / status filters
DROP INDEX IF EXISTS "admin_resources_kind_idx";
DROP INDEX IF EXISTS "media_assets_kind_idx";
DROP INDEX IF EXISTS "market_research_type_idx";
-- rebecca_kb_active_idx, rebecca_kb_category_idx kept — Task #972 added
-- the rebecca_kb_active_priority_idx partial composite that depends on
-- the same active-browse query path; keep singletons for filter variants.
-- research_runs_status_idx kept — Task #972 added the (entity_type, status,
-- completed_at) composite for latest-successful-run lookups; the singleton
-- supports status-only filters that don't lead with entity_type.
-- scheduled_research_workflows_enabled_idx kept — Task #972 added the
-- (next_run_at, priority) WHERE is_enabled partial; singleton remains.
DROP INDEX IF EXISTS "rebecca_feedback_status_idx";
DROP INDEX IF EXISTS "engine_suggested_lines_status_idx";
DROP INDEX IF EXISTS "engine_suggested_lines_statement_idx";
DROP INDEX IF EXISTS "hospitality_benchmarks_active_idx";
DROP INDEX IF EXISTS "hospitality_benchmarks_category_idx";
DROP INDEX IF EXISTS "hospitality_benchmarks_segment_idx";
DROP INDEX IF EXISTS "integration_key_rotations_service_idx";
DROP INDEX IF EXISTS "assumption_change_log_field_idx";
DROP INDEX IF EXISTS "assumption_change_log_source_idx";

-- (c) composite indexes redundant with an FK-leading sibling
-- spo_scenario_id_idx already covers scenario_id lookups
DROP INDEX IF EXISTS "spo_scenario_property_id_idx";
-- specialist_rec_events_specialist_idx covers specialist_id lookups
DROP INDEX IF EXISTS "specialist_rec_events_specialist_field_idx";
-- specialist_quality_specialist_idx covers specialist_id lookups
DROP INDEX IF EXISTS "specialist_quality_specialist_time_idx";
-- resource_health_checks_resource_idx covers resource_id lookups
DROP INDEX IF EXISTS "resource_health_checks_resource_time_idx";
-- activity_logs_user_id_created_at composite is unused; keep no replacement
DROP INDEX IF EXISTS "activity_logs_user_id_created_at_idx";

-- (d) JSON / GIN / namespaced lookups with no live readers
DROP INDEX IF EXISTS "spo_overrides_gin_idx";
DROP INDEX IF EXISTS "spo_property_name_idx";
DROP INDEX IF EXISTS "scenario_results_output_hash_idx";
DROP INDEX IF EXISTS "scenario_shares_target_idx";
DROP INDEX IF EXISTS "media_assets_sha256_idx";
DROP INDEX IF EXISTS "vector_chunks_namespace_idx";
DROP INDEX IF EXISTS "idx_seed_defaults_lookup";
DROP INDEX IF EXISTS "idx_mc_key_country";
DROP INDEX IF EXISTS "idx_mco_key_country";
DROP INDEX IF EXISTS "idx_model_defaults_grouping";
DROP INDEX IF EXISTS "idx_model_defaults_pending";
DROP INDEX IF EXISTS "idx_user_page_visits_page";

-- (e) audit-log secondary filters with no observed scans
DROP INDEX IF EXISTS "activity_logs_entity_type_entity_id_idx";
DROP INDEX IF EXISTS "assumption_change_log_entity_idx";
DROP INDEX IF EXISTS "assumption_guidance_entity_idx";
DROP INDEX IF EXISTS "assumption_ack_entity_idx";
DROP INDEX IF EXISTS "coverage_snapshots_entity_idx";
-- research_runs_entity_idx kept — Task #972 added the
-- (entity_type, status, completed_at) composite that uses entity_type
-- as its leading column; keep the singleton for entity-only scans
-- pending verification that the composite covers all query shapes.
DROP INDEX IF EXISTS "analyst_refresh_audit_table_idx";
