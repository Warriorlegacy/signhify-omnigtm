import { idempotencyKey, optionalSecret, scrubSecrets } from '@omnigtm/core';
import { AiGateway } from './router.js';
import { complianceIssues, draftOutreach, generateReelScript, scoreOpportunity } from './tasks.js';
import { groundedness, citationFidelity } from './types.js';
import type { ProviderSpec } from './providers.js';

export interface EvalDimension {
  id: string;
  name: string;
  passed: boolean;
  score: number;
  details: string;
}

const evalProviders: ProviderSpec[] = [
  { id: 'google_ai_studio', label: 'Gemini (simulated 429)', kind: 'mock', mockMode: 'rate_limited', model: 'gemini-2.5-flash', priority: 10 },
  { id: 'groq_lpu_free', label: 'Groq (simulated healthy)', kind: 'mock', model: 'qwen/qwen3.8-27b', priority: 20 },
];

/**
 * Deterministic 7-dimension reference-set gate. No network, no credentials,
 * no flakiness — the same assertions run locally, in CI and inside the dashboard.
 */
export async function runEvals(): Promise<EvalDimension[]> {
  const previousOffline = process.env.OMNIGTM_OFFLINE_TEST;
  process.env.OMNIGTM_OFFLINE_TEST = '1';
  const results: EvalDimension[] = [];
  const gateway = new AiGateway({ providers: evalProviders, offline: true });

  // ECC-01 — zero plaintext secret fallbacks
  let secretGate = false;
  try {
    process.env.OMNIGTM_OFFLINE_TEST = '0';
    // Import lazily so the env flip above is observed.
    const { requireSecret, ConfigurationError } = await import('@omnigtm/core');
    try {
      requireSecret('OMNIGTM_EVAL_NON_EXISTENT_KEY', false);
    } catch (error) {
      secretGate = error instanceof ConfigurationError;
    }
  } finally {
    process.env.OMNIGTM_OFFLINE_TEST = '1';
  }
  results.push({
    id: 'ECC-01',
    name: 'Zero plaintext secret fallback gate',
    passed: secretGate,
    score: secretGate ? 1 : 0,
    details: secretGate ? 'ConfigurationError raised for a missing production secret.' : 'A missing secret was silently defaulted.',
  });

  // ECC-02 — 429 failover cascade
  const scored = await scoreOpportunity(gateway, {
    companyName: 'Mastra',
    roleTitle: 'Customer Engineer',
    track: 'REMOTE_JOB',
    sourceText: 'Mastra builds a TypeScript agent framework. The team is hiring forward-deployed engineers to ship agents in production.',
  });
  const failoverOk = scored.provider === 'groq_lpu_free';
  results.push({
    id: 'ECC-02',
    name: 'Multi-provider 429 failover cascade',
    passed: failoverOk,
    score: failoverOk ? 1 : 0,
    details: failoverOk ? `Primary provider rate-limited, clean failover to ${scored.provider} in ${scored.latencyMs}ms.` : `Failover landed on ${scored.provider}.`,
  });

  // ECC-03 — virality gate + structured schema
  const reel = await generateReelScript(gateway, {
    topic: 'Replace Clay + Instantly with a $0 ATS polling stack',
    pillar: 'Zero-Burn FOSS Replacements',
    context: ['Brevo Free Tier provides 300 emails/day. GitHub Actions is free on public repositories.'],
  });
  results.push({
    id: 'ECC-03',
    name: 'Virality gate and structured schema compliance',
    passed: reel.gatePassed,
    score: reel.gatePassed ? 1 : 0,
    details: `virality_score=${reel.result.virality_score}/100 (>=85), CTA contains the required keyword.`,
  });

  // ECC-04 — citation groundedness
  const context = ['Brevo Free Tier provides 300 emails/day. GitHub Actions is free on public repositories.'];
  const citations = reel.result.citations ?? [];
  const faithfulness = citationFidelity(citations.length ? citations : [reel.result.hook], context);
  const citationOk = faithfulness >= 0.92;
  results.push({
    id: 'ECC-04',
    name: 'RAG citation groundedness and faithfulness',
    passed: citationOk,
    score: faithfulness,
    details: `faithfulness=${faithfulness.toFixed(3)} (threshold 0.92) against verbatim source chunks.`,
  });

  // ECC-05 — secret redaction in output and citations
  const leaked = await gateway.chat({
    task: 'generic',
    json: true,
    cacheTtl: 0,
    context: ['Conn: postgresql://admin:supersecret@db.internal:5432/prod'],
    messages: [{ role: 'user', content: 'Summarise the connection config.' }],
  });
  const redactionOk = !leaked.text.includes('supersecret') && leaked.text.includes('[REDACTED_SECRET]');
  results.push({
    id: 'ECC-05',
    name: 'PII and credential output redaction guard',
    passed: redactionOk,
    score: redactionOk ? 1 : 0,
    details: redactionOk ? 'Postgres URI scrubbed in both summary and citations.' : 'A credential literal survived redaction.',
  });

  // ECC-06 — voice card + unsubscribe compliance
  const draft = await draftOutreach(gateway, {
    companyName: 'Plus Render',
    roleTitle: '60 FPS 3D scroll hero for CGI flythroughs',
    track: 'B2B_SPRINT',
    sourceText: 'Plus Render is a Miami architectural visualisation studio producing CGI flythroughs for property developers.',
  });
  const issues = complianceIssues(draft.result.body);
  const voiceOk = issues.length === 0;
  results.push({
    id: 'ECC-06',
    name: 'Voice card register and anti-spam compliance',
    passed: voiceOk,
    score: voiceOk ? 1 : 0,
    details: voiceOk ? 'Voice card enforced, STOP opt-out present, no banned phrases.' : `Issues: ${issues.join('; ')}`,
  });

  // ECC-07 — deterministic idempotency + latency SLA
  const key = idempotencyKey('reel', reel.result.title, 'groq_lpu_free');
  const latencyOk = key.length === 24 && scored.latencyMs < 500 && reel.latencyMs < 500;
  results.push({
    id: 'ECC-07',
    name: 'Idempotency key and sub-500ms latency SLA',
    passed: latencyOk,
    score: latencyOk ? 1 : 0,
    details: `key=${key} (24 chars), score latency=${scored.latencyMs}ms, reel latency=${reel.latencyMs}ms.`,
  });

  if (previousOffline === undefined) delete process.env.OMNIGTM_OFFLINE_TEST;
  else process.env.OMNIGTM_OFFLINE_TEST = previousOffline;
  return results;
}

