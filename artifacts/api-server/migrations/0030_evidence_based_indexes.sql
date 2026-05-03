-- 0030_evidence_based_indexes.sql
--
-- Task #972 — targeted indexes for known hot WHERE / ORDER BY query
-- patterns observed in the storage layer. Task #971 covered foreign-key
-- columns; this migration adds composite and partial indexes that
-- support the actual filter+sort+limit shapes the app issues.
--
-- Note on evidence sourcing:
--   pg_stat_statements is not present in `shared_preload_libraries` on
--   the project's Neon database (only `timescaledb` is preloaded), so
--   runtime SQL stats cannot be collected from the live cluster.
--   Evidence for every index below comes from grepping the storage
--   layer for the exact `WHERE … ORDER BY … LIMIT` shape that issues
--   the query. The originating call site is cited next to each index.
--
-- Discipline: every CREATE INDEX has a documented justification, no
-- drive-by additions. CONCURRENTLY is intentionally not used because
-- Drizzle migrate() runs each statement inside a transaction.

--> statement-breakpoint
-- (1) rebecca_messages: chat-history fetch.
--     storage/intelligence-rebecca.ts → getRebeccaMessages()
--       WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT N
--     The existing rebecca_messages_conv_idx (conversation_id only)
--     forces a sort of every conversation's full history. The composite
--     turns the limit into an index range scan in reverse.
CREATE INDEX IF NOT EXISTS rebecca_messages_conv_created_idx
  ON rebecca_messages (conversation_id, created_at);

--> statement-breakpoint
-- (2) rebecca_conversations: "my recent conversations" list.
--     storage/intelligence-rebecca.ts → getRebeccaConversations(userId)
--       WHERE user_id = $1 ORDER BY last_message_at DESC
--     Existing rebecca_conversations_user_idx (user_id) requires a
--     filesort of every conversation a user has ever had.
CREATE INDEX IF NOT EXISTS rebecca_conversations_user_last_msg_idx
  ON rebecca_conversations (user_id, last_message_at DESC);

--> statement-breakpoint
-- (3) rebecca_conversations: getOrCreateConversation lookup.
--     storage/intelligence-rebecca.ts → getOrCreateConversation()
--       WHERE user_id = $1 AND context_type = $2 AND context_key …
--       ORDER BY last_message_at DESC LIMIT 1
--     Runs on every Rebecca panel mount; the (user_id) prefix in the
--     index above is not selective enough across context types.
CREATE INDEX IF NOT EXISTS rebecca_conversations_user_ctx_idx
  ON rebecca_conversations (user_id, context_type, context_key);

--> statement-breakpoint
-- (4) rebecca_feedback: admin feedback queue.
--     storage/intelligence-rebecca.ts → getRebeccaFeedback(status)
--       WHERE status = $1 ORDER BY created_at DESC
--     Existing rebecca_feedback_status_idx (status) does not cover
--     the sort; new entries are bursty so the composite materially
--     reduces work for the "new" / "triaging" filters.
CREATE INDEX IF NOT EXISTS rebecca_feedback_status_created_idx
  ON rebecca_feedback (status, created_at DESC);

--> statement-breakpoint
-- (5) rebecca_knowledge_base: active KB browse.
--     storage/intelligence-rebecca.ts → getActiveRebeccaKBEntries()
--       WHERE is_active = true ORDER BY priority DESC, title
--     Hit on every Rebecca turn that injects KB context. Partial on
--     is_active because inactive rows accrete forever (audit trail)
--     and are never read by the hot path.
CREATE INDEX IF NOT EXISTS rebecca_kb_active_priority_idx
  ON rebecca_knowledge_base (priority DESC, title)
  WHERE is_active = true;

--> statement-breakpoint
-- (6) scheduled_research_workflows: scheduler picker.
--     storage/intelligence/constants/scheduled-workflows.ts
--       → getStaleScheduledWorkflows()
--       WHERE is_enabled = true AND next_run_at <= NOW()
--       ORDER BY priority
--     Runs on every scheduler tick. Existing single-column
--     scheduled_research_workflows_next_run_idx and _enabled_idx are
--     not combinable for this exact predicate. Partial keeps the
--     index ~the size of the enabled subset.
CREATE INDEX IF NOT EXISTS scheduled_research_workflows_due_idx
  ON scheduled_research_workflows (next_run_at, priority)
  WHERE is_enabled = true;

--> statement-breakpoint
-- (7) research_runs: latest-successful-run for a Constants locality.
--     storage/intelligence/research-runs.ts
--       → getLatestSuccessfulRunForConstant()
--       WHERE entity_type = 'model-constant' AND status = 'completed'
--         AND metadata->'constant'->>'key' = $1 …
--       ORDER BY completed_at DESC LIMIT 1
--     Also serves getResearchRuns(entityType, entityId) ordered by
--     started_at when status filtering is added. The existing
--     research_runs_status_idx alone is not selective enough — the
--     status column has only a handful of distinct values.
CREATE INDEX IF NOT EXISTS research_runs_entity_status_completed_idx
  ON research_runs (entity_type, status, completed_at DESC);

--> statement-breakpoint
-- (8) notification_logs: admin log filter+sort.
--     storage/notifications.ts → getNotificationLogs(limit, eventType)
--       WHERE event_type = $1 ORDER BY created_at DESC LIMIT N
--     Existing _event_type_idx and _created_at_idx exist as separate
--     single-column indexes; neither covers the WHERE+ORDER BY+LIMIT
--     shape on its own. The composite makes the filtered admin view
--     a single index range scan.
CREATE INDEX IF NOT EXISTS notification_logs_event_created_idx
  ON notification_logs (event_type, created_at DESC);
