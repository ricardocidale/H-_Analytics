-- 0031_batch2_drops.sql
--
-- Phase C batch 2: consolidate 3 pure-DROP runtime migrations into Drizzle.
--
-- Migrations consolidated:
--   drop_engine_suggested_lines_001 → DROP TABLE engine_suggested_lines
--   drop_marcela_columns_001        → DROP COLUMN ×33 Marcela cols from global_assumptions
--   drop_plaid_001                  → DROP TABLE plaid_categorization_cache,
--                                     plaid_transactions, plaid_connections
--
-- All DROP statements use IF EXISTS so re-running on an already-migrated DB
-- (or a fresh DB that never had these tables/columns) is safe.
--
-- drop_company_fk_001 is NOT consolidated here — it is MIXED (UPDATE backfill
-- + DROP COLUMN) and requires splitting before consolidation (deferred to batch 7).

-- drop_engine_suggested_lines_001
DROP TABLE IF EXISTS engine_suggested_lines CASCADE;
--> statement-breakpoint

-- drop_plaid_001
DROP TABLE IF EXISTS plaid_categorization_cache CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS plaid_transactions CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS plaid_connections CASCADE;
--> statement-breakpoint

-- drop_marcela_columns_001 (33 Marcela voice-agent columns from global_assumptions)
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "ai_agent_name";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_agent_id";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_voice_id";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_tts_model";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_stt_model";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_output_format";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_stability";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_similarity_boost";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_speaker_boost";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_chunk_schedule";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_llm_model";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_max_tokens";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_max_tokens_voice";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_enabled";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_twilio_enabled";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_sms_enabled";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_phone_greeting";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_language";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_turn_timeout";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_avatar_url";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_widget_variant";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_speed";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_streaming_latency";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_text_normalisation";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_asr_provider";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_input_audio_format";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_background_voice_detection";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_turn_eagerness";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_spelling_patience";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_speculative_turn";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_silence_end_call_timeout";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_max_duration";
--> statement-breakpoint
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "marcela_cascade_timeout";
