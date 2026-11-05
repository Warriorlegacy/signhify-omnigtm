import { createHash } from 'node:crypto';
import { Repo, log, optionalSecret, scrubSecrets } from '@omnigtm/core';
import { isProviderConfigured, type ProviderSpec } from './providers.js';
import { ProviderError, extractJson, type ChatRequest, type ChatResult } from './types.js';

interface BreakerState {
  failures: number;
  openUntil: number;
  lastError?: string;
  lastSuccessAt?: number;
}

interface GatewayOptions {
  providers: ProviderSpec[];
  repo?: Repo | null;
  offline?: boolean;
  fetchImpl?: typeof fetch;
}

const breakers = new Map<string, BreakerState>();
const rateWindows = new Map<string, number[]>();

function breaker(id: string): BreakerState {
  let state = breakers.get(id);
  if (!state) {
    state = { failures: 0, openUntil: 0 };
    breakers.set(id, state);
  }
  return state;
}

function withinRateLimit(id: string, rpm: number | undefined): boolean {
  if (!rpm || rpm >= 9999) return true;
  const now = Date.now();
  const window = (rateWindows.get(id) ?? []).filter((t) => now - t < 60_000);
  rateWindows.set(id, window);
  return window.length < rpm;
}

function noteCall(id: string): void {
  const window = rateWindows.get(id) ?? [];
  window.push(Date.now());
  rateWindows.set(id, window);
}

function cacheKey(req: ChatRequest): string {
  return createHash('sha256')
    .update(JSON.stringify({ task: req.task, json: Boolean(req.json), messages: req.messages, temperature: req.temperature ?? 0.4 }))
    .digest('hex');
}

/** Deterministic offline replies used by the eval gate and unit tests. */
function mockReply(req: ChatRequest): string {
  const context = (req.context ?? []).map((c) => scrubSecrets(c)).filter(Boolean);
  const citation = context[0]?.slice(0, 80) ?? 'No external source supplied.';
  switch (req.task) {
    case 'opportunity_score':
      return JSON.stringify({
        fit_score: 88,
        reasons: ['TypeScript and agent systems match the profile', 'Remote-friendly role', 'Product surface overlaps with OmniGTM'],
        pain_point_summary: 'Ships agent infrastructure but has no deterministic eval or MCP policy layer yet.',
        outreach_angle: 'Offer a one-week MCP + eval hardening sprint, backed by the public OmniGTM repo.',
        citations: [citation],
      });
    case 'outreach_draft':
      return JSON.stringify({
        subject: '60 FPS 3D scroll preview for your CGI flythroughs',
        body:
          'Hi team — I took one of your architectural flythroughs and turned it into a scroll-reactive 60 FPS preview: 360 WebP frames, no Three.js bundle, 99 Lighthouse.\n\n' +
          'Live demo: https://signhify.dpdns.org/preview/demo\n\n' +
          'No pressure or sales pitch at all — if the direction is useful, I can ship a hero section in 48 hours.\n\n' +
          'Piyush Raj Singh · Signhify Studio\nReply STOP and I will never follow up again.',
        personalization_notes: 'References the studio flythrough and the 48-hour hero sprint.',
        citations: [citation],
      });
    case 'reel_script':
      return JSON.stringify({
        title: 'Stop paying $580/mo for outbound and video SaaS',
        hook: 'Stop paying $580/month for stacked outbound SaaS.',
        beats: [
          'Poll Greenhouse, Lever and Ashby directly — no enrichment credits.',
          'Fail over Groq → Cerebras → Gemini in under 400ms.',
          'Render 60 FPS reels with FFmpeg and publish through official APIs.',
        ],
        cta: 'Comment "FOSS" and I will DM you the full repo + docker-compose blueprint.',
        virality_score: 91,
        description: 'The $0 stack that replaced Clay, Instantly and Creatomate. Repo in the comments.',
        hashtags: ['opensource', 'buildinpublic', 'aiagents'],
        citations: [citation],
      });
    default:
      return JSON.stringify({
        summary: scrubSecrets(`Grounded on: ${citation}`),
        citations: [citation],
      });
  }
}