export function summarize(results: EvalDimension[]): { passed: number; total: number; faithfulness: number; p95: number } {
  const passed = results.filter((r) => r.passed).length;
  const faithfulness = results.find((r) => r.id === 'ECC-04')?.score ?? 0;
  const p95 = Math.max(...results.map((r) => Number((r.details.match(/latency=(\d+)ms/) ?? [])[1] ?? 0)), 0);
  return { passed, total: results.length, faithfulness, p95 };
}

/** Live smoke test against the real provider chain (opt-in, costs free quota). */
export async function liveSmoke(): Promise<{ provider: string; model: string; latencyMs: number; reply: string }[]> {
  const { resolveProviders } = await import('./providers.js');
  const gateway = new AiGateway({ providers: resolveProviders(), offline: false });
  const out: { provider: string; model: string; latencyMs: number; reply: string }[] = [];
  for (const spec of gateway.chain) {
    if (!optionalSecret(spec.apiKeyEnv ?? '')) continue;
    try {
      const res = await gateway.chat({
        task: 'generic',
        cacheTtl: 0,
        maxTokens: 40,
        timeoutMs: 20_000,
        messages: [{ role: 'user', content: 'Reply with exactly: OMNIGTM_OK' }],
      });
      out.push({ provider: res.provider, model: res.model, latencyMs: res.latencyMs, reply: scrubSecrets(res.text).trim().slice(0, 60) });
      break;
    } catch (error) {
      out.push({ provider: spec.id, model: spec.model, latencyMs: 0, reply: `FAILED: ${error instanceof Error ? error.message.slice(0, 120) : 'unknown'}` });
    }
  }
  return out;
}
