-- Signhify OmniGTM - initial Postgres schema (Neon / Supabase / Render Postgres)
-- The app also self-migrates on boot; this file exists so a new database can be
-- provisioned by hand or by Supabase's migration runner.

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  daily_email_cap INTEGER NOT NULL DEFAULT 150,
  daily_ig_dm_cap INTEGER NOT NULL DEFAULT 80,
  encrypted_api_keys TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key TEXT UNIQUE NOT NULL,
  track TEXT NOT NULL,
  company_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  decision_maker_name TEXT,
  decision_maker_role TEXT,
  contact_email TEXT,
  company_url TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  location TEXT,
  remote INTEGER NOT NULL DEFAULT 0,
  salary_text TEXT,
  description_snippet TEXT NOT NULL DEFAULT '',
  pain_point_summary TEXT NOT NULL DEFAULT '',
  fit_score REAL NOT NULL DEFAULT 0,
  fit_reasons TEXT NOT NULL DEFAULT '[]',
  stage TEXT NOT NULL DEFAULT 'DISCOVERED',
  preview_asset_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opp_stage ON opportunities(track, stage);
CREATE INDEX IF NOT EXISTS idx_opp_score ON opportunities(fit_score);
CREATE INDEX IF NOT EXISTS idx_opp_created ON opportunities(created_at);

CREATE TABLE IF NOT EXISTS outreach_events (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  sender_mailbox TEXT NOT NULL,
  relay_provider TEXT NOT NULL,
  sequence_step INTEGER NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  message_id_header TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outreach_opp ON outreach_events(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_outreach_mailbox ON outreach_events(sender_mailbox, sent_at);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic_hash TEXT UNIQUE NOT NULL,
  pillar TEXT NOT NULL,
  title TEXT NOT NULL,
  hook_line TEXT NOT NULL,
  script_json TEXT NOT NULL,
  virality_score INTEGER NOT NULL DEFAULT 0,
  mp4_storage_url TEXT,
  thumbnail_url TEXT,
  cta_keyword TEXT NOT NULL DEFAULT 'FOSS',
  ig_media_id TEXT,
  linkedin_urn TEXT,
  youtube_video_id TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  published_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status);

CREATE TABLE IF NOT EXISTS previews (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  source_url TEXT NOT NULL,
  frame_count INTEGER NOT NULL,
  bundle_bytes INTEGER NOT NULL DEFAULT 0,
  fps INTEGER NOT NULL DEFAULT 60,
  width INTEGER NOT NULL DEFAULT 1280,
  height INTEGER NOT NULL DEFAULT 720,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_comments_dm_log (
  id TEXT PRIMARY KEY,
  content_item_id TEXT,
  platform TEXT NOT NULL DEFAULT 'INSTAGRAM',
  external_comment_id TEXT UNIQUE NOT NULL,
  commenter_handle TEXT NOT NULL,
  matched_keyword TEXT NOT NULL,
  dm_sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_eval_runs (
  id TEXT PRIMARY KEY,
  git_commit_sha TEXT NOT NULL,
  provider_used TEXT NOT NULL,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  faithfulness_score REAL NOT NULL,
  p95_latency_ms INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  cached INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON llm_usage(created_at);

CREATE TABLE IF NOT EXISTS llm_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS healthcheck_heartbeat (
  id INTEGER PRIMARY KEY,
  last_ping_at TEXT NOT NULL,
  runner_info TEXT
);

-- Defence in depth: the app connects as the table owner, but if Supabase's anon
-- key is ever exposed it must not read pipeline data. Service role bypasses RLS.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments_dm_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthcheck_heartbeat ENABLE ROW LEVEL SECURITY;