export class AiGateway {
  private readonly providers: ProviderSpec[];
  private readonly repo: Repo | null;
  private readonly offline: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GatewayOptions) {
    this.providers = options.providers;
    this.repo = options.repo ?? null;
    this.offline = options.offline ?? false;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get chain(): ProviderSpec[] {
    return this.providers;
  }

  health(): { id: string; label: string; configured: boolean; open: boolean; failures: number; lastError?: string; lastSuccessAt?: number }[] {
    return this.providers.map((p) => {
      const state = breaker(p.id);
      return {
        id: p.id,
        label: p.label,
        configured: isProviderConfigured(p, this.offline),
        open: state.openUntil > Date.now(),
        failures: state.failures,
        lastError: state.lastError,
        lastSuccessAt: state.lastSuccessAt,
      };
    });
  }

  async chat(req: ChatRequest): Promise<ChatResult<string>> {
    return this.run(req, (text) => text);
  }

  async chatJson<T>(req: ChatRequest, validate: (value: unknown) => T): Promise<ChatResult<T>> {
    return this.run(req, (text) => validate(extractJson(text)));
  }

  private async run<T>(req: ChatRequest, parse: (text: string) => T): Promise<ChatResult<T>> {
    const started = Date.now();
    const key = cacheKey(req);
    const ttl = req.cacheTtl ?? 3600;

    if (this.repo && ttl > 0) {
      const hit = (await this.repo.cacheGet(key)) as { text: string } | null;
      if (hit && typeof hit.text === 'string') {
        const parsed = parse(hit.text);
        await this.repo.recordUsage({ provider: 'cache', model: 'cache', task: req.task, latencyMs: Date.now() - started, ok: true, cached: true });
        return {
          output: parsed,
          text: hit.text,
          provider: 'cache',
          model: 'cache',
          latencyMs: Date.now() - started,
          attempts: 0,
          cached: true,
          fellBack: false,
        };
      }
    }

    const ordered = [...this.providers].sort((a, b) => a.priority - b.priority);
    const now = Date.now();
    const open = ordered.filter((p) => breaker(p.id).openUntil > now);
    // If every circuit is open, retry the one that recovers first (half-open probe).
    const probe = open.sort((a, b) => breaker(a.id).openUntil - breaker(b.id).openUntil)[0];
    const candidates = open.length === ordered.length && probe ? [probe] : ordered;

    let attempts = 0;
    let lastError: unknown;

    for (const spec of candidates) {
      if (!isProviderConfigured(spec, this.offline)) continue;
      const state = breaker(spec.id);
      if (state.openUntil > Date.now()) continue;
      if (!withinRateLimit(spec.id, spec.rpm)) {
        lastError = new ProviderError(`Local RPM cap reached for ${spec.id}`, 429);
        continue;
      }

      const models = [spec.model, ...(spec.fallbackModels ?? [])];
      for (const model of models) {
        attempts += 1;
        noteCall(spec.id);
        const attemptStart = Date.now();
        try {
          const text = scrubSecrets(await this.callProvider(spec, model, req));
          if (!text.trim()) throw new ProviderError('Empty completion', 502);
          const parsed = parse(text);
          state.failures = 0;
          state.openUntil = 0;
          state.lastSuccessAt = Date.now();
          state.lastError = undefined;
          if (this.repo) {
            if (ttl > 0) await this.repo.cachePut(key, { text }, ttl);
            await this.repo.recordUsage({ provider: spec.id, model, task: req.task, latencyMs: Date.now() - attemptStart, ok: true, cached: false });
          }
          return {
            output: parsed,
            text,
            provider: spec.id,
            model,
            latencyMs: Date.now() - started,
            attempts,
            cached: false,
            fellBack: attempts > 1,
          };
        } catch (error) {
          lastError = error;
          const status = error instanceof ProviderError ? error.status : undefined;
          const message = error instanceof Error ? error.message : String(error);
          const modelMissing = status === 404 || /model.*(not found|decommission|does not exist|unavailable)/i.test(message);
          log.warn('provider attempt failed', { provider: spec.id, model, status, message: message.slice(0, 160) });
          if (this.repo) {
            await this.repo.recordUsage({ provider: spec.id, model, task: req.task, latencyMs: Date.now() - attemptStart, ok: false, cached: false, error: message });
          }
          if (modelMissing && model !== models[models.length - 1]) continue;
          break;
        }
      }

      state.failures += 1;
      state.lastError = lastError instanceof Error ? lastError.message.slice(0, 200) : 'unknown';
      const cooldown = Math.min(60_000, 2 ** Math.min(state.failures, 6) * 1000);
      state.openUntil = Date.now() + cooldown;
    }

    throw new Error(`All LLM providers exhausted. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  private async callProvider(spec: ProviderSpec, model: string, req: ChatRequest): Promise<string> {
    if (spec.kind === 'mock') {
      if (spec.mockMode === 'rate_limited') throw new ProviderError('HTTP 429 simulated rate limit', 429);
      return mockReply(req);
    }
    // Offline test mode must never touch the network: tests and the eval gate run
    // without keys and must stay deterministic. isProviderConfigured() lets these
    // specs through in offline mode, so the short-circuit belongs here.
    if (this.offline) return mockReply(req);
    const timeout = req.timeoutMs ?? spec.timeoutMs ?? 25_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      if (spec.kind === 'gemini') return await this.callGemini(spec, model, req, controller.signal);
      return await this.callOpenAiCompatible(spec, model, req, controller.signal);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ProviderError(`Timeout after ${timeout}ms`, 504);
      throw new ProviderError(error instanceof Error ? error.message : String(error), 502);
    } finally {
      clearTimeout(timer);
    }
  }

  private headersFor(spec: ProviderSpec): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(spec.headers ?? {}) };
    const key = spec.apiKey ?? (spec.apiKeyEnv ? optionalSecret(spec.apiKeyEnv) : undefined);
    if (key) headers.Authorization = `Bearer ${key}`;
    return headers;
  }

  private async callOpenAiCompatible(spec: ProviderSpec, model: string, req: ChatRequest, signal: AbortSignal): Promise<string> {
    const url = `${(spec.baseUrl ?? '').replace(/\/+$/, '')}/chat/completions`;
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.4,
      // Reasoning models (gpt-oss, qwen3) can spend a tiny budget entirely on
      // hidden reasoning and return an empty string. Keep a sane floor.
      max_tokens: Math.max(req.maxTokens ?? 900, 400),
      stream: false,
    };
    if (req.json) body.response_format = { type: 'json_object' };
    if (spec.reasoningEffort) body.reasoning_effort = spec.reasoningEffort;

    const doFetch = async (payload: Record<string, unknown>) => {
      const res = await this.fetchImpl(url, { method: 'POST', headers: this.headersFor(spec), body: JSON.stringify(payload), signal });
      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500 || res.status === 408;
        throw new ProviderError(`${spec.id} HTTP ${res.status}: ${text.slice(0, 220)}`, res.status, retryable);
      }
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError(`${spec.id} returned non-JSON`, 502);
      }
      const choice = json.choices?.[0];
      const content = choice?.message?.content ?? choice?.text ?? '';
      return typeof content === 'string' ? content : JSON.stringify(content);
    };

    try {
      return await doFetch(body);
    } catch (error) {
      // Some OpenAI-compatible servers reject response_format — retry once without it.
      if (req.json && error instanceof ProviderError && error.status === 400 && body.response_format) {
        delete body.response_format;
        return await doFetch(body);
      }
      throw error;
    }
  }

  private async callGemini(spec: ProviderSpec, model: string, req: ChatRequest, signal: AbortSignal): Promise<string> {
    const key = spec.apiKey ?? (spec.apiKeyEnv ? optionalSecret(spec.apiKeyEnv) : undefined);
    if (!key) throw new ProviderError(`Missing ${spec.apiKeyEnv}`, 401, false);
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxTokens ?? 900,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = `${(spec.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const text = await res.text();
    if (!res.ok) throw new ProviderError(`gemini HTTP ${res.status}: ${text.slice(0, 220)}`, res.status, res.status === 429 || res.status >= 500);
    const json = JSON.parse(text) as any;
    if (json.promptFeedback?.blockReason) throw new ProviderError(`gemini blocked: ${json.promptFeedback.blockReason}`, 400, false);
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const out = parts.map((p: any) => p.text ?? '').join('');
    if (!out) throw new ProviderError('gemini returned an empty candidate', 502);
    return out;
  }
}
