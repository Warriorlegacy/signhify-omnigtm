import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { optionalSecret } from './env.js';
import { idempotencyKey, nowIso, uuid } from './ids.js';
import { log } from './logger.js';
import { statePath } from './paths.js';
import type {
  ContentItem,
  DashboardStats,
  EvalRun,
  Opportunity,
  OpportunityInput,
  OutreachEvent,
  PreviewRecord,
  Stage,
  Track,
  UsageRow,
  Workspace,
} from './types.js';

/**
 * One schema, two drivers.
 *  - Postgres (Neon / Supabase) when DATABASE_URL is set.
 *  - node:sqlite file otherwise, so the app boots with zero external services.
 * SQL uses `?` placeholders; the Postgres driver rewrites them to $1..$n.
 */

const SCHEMA = `
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
  workspace_id TEXT NOT NULL,
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
  opportunity_id TEXT NOT NULL,
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
  workspace_id TEXT NOT NULL,
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
  expires_at INTEGER NOT NULL,
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
`;

export interface Driver {
  dialect: 'sqlite' | 'postgres';
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

type SqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number };
};
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};
type SqliteModule = { DatabaseSync: new (path: string) => SqliteDatabase };

async function createSqliteDriver(file: string): Promise<Driver> {
  mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = (await import('node:sqlite')) as unknown as SqliteModule;
  const db = new sqlite.DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  const cache = new Map<string, SqliteStatement>();
  const stmt = (sql: string): SqliteStatement => {
    let prepared = cache.get(sql);
    if (!prepared) {
      prepared = db.prepare(sql);
      cache.set(sql, prepared);
    }
    return prepared;
  };
  return {
    dialect: 'sqlite',
    async all<T>(sql: string, params: unknown[] = []) {
      return stmt(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return stmt(sql).get(...params) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      return stmt(sql).run(...params);
    },
    async exec(sql: string) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

async function createPostgresDriver(connectionString: string): Promise<Driver> {
  const { Pool } = (await import('pg')) as unknown as {
    Pool: new (config: Record<string, unknown>) => {
      query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
      end(): Promise<void>;
    };
  };
  const needsSsl = /sslmode=require|neon\.tech|supabase\.co|render\.com/i.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  const toPg = (sql: string): string => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${(i += 1)}`);
  };
  return {
    dialect: 'postgres',
    async all<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(toPg(sql), params);
      return res.rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(toPg(sql), params);
      return res.rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      const res = await pool.query(toPg(sql), params);
      return { changes: res.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

let driverPromise: Promise<Driver> | null = null;

export function dbFile(): string {
  return statePath(optionalSecret('OMNIGTM_DB_PATH'), 'omnigtm.db');
}

export async function getDriver(): Promise<Driver> {
  if (!driverPromise) {
    const url = optionalSecret('DATABASE_URL');
    driverPromise = (url ? createPostgresDriver(url) : createSqliteDriver(dbFile())).then(async (driver) => {
      await driver.exec(SCHEMA);
      log.info('database ready', { dialect: driver.dialect });
      return driver;
    });
  }
  return driverPromise;
}

export async function closeDb(): Promise<void> {
  if (!driverPromise) return;
  const driver = await driverPromise;
  await driver.close();
  driverPromise = null;
}

const bool = (v: boolean | undefined): number => (v ? 1 : 0);
const json = (v: unknown): string => JSON.stringify(v ?? null);

export class Repo {
  constructor(private readonly driver: Driver) {}

  static async open(): Promise<Repo> {
    return new Repo(await getDriver());
  }

  get dialect(): 'sqlite' | 'postgres' {
    return this.driver.dialect;
  }

  async ensureWorkspace(slug = 'signhify', displayName = 'Signhify Studio', ownerEmail = 'founder@signhify.studio'): Promise<Workspace> {
    const existing = await this.driver.get<Workspace>('SELECT * FROM workspaces WHERE slug = ?', [slug]);
    if (existing) return existing;
    const row: Workspace = {
      id: uuid(),
      owner_email: ownerEmail,
      slug,
      display_name: displayName,
      daily_email_cap: 150,
      daily_ig_dm_cap: 80,
      encrypted_api_keys: '{}',
      created_at: nowIso(),
    };
    await this.driver.run(
      'INSERT INTO workspaces (id, owner_email, slug, display_name, daily_email_cap, daily_ig_dm_cap, encrypted_api_keys, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [row.id, row.owner_email, row.slug, row.display_name, row.daily_email_cap, row.daily_ig_dm_cap, row.encrypted_api_keys, row.created_at]
    );
    return row;
  }

  // ---------------------------------------------------------------- opportunities
  async upsertOpportunity(input: OpportunityInput): Promise<{ id: string; inserted: boolean }> {
    const key = idempotencyKey(input.source, input.externalId);
    const existing = await this.driver.get<{ id: string }>('SELECT id FROM opportunities WHERE idempotency_key = ?', [key]);
    const ts = nowIso();
    if (existing) {
      await this.driver.run(
        `UPDATE opportunities SET fit_score = ?, fit_reasons = ?, pain_point_summary = ?, description_snippet = ?,
           location = ?, remote = ?, salary_text = ?, preview_asset_url = COALESCE(?, preview_asset_url), updated_at = ?
         WHERE id = ?`,
        [
          input.fitScore ?? 0,
          json(input.fitReasons ?? []),
          input.painPointSummary ?? '',
          input.descriptionSnippet ?? '',
          input.location ?? null,
          bool(input.remote),
          input.salaryText ?? null,
          input.previewAssetUrl ?? null,
          ts,
          existing.id,
        ]
      );
      return { id: existing.id, inserted: false };
    }
    const id = uuid();
    await this.driver.run(
      `INSERT INTO opportunities (id, workspace_id, idempotency_key, track, company_name, role_title, decision_maker_name,
         decision_maker_role, contact_email, company_url, source, source_url, location, remote, salary_text,
         description_snippet, pain_point_summary, fit_score, fit_reasons, stage, preview_asset_url, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.workspaceId,
        key,
        input.track,
        input.companyName,
        input.roleTitle,
        input.decisionMakerName ?? null,
        input.decisionMakerRole ?? null,
        input.contactEmail ?? null,
        input.companyUrl,
        input.source,
        input.sourceUrl,
        input.location ?? null,
        bool(input.remote),
        input.salaryText ?? null,
        input.descriptionSnippet ?? '',
        input.painPointSummary ?? '',
        input.fitScore ?? 0,
        json(input.fitReasons ?? []),
        input.stage ?? 'DISCOVERED',
        input.previewAssetUrl ?? null,
        ts,
        ts,
      ]
    );
    return { id, inserted: true };
  }

  async listOpportunities(opts: { track?: Track; stage?: Stage; minScore?: number; limit?: number; offset?: number; q?: string } = {}): Promise<Opportunity[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.track) {
      where.push('track = ?');
      params.push(opts.track);
    }
    if (opts.stage) {
      where.push('stage = ?');
      params.push(opts.stage);
    }
    if (typeof opts.minScore === 'number') {
      where.push('fit_score >= ?');
      params.push(opts.minScore);
    }
    if (opts.q) {
      where.push('(company_name LIKE ? OR role_title LIKE ?)');
      params.push(`%${opts.q}%`, `%${opts.q}%`);
    }
    const sql = `SELECT * FROM opportunities ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY fit_score DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(Math.min(opts.limit ?? 50, 500), opts.offset ?? 0);
    return this.driver.all<Opportunity>(sql, params);
  }

  async getOpportunity(id: string): Promise<Opportunity | undefined> {
    return this.driver.get<Opportunity>('SELECT * FROM opportunities WHERE id = ?', [id]);
  }

  /** Cross-source dedupe: the same role posted on two boards should not double-count. */
  async findByCompanyRole(companyName: string, roleTitle: string): Promise<Opportunity | undefined> {
    return this.driver.get<Opportunity>('SELECT * FROM opportunities WHERE LOWER(company_name) = LOWER(?) AND LOWER(role_title) = LOWER(?) LIMIT 1', [companyName, roleTitle]);
  }

  async updateOpportunityScore(id: string, patch: { fitScore: number; fitReasons?: string[]; painPointSummary?: string }): Promise<void> {
    await this.driver.run('UPDATE opportunities SET fit_score = ?, fit_reasons = COALESCE(?, fit_reasons), pain_point_summary = COALESCE(?, pain_point_summary), updated_at = ? WHERE id = ?', [
      patch.fitScore,
      patch.fitReasons ? JSON.stringify(patch.fitReasons) : null,
      patch.painPointSummary ?? null,
      nowIso(),
      id,
    ]);
  }

  async updateOpportunityStage(id: string, stage: Stage, patch: { previewAssetUrl?: string; contactEmail?: string } = {}): Promise<void> {
    await this.driver.run(
      'UPDATE opportunities SET stage = ?, preview_asset_url = COALESCE(?, preview_asset_url), contact_email = COALESCE(?, contact_email), updated_at = ? WHERE id = ?',
      [stage, patch.previewAssetUrl ?? null, patch.contactEmail ?? null, nowIso(), id]
    );
  }

  // ---------------------------------------------------------------- outreach
  async insertOutreach(e: {
    opportunityId: string;
    senderMailbox: string;
    relayProvider: 'GMAIL_OAUTH' | 'BREVO_SMTP' | 'DRY_RUN';
    sequenceStep?: number;
    subject: string;
    bodyText: string;
    messageIdHeader?: string | null;
    status: string;
    error?: string | null;
  }): Promise<string> {
    const id = uuid();
    const ts = nowIso();
    await this.driver.run(
      `INSERT INTO outreach_events (id, opportunity_id, sender_mailbox, relay_provider, sequence_step, subject, body_text,
        message_id_header, status, error, sent_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        e.opportunityId,
        e.senderMailbox,
        e.relayProvider,
        e.sequenceStep ?? 1,
        e.subject,
        e.bodyText,
        e.messageIdHeader ?? null,
        e.status,
        e.error ?? null,
        e.status === 'SENT' ? ts : null,
        ts,
      ]
    );
    return id;
  }

  async listOutreach(opportunityId?: string, limit = 100): Promise<OutreachEvent[]> {
    if (opportunityId) {
      return this.driver.all<OutreachEvent>('SELECT * FROM outreach_events WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT ?', [opportunityId, limit]);
    }
    return this.driver.all<OutreachEvent>('SELECT * FROM outreach_events ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async sentTodayCount(mailbox: string): Promise<number> {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const row = await this.driver.get<{ n: number | string }>(
      "SELECT COUNT(*) AS n FROM outreach_events WHERE sender_mailbox = ? AND status = 'SENT' AND sent_at >= ?",
      [mailbox, dayStart.toISOString()]
    );
    return Number(row?.n ?? 0);
  }

  // ---------------------------------------------------------------- content
  async upsertContent(input: {
    workspaceId: string;
    topicHash: string;
    pillar: string;
    title: string;
    hookLine: string;
    script: unknown;
    viralityScore: number;
    ctaKeyword?: string;
    status?: ContentItem['status'];
  }): Promise<string> {
    const existing = await this.driver.get<{ id: string }>('SELECT id FROM content_items WHERE topic_hash = ?', [input.topicHash]);
    if (existing) {
      await this.driver.run(
        'UPDATE content_items SET title = ?, hook_line = ?, script_json = ?, virality_score = ?, pillar = ? WHERE id = ?',
        [input.title, input.hookLine, json(input.script), input.viralityScore, input.pillar, existing.id]
      );
      return existing.id;
    }
    const id = uuid();
    await this.driver.run(
      `INSERT INTO content_items (id, workspace_id, topic_hash, pillar, title, hook_line, script_json, virality_score,
        cta_keyword, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.workspaceId,
        input.topicHash,
        input.pillar,
        input.title,
        input.hookLine,
        json(input.script),
        input.viralityScore,
        input.ctaKeyword ?? 'FOSS',
        input.status ?? 'PLANNED',
        nowIso(),
      ]
    );
    return id;
  }

  async listContent(limit = 50): Promise<ContentItem[]> {
    return this.driver.all<ContentItem>('SELECT * FROM content_items ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async getContent(id: string): Promise<ContentItem | undefined> {
    return this.driver.get<ContentItem>('SELECT * FROM content_items WHERE id = ?', [id]);
  }

  async markContent(id: string, patch: { status?: ContentItem['status']; mp4Url?: string; thumbnailUrl?: string; publishedAt?: string; platform?: { ig?: string; linkedin?: string; youtube?: string } }): Promise<void> {
    await this.driver.run(
      `UPDATE content_items SET status = COALESCE(?, status), mp4_storage_url = COALESCE(?, mp4_storage_url),
        thumbnail_url = COALESCE(?, thumbnail_url), published_at = COALESCE(?, published_at),
        ig_media_id = COALESCE(?, ig_media_id), linkedin_urn = COALESCE(?, linkedin_urn),
        youtube_video_id = COALESCE(?, youtube_video_id) WHERE id = ?`,
      [patch.status ?? null, patch.mp4Url ?? null, patch.thumbnailUrl ?? null, patch.publishedAt ?? null, patch.platform?.ig ?? null, patch.platform?.linkedin ?? null, patch.platform?.youtube ?? null, id]
    );
  }

  // ---------------------------------------------------------------- previews
  async upsertPreview(p: { slug: string; sourceUrl: string; frameCount: number; bundleBytes: number; fps: number; width: number; height: number; manifest: unknown }): Promise<void> {
    const existing = await this.driver.get<{ id: string }>('SELECT id FROM previews WHERE slug = ?', [p.slug]);
    const ts = nowIso();
    if (existing) {
      await this.driver.run(
        'UPDATE previews SET source_url = ?, frame_count = ?, bundle_bytes = ?, fps = ?, width = ?, height = ?, manifest_json = ? WHERE id = ?',
        [p.sourceUrl, p.frameCount, p.bundleBytes, p.fps, p.width, p.height, json(p.manifest), existing.id]
      );
      return;
    }
    await this.driver.run(
      'INSERT INTO previews (id, slug, source_url, frame_count, bundle_bytes, fps, width, height, manifest_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [uuid(), p.slug, p.sourceUrl, p.frameCount, p.bundleBytes, p.fps, p.width, p.height, json(p.manifest), ts]
    );
  }

  async listPreviews(limit = 50): Promise<PreviewRecord[]> {
    return this.driver.all<PreviewRecord>('SELECT * FROM previews ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async getPreview(slug: string): Promise<PreviewRecord | undefined> {
    return this.driver.get<PreviewRecord>('SELECT * FROM previews WHERE slug = ?', [slug]);
  }

  // ---------------------------------------------------------------- social
  async hasCommentDm(externalCommentId: string): Promise<boolean> {
    const row = await this.driver.get('SELECT id FROM social_comments_dm_log WHERE external_comment_id = ?', [externalCommentId]);
    return Boolean(row);
  }

  async insertCommentDm(e: { contentItemId?: string | null; platform?: string; externalCommentId: string; commenterHandle: string; matchedKeyword: string }): Promise<void> {
    await this.driver.run(
      `INSERT INTO social_comments_dm_log (id, content_item_id, platform, external_comment_id, commenter_handle, matched_keyword, dm_sent_at)
       VALUES (?,?,?,?,?,?,?)`,
      [uuid(), e.contentItemId ?? null, e.platform ?? 'INSTAGRAM', e.externalCommentId, e.commenterHandle, e.matchedKeyword, nowIso()]
    );
  }

  // ---------------------------------------------------------------- evals / usage
  async insertEvalRun(run: { commitSha: string; providerUsed: string; total: number; passed: number; faithfulness: number; p95: number; details: unknown }): Promise<string> {
    const id = uuid();
    await this.driver.run(
      'INSERT INTO llm_eval_runs (id, git_commit_sha, provider_used, total_cases, passed_cases, faithfulness_score, p95_latency_ms, details_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, run.commitSha, run.providerUsed, run.total, run.passed, run.faithfulness, run.p95, json(run.details), nowIso()]
    );
    return id;
  }

  async listEvalRuns(limit = 20): Promise<EvalRun[]> {
    return this.driver.all<EvalRun>('SELECT * FROM llm_eval_runs ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async recordUsage(u: { provider: string; model: string; task: string; latencyMs: number; ok: boolean; cached: boolean; error?: string }): Promise<void> {
    await this.driver.run('INSERT INTO llm_usage (id, provider, model, task, latency_ms, ok, cached, error, created_at) VALUES (?,?,?,?,?,?,?,?,?)', [
      uuid(),
      u.provider,
      u.model,
      u.task,
      u.latencyMs,
      bool(u.ok),
      bool(u.cached),
      u.error ? u.error.slice(0, 500) : null,
      nowIso(),
    ]);
  }

  async usageByProvider(days = 7): Promise<{ provider: string; calls: number; avg_latency: number; failures: number }[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    return this.driver.all('SELECT provider, COUNT(*) AS calls, AVG(latency_ms) AS avg_latency, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures FROM llm_usage WHERE created_at >= ? GROUP BY provider ORDER BY calls DESC', [since]);
  }

  async cacheGet(key: string): Promise<unknown | null> {
    const row = await this.driver.get<{ value: string; expires_at: number | string }>('SELECT value, expires_at FROM llm_cache WHERE key = ?', [key]);
    if (!row) return null;
    if (Number(row.expires_at) < Date.now()) {
      await this.driver.run('DELETE FROM llm_cache WHERE key = ?', [key]);
      return null;
    }
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  async cachePut(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.driver.run('INSERT INTO llm_cache (key, value, expires_at, created_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at', [
      key,
      json(value),
      Date.now() + ttlSeconds * 1000,
      nowIso(),
    ]);
  }

  // ---------------------------------------------------------------- misc
  async isSuppressed(email: string): Promise<boolean> {
    const row = await this.driver.get('SELECT email FROM suppressions WHERE email = ?', [email.toLowerCase()]);
    return Boolean(row);
  }

  async suppress(email: string, reason: string): Promise<void> {
    await this.driver.run('INSERT INTO suppressions (email, reason, created_at) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING', [email.toLowerCase(), reason, nowIso()]);
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.driver.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.driver.run('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [key, value, nowIso()]);
  }

  async pingHeartbeat(runnerInfo = 'app'): Promise<string> {
    const ts = nowIso();
    await this.driver.run('INSERT INTO healthcheck_heartbeat (id, last_ping_at, runner_info) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_ping_at = excluded.last_ping_at, runner_info = excluded.runner_info', [ts, runnerInfo]);
    return ts;
  }

  async heartbeat(): Promise<{ last_ping_at: string; runner_info: string } | undefined> {
    return this.driver.get('SELECT last_ping_at, runner_info FROM healthcheck_heartbeat WHERE id = 1');
  }

  async stats(): Promise<DashboardStats> {
    const one = async (sql: string, params: unknown[] = []): Promise<number> => {
      const row = await this.driver.get<{ n: number | string }>(sql, params);
      return Number(row?.n ?? 0);
    };
    const evalRow = await this.driver.get<{ passed_cases: number; total_cases: number; created_at: string }>('SELECT passed_cases, total_cases, created_at FROM llm_eval_runs ORDER BY created_at DESC LIMIT 1');
    const usage = await this.driver.get<{ calls: number | string; hits: number | string; avg: number | string }>('SELECT COUNT(*) AS calls, SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) AS hits, AVG(latency_ms) AS avg FROM llm_usage');
    return {
      opportunities: await one('SELECT COUNT(*) AS n FROM opportunities'),
      remoteJobs: await one("SELECT COUNT(*) AS n FROM opportunities WHERE track = 'REMOTE_JOB'"),
      b2bSprints: await one("SELECT COUNT(*) AS n FROM opportunities WHERE track = 'B2B_SPRINT'"),
      draftsReady: await one("SELECT COUNT(*) AS n FROM opportunities WHERE stage = 'DRAFT_READY'"),
      sent: await one("SELECT COUNT(*) AS n FROM outreach_events WHERE status = 'SENT'"),
      previews: await one('SELECT COUNT(*) AS n FROM previews'),
      reels: await one('SELECT COUNT(*) AS n FROM content_items'),
      published: await one("SELECT COUNT(*) AS n FROM content_items WHERE status = 'PUBLISHED'"),
      evalScore: evalRow ? Number(evalRow.passed_cases) / Math.max(1, Number(evalRow.total_cases)) : 0,
      evalRunAt: evalRow?.created_at ?? null,
      llmCalls: Number(usage?.calls ?? 0),
      llmCacheHits: Number(usage?.hits ?? 0),
      llmAvgLatencyMs: Math.round(Number(usage?.avg ?? 0)),
    };
  }
}
