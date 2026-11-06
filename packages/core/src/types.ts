export type Track = 'B2B_SPRINT' | 'REMOTE_JOB';

export type Stage =
  | 'DISCOVERED'
  | 'ENRICHED'
  | 'PREVIEW_BUILT'
  | 'DRAFT_READY'
  | 'SENT'
  | 'FOLLOW_UP_1'
  | 'REPLIED'
  | 'BOOKED'
  | 'CLOSED_WON'
  | 'SUPPRESSED';

export interface Workspace {
  id: string;
  owner_email: string;
  slug: string;
  display_name: string;
  daily_email_cap: number;
  daily_ig_dm_cap: number;
  encrypted_api_keys: string;
  created_at: string;
}

export interface Opportunity {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  track: Track;
  company_name: string;
  role_title: string;
  decision_maker_name: string | null;
  decision_maker_role: string | null;
  contact_email: string | null;
  company_url: string;
  source: string;
  source_url: string;
  location: string | null;
  remote: number;
  salary_text: string | null;
  description_snippet: string;
  pain_point_summary: string;
  fit_score: number;
  fit_reasons: string;
  stage: Stage;
  preview_asset_url: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityInput {
  workspaceId: string;
  track: Track;
  source: string;
  externalId: string;
  companyName: string;
  roleTitle: string;
  companyUrl: string;
  sourceUrl: string;
  location?: string | null;
  remote?: boolean;
  salaryText?: string | null;
  descriptionSnippet?: string;
  painPointSummary?: string;
  fitScore?: number;
  fitReasons?: string[];
  contactEmail?: string | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
  previewAssetUrl?: string | null;
  stage?: Stage;
}

export interface OutreachEvent {
  id: string;
  opportunity_id: string;
  sender_mailbox: string;
  relay_provider: 'GMAIL_OAUTH' | 'BREVO_SMTP' | 'BREVO_HTTP' | 'DRY_RUN';
  sequence_step: number;
  subject: string;
  body_text: string;
  message_id_header: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ContentItem {
  id: string;
  workspace_id: string;
  topic_hash: string;
  pillar: string;
  title: string;
  hook_line: string;
  script_json: string;
  virality_score: number;
  mp4_storage_url: string | null;
  thumbnail_url: string | null;
  cta_keyword: string;
  ig_media_id: string | null;
  linkedin_urn: string | null;
  youtube_video_id: string | null;
  status: 'PLANNED' | 'RENDERED' | 'PUBLISHED' | 'FAILED';
  published_at: string | null;
  created_at: string;
}

export interface PreviewRecord {
  id: string;
  slug: string;
  source_url: string;
  frame_count: number;
  bundle_bytes: number;
  fps: number;
  width: number;
  height: number;
  manifest_json: string;
  created_at: string;
}

export interface EvalRun {
  id: string;
  git_commit_sha: string;
  provider_used: string;
  total_cases: number;
  passed_cases: number;
  faithfulness_score: number;
  p95_latency_ms: number;
  details_json: string;
  created_at: string;
}

export interface UsageRow {
  id: string;
  provider: string;
  model: string;
  task: string;
  latency_ms: number;
  ok: number;
  cached: number;
  error: string | null;
  created_at: string;
}

export interface DashboardStats {
  opportunities: number;
  remoteJobs: number;
  b2bSprints: number;
  draftsReady: number;
  sent: number;
  previews: number;
  reels: number;
  published: number;
  evalScore: number;
  evalRunAt: string | null;
  llmCalls: number;
  llmCacheHits: number;
  llmAvgLatencyMs: number;
}
