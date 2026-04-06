ALTER TABLE properties ADD COLUMN IF NOT EXISTS star_rating INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS star_rating_source TEXT DEFAULT 'manual';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS star_rating_suggested INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS hospitality_type TEXT NOT NULL DEFAULT 'hotel';

CREATE TABLE IF NOT EXISTS assumption_guidance (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  assumption_key TEXT NOT NULL,
  value_low REAL, value_mid REAL, value_high REAL,
  confidence TEXT, source_name TEXT, source_date TEXT,
  reasoning TEXT, comparable_set JSONB,
  relaxation_level INTEGER DEFAULT 0,
  research_run_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(scenario_id, entity_type, entity_id, assumption_key)
);

CREATE TABLE IF NOT EXISTS research_runs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE SET NULL,
  tier INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP, duration_ms INTEGER,
  model_primary TEXT, model_secondary TEXT, model_synthesis TEXT,
  tokens_used INTEGER, estimated_cost REAL,
  error TEXT, metadata JSONB
);

CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  snapshot_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  value REAL, source TEXT, source_url TEXT,
  fetched_at TIMESTAMP DEFAULT NOW() NOT NULL,
  staleness TEXT DEFAULT 'fresh',
  cadence TEXT DEFAULT 'monthly'
);

CREATE TABLE IF NOT EXISTS relaxation_traces (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  research_run_id INTEGER NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  criteria_active JSONB, comps_found INTEGER DEFAULT 0,
  evidence_score REAL, retained JSONB, relaxed JSONB
);

CREATE TABLE IF NOT EXISTS guidance_decisions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  assumption_guidance_id INTEGER NOT NULL REFERENCES assumption_guidance(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_value REAL, new_value REAL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS rebecca_conversations (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  context_type TEXT NOT NULL DEFAULT 'general',
  context_key TEXT, model TEXT,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_message_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS rebecca_messages (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  conversation_id INTEGER NOT NULL REFERENCES rebecca_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS rebecca_emails (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  conversation_id INTEGER NOT NULL REFERENCES rebecca_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL, html_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rebecca_feedback (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  conversation_id INTEGER NOT NULL REFERENCES rebecca_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, notes TEXT,
  conversation_context JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS coverage_snapshots (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
  total_fields INTEGER NOT NULL,
  fresh_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  coverage_pct REAL NOT NULL DEFAULT 0,
  snapshot_date DATE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS source_registry (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, source_type TEXT NOT NULL,
  trust_score TEXT DEFAULT 'unverified',
  category TEXT NOT NULL, cadence TEXT,
  last_health_check TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS integration_key_rotations (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_key TEXT NOT NULL,
  rotated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rotated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  previous_key_hash TEXT, notes TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_policies (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  policy_key TEXT NOT NULL UNIQUE,
  tier INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  staleness_threshold_hours INTEGER DEFAULT 168,
  max_concurrent_runs INTEGER DEFAULT 3,
  daily_token_budget INTEGER DEFAULT 100000,
  monthly_token_budget INTEGER DEFAULT 2000000,
  relaxation_max_level INTEGER DEFAULT 5,
  min_evidence_score REAL DEFAULT 0.3,
  min_comp_count INTEGER DEFAULT 3,
  auto_refresh_interval_hours INTEGER
);

CREATE INDEX IF NOT EXISTS assumption_guidance_entity_idx ON assumption_guidance(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS assumption_guidance_scenario_idx ON assumption_guidance(scenario_id);
CREATE INDEX IF NOT EXISTS research_runs_entity_idx ON research_runs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS research_runs_status_idx ON research_runs(status);
CREATE INDEX IF NOT EXISTS relaxation_traces_run_idx ON relaxation_traces(research_run_id);
CREATE INDEX IF NOT EXISTS guidance_decisions_user_idx ON guidance_decisions(user_id);
CREATE INDEX IF NOT EXISTS guidance_decisions_guidance_idx ON guidance_decisions(assumption_guidance_id);
CREATE INDEX IF NOT EXISTS rebecca_conversations_user_idx ON rebecca_conversations(user_id);
CREATE INDEX IF NOT EXISTS rebecca_messages_conv_idx ON rebecca_messages(conversation_id);
CREATE INDEX IF NOT EXISTS rebecca_emails_conv_idx ON rebecca_emails(conversation_id);
CREATE INDEX IF NOT EXISTS rebecca_feedback_status_idx ON rebecca_feedback(status);
CREATE INDEX IF NOT EXISTS coverage_snapshots_entity_idx ON coverage_snapshots(entity_type, entity_id);
