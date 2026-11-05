import { optionalSecret } from '@omnigtm/core';

export type ProviderKind = 'openai' | 'gemini' | 'mock';

export interface ProviderSpec {
  /** Stable id used in telemetry, the UI and the MCP surface. */
  id: string;
  label: string;
  kind: ProviderKind;
  /** OpenAI-compatible base URL (no trailing slash), e.g. https://api.groq.com/openai/v1 */
  baseUrl?: string;
  /** Env var that holds the bearer token. Never the token itself. */
  apiKeyEnv?: string;
  /** Runtime token for endpoints added from the Settings UI (already unsealed, never persisted raw). */
  apiKey?: string;
  model: string;
  /** Ordered alternates tried when the primary model is retired or unavailable. */
  fallbackModels?: string[];
  priority: number;
  rpm?: number;
  /** Per-provider request timeout; falls back to the request/default timeout. */
  timeoutMs?: number;
  /** Sent to OpenAI-compatible providers that support it (Groq gpt-oss). */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Extra headers (e.g. OpenRouter attribution). */
  headers?: Record<string, string>;
  /** Mock behaviour for deterministic evals. */
  mockMode?: 'ok' | 'rate_limited';
  notes?: string;
}

export interface CustomEndpoint {
  id: string;
  label: string;
  baseUrl: string;
  apiKeyEnv?: string;
  model: string;
  priority?: number;
  headers?: Record<string, string>;
  enabled?: boolean;
}

/**
 * Default chain: fastest verified free tiers first, paid tiers excluded.
 * Every entry is overridable by env so a retired free model is a config change,
 * not a code change.
 */
export function resolveProviders(): ProviderSpec[] {
  const specs: ProviderSpec[] = [
    {
      id: 'groq_lpu_free',
      label: 'Groq Cloud (free LPU)',
      kind: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
      model: optionalSecret('GROQ_MODEL') ?? 'openai/gpt-oss-120b',
      fallbackModels: ['qwen/qwen3.8-27b', 'llama-3.1-8b-instant'],
      priority: 10,
      rpm: 30,
      reasoningEffort: 'low',
      timeoutMs: 20_000,
      notes: '30 RPM / 1,000 RPD on gpt-oss-120b. Sub-400ms TTFT.',
    },
    {
      id: 'openrouter_free',
      label: 'OpenRouter (:free models)',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      model: optionalSecret('OPENROUTER_MODEL') ?? 'nvidia/nemotron-3-ultra-550b-a55b:free',
      fallbackModels: ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free'],
      priority: 20,
      rpm: 20,
      timeoutMs: 30_000,
      headers: {
        'HTTP-Referer': optionalSecret('OMNIGTM_PUBLIC_BASE_URL') ?? 'https://signhify.dpdns.org',
        'X-Title': 'Signhify OmniGTM',
      },
      notes: '20 RPM / 50 RPD at $0 balance. Free roster rotates — override OPENROUTER_MODEL.',
    },
    {
      id: 'google_ai_studio',
      label: 'Google AI Studio (Gemini Flash)',
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKeyEnv: 'GEMINI_API_KEY',
      model: optionalSecret('GEMINI_MODEL') ?? 'gemini-2.5-flash',
      fallbackModels: ['gemini-flash-lite-latest', 'gemini-3-flash-preview'],
      priority: 30,
      rpm: 15,
      timeoutMs: 25_000,
      notes: 'Free-tier prompts may be used to improve Google products — never send tenant PII.',
    },
    {
      id: 'cerebras_free',
      label: 'Cerebras Inference (free)',
      kind: 'openai',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKeyEnv: 'CEREBRAS_API_KEY',
      model: optionalSecret('CEREBRAS_MODEL') ?? 'gpt-oss-120b',
      fallbackModels: ['qwen-3.8-27b'],
      priority: 40,
      rpm: 5,
      timeoutMs: 15_000,
      notes: 'Free tier may return HTTP 402 once credits lapse — kept behind Gemini for that reason.',
    },
    {
      id: 'nvidia_nim',
      label: 'NVIDIA NIM (build.nvidia.com)',
      kind: 'openai',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKeyEnv: 'NVIDIA_API_KEY',
      model: optionalSecret('NIM_MODEL') ?? 'deepseek-ai/deepseek-v4.1-flash',
      priority: 50,
      rpm: 20,
      timeoutMs: 12_000,
      notes: 'Free developer credits. Model ids move — set NIM_MODEL.',
    },
    {
      id: 'mistral_free',
      label: 'Mistral (experiment tier)',
      kind: 'openai',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKeyEnv: 'MISTRAL_API_KEY',
      model: optionalSecret('MISTRAL_MODEL') ?? 'mistral-small-latest',
      priority: 60,
      rpm: 30,
      timeoutMs: 20_000,
    },
    {
      id: 'ollama_local',
      label: 'Ollama (local, offline)',
      kind: 'openai',
      baseUrl: optionalSecret('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434/v1',
      apiKeyEnv: 'OLLAMA_API_KEY',
      model: optionalSecret('OLLAMA_MODEL') ?? 'qwen2.5-coder:7b',
      priority: 90,
      rpm: 9999,
      timeoutMs: 60_000,
      notes: 'Unlimited local fallback. Needs `ollama serve` and a pulled model.',
    },
  ];

  // FreeLLMAPI-style aggregator: any OpenAI-compatible gateway, configured purely by env.
  const freellmBase = optionalSecret('FREELMAPI_BASE_URL');
  if (freellmBase) {
    specs.push({
      id: 'freellmapi',
      label: 'FreeLLMAPI (custom aggregator)',
      kind: 'openai',
      baseUrl: freellmBase,
      apiKeyEnv: 'FREELMAPI_API_KEY',
      model: optionalSecret('FREELMAPI_MODEL') ?? 'auto',
      priority: Number(optionalSecret('FREELMAPI_PRIORITY') ?? 5),
      rpm: Number(optionalSecret('FREELMAPI_RPM') ?? 60),
      notes: 'OpenAI-compatible aggregator endpoint. Model "auto" is sent as-is.',
    });
  }

  return specs.sort((a, b) => a.priority - b.priority);
}

/** Endpoints added at runtime from the Settings UI (stored sealed in Postgres/SQLite). */
export function customEndpointToSpec(endpoint: CustomEndpoint): ProviderSpec {
  return {
    id: endpoint.id,
    label: endpoint.label,
    kind: 'openai',
    baseUrl: endpoint.baseUrl.replace(/\/+$/, ''),
    apiKeyEnv: endpoint.apiKeyEnv,
    model: endpoint.model,
    priority: endpoint.priority ?? 5,
    headers: endpoint.headers,
    notes: 'Custom OpenAI-compatible endpoint',
  };
}

/** True when the provider can be attempted right now (key present or offline mock). */
export function isProviderConfigured(spec: ProviderSpec, offline: boolean): boolean {
  if (spec.kind === 'mock') return true;
  if (offline) return true;
  if (spec.apiKey) return true;
  if (!spec.apiKeyEnv) return true;
  return Boolean(optionalSecret(spec.apiKeyEnv));
}
