import { Repo, isOfflineTest, log, openJson, sealJson } from '@omnigtm/core';
import { customEndpointToSpec, resolveProviders, type CustomEndpoint, type ProviderSpec } from './providers.js';
import { AiGateway } from './router.js';

/**
 * Settings-UI endpoints. The whole array (including bearer tokens) is sealed
 * with AES-256-GCM and stored in the `settings` table, so nothing mutable is
 * committed and no token ever lands in plaintext at rest.
 */
export interface StoredEndpoint extends CustomEndpoint {
  apiKey?: string;
  createdAt?: string;
}

const SETTINGS_KEY = 'custom_endpoints';

export function endpointId(label: string): string {
  return `custom_${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)}`;
}

export async function loadStoredEndpoints(repo: Repo | null | undefined): Promise<StoredEndpoint[]> {
  if (!repo) return [];
  const raw = await repo.getSetting(SETTINGS_KEY);
  if (!raw) return [];
  try {
    const parsed = openJson<StoredEndpoint[]>(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.baseUrl && e.model) : [];
  } catch (error) {
    log.warn('stored custom endpoints could not be unsealed - ignoring', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export async function saveStoredEndpoints(repo: Repo, endpoints: StoredEndpoint[]): Promise<void> {
  await repo.setSetting(SETTINGS_KEY, sealJson(endpoints));
}

/** Redacted view for the Settings page - never returns the token. */
export async function listEndpoints(repo: Repo): Promise<(StoredEndpoint & { hasKey: boolean; apiKey?: undefined })[]> {
  const endpoints = await loadStoredEndpoints(repo);
  return endpoints.map(({ apiKey, ...rest }) => ({ ...rest, hasKey: Boolean(apiKey) }));
}

export async function addEndpoint(
  repo: Repo,
  input: { label: string; baseUrl: string; model: string; apiKey?: string; priority?: number; headers?: Record<string, string> }
): Promise<StoredEndpoint> {
  const label = input.label.trim();
  if (!label) throw new Error('label is required');
  const url = parseBaseUrl(input.baseUrl);
  if (!input.model.trim()) throw new Error('model is required');

  const endpoints = await loadStoredEndpoints(repo);
  const id = endpointId(label);
  const record: StoredEndpoint = {
    id,
    label,
    baseUrl: url,
    model: input.model.trim(),
    apiKey: input.apiKey?.trim() || undefined,
    priority: Number.isFinite(input.priority) ? Number(input.priority) : 5,
    headers: input.headers,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  const next = [...endpoints.filter((e) => e.id !== id), record];
  await saveStoredEndpoints(repo, next);
  return record;
}

/**
 * Accept what people actually paste. A bare origin becomes `/v1` (every
 * OpenAI-compatible gateway, FreeLLMAPI included, serves that path); an
 * explicit path is left alone. The cloud metadata address is refused because
 * this URL is fetched server-side.
 */
export function parseBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('baseUrl must be an absolute http(s) URL');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('baseUrl must use http or https');
  if (url.hostname === '169.254.169.254' || url.hostname === 'metadata.google.internal') {
    throw new Error('baseUrl points at a cloud metadata endpoint');
  }
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/v1';
  return url.toString().replace(/\/+$/, '');
}

export interface ModelDiscovery {
  ok: boolean;
  baseUrl: string;
  models: string[];
  latencyMs: number;
  error?: string;
}

/** GET /models so the Settings page can prove a gateway works before saving it. */
export async function discoverModels(input: { baseUrl: string; apiKey?: string; timeoutMs?: number }): Promise<ModelDiscovery> {
  const baseUrl = parseBaseUrl(input.baseUrl);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        Accept: 'application/json',
        ...(input.apiKey?.trim() ? { Authorization: `Bearer ${input.apiKey.trim()}` } : {}),
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, baseUrl, models: [], latencyMs: Date.now() - started, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, baseUrl, models: [], latencyMs: Date.now() - started, error: 'Response was not JSON' };
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown }).data;
    const models = Array.isArray(rows)
      ? rows
          .map((row) => (typeof row === 'string' ? row : (row as { id?: unknown; name?: unknown })?.id ?? (row as { name?: unknown })?.name))
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    return { ok: true, baseUrl, models: models.slice(0, 200), latencyMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Timed out after 10s' : error instanceof Error ? error.message : String(error);
    return { ok: false, baseUrl, models: [], latencyMs: Date.now() - started, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function removeEndpoint(repo: Repo, id: string): Promise<boolean> {
  const endpoints = await loadStoredEndpoints(repo);
  const next = endpoints.filter((e) => e.id !== id);
  if (next.length === endpoints.length) return false;
  await saveStoredEndpoints(repo, next);
  return true;
}

/** Env chain + sealed Settings-UI endpoints, de-duplicated by id. */
export async function resolveProvidersWithStored(repo?: Repo | null): Promise<ProviderSpec[]> {
  const specs = resolveProviders();
  const stored = await loadStoredEndpoints(repo);
  for (const endpoint of stored) {
    if (endpoint.enabled === false) continue;
    const spec = customEndpointToSpec(endpoint);
    spec.apiKey = endpoint.apiKey;
    const index = specs.findIndex((s) => s.id === spec.id);
    if (index >= 0) specs[index] = spec;
    else specs.push(spec);
  }
  return specs.sort((a, b) => a.priority - b.priority);
}

/** Shared gateway factory so the dashboard, MCP server and CLIs use one chain. */
export async function createGateway(repo?: Repo | null): Promise<AiGateway> {
  return new AiGateway({
    providers: await resolveProvidersWithStored(repo),
    repo: repo ?? null,
    offline: isOfflineTest(),
  });
}
