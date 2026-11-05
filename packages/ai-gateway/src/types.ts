import { scrubSecrets } from '@omnigtm/core';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  /** Logical task name used for cache keys and telemetry. */
  task: string;
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Cache TTL in seconds. 0 disables the cache. */
  cacheTtl?: number;
  timeoutMs?: number;
  /** Source chunks for grounding (also used by deterministic mocks). */
  context?: string[];
}

export interface ChatResult<T = string> {
  output: T;
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  attempts: number;
  cached: boolean;
  fellBack: boolean;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = true
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Extract a JSON object from a model reply that may be fenced or chatty. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? cleaned;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model reply did not contain a JSON object');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) (instructions|prompts?)/gi,
  /disregard (all )?(previous|prior|above) (instructions|prompts?)/gi,
  /you are now [^.\n]{0,80}/gi,
  /system prompt/gi,
  /reveal (your|the) (system|hidden) prompt/gi,
  /print (your|the) (api|secret|env)/gi,
];

/**
 * Wrap untrusted scraped text in a data envelope and strip instruction-override
 * attempts. The model is told to treat the block as data, never as instructions.
 */
export function wrapUntrusted(text: string, max = 4000): string {
  const scrubbed = scrubSecrets(text);
  const neutralised = INJECTION_PATTERNS.reduce((acc, re) => acc.replace(re, '[removed-instruction]'), scrubbed);
  const clipped = neutralised.length > max ? `${neutralised.slice(0, max)}…` : neutralised;
  return `<untrusted_source_data>\n${clipped}\n</untrusted_source_data>`;
}

/** Token-overlap groundedness in [0,1] — used by the UI support badge. */
export function groundedness(answer: string, sources: string[]): number {
  const tokenise = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
  const sourceTokens = new Set(sources.flatMap(tokenise));
  const answerTokens = tokenise(answer);
  if (answerTokens.length === 0 || sourceTokens.size === 0) return 0;
  const hits = answerTokens.filter((t) => sourceTokens.has(t)).length;
  return Math.min(1, hits / answerTokens.length);
}

/**
 * ECC-04 metric: how much of each citation survives verbatim from the source
 * corpus. 1.0 means every citation is an exact substring of a supplied chunk.
 */
export function citationFidelity(citations: string[], sources: string[]): number {
  if (citations.length === 0 || sources.length === 0) return 0;
  const haystack = sources.join('\n').toLowerCase().replace(/\s+/g, ' ');
  const scores = citations.map((citation) => {
    const needle = citation.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!needle) return 0;
    if (haystack.includes(needle)) return 1;
    return groundedness(needle, sources);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
