'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Endpoint {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  priority?: number;
  hasKey: boolean;
}

export function EndpointManager({ endpoints }: { endpoints: Endpoint[] }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('auto');
  const [apiKey, setApiKey] = useState('');
  const [priority, setPriority] = useState('5');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [probe, setProbe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function usePreset() {
    setLabel('FreeLLMAPI');
    setBaseUrl('http://127.0.0.1:31415/v1');
    setModel('auto');
    setNotice('Self-hosted FreeLLMAPI preset. Use the unified key from its Keys page (starts with freellmapi-).');
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setProbe(null);
    try {
      const res = await fetch('/api/v1/settings/endpoints/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined }),
      });
      const json = (await res.json()) as { ok: boolean; models?: string[]; latencyMs?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setModels(json.models ?? []);
      setProbe(`${json.models?.length ?? 0} models reachable in ${json.latencyMs ?? 0} ms.`);
      if (!model || model === 'auto') {
        if (json.models?.[0]) setModel(json.models[0]);
      }
    } catch (err) {
      setModels([]);
      setError(err instanceof Error ? err.message : 'Could not reach that gateway');
    } finally {
      setTesting(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/settings/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, baseUrl, model, apiKey: apiKey || undefined, priority: Number(priority) }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`Added ${label}. The token is sealed with AES-256-GCM and never returned by the API.`);
      setLabel('');
      setBaseUrl('');
      setApiKey('');
      setModel('auto');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add endpoint');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this endpoint from the provider chain?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/settings/endpoints?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove endpoint');
    }
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <form onSubmit={add} className="grid" style={{ gap: 12 }}>
        <div className="row-between">
          <p className="dim" style={{ margin: 0 }}>
            Any OpenAI-compatible gateway works: FreeLLMAPI, LiteLLM, vLLM, LM Studio, Ollama.
          </p>
          <button className="btn btn-sm" type="button" onClick={usePreset}>Use FreeLLMAPI preset</button>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="label">Label</label>
            <input id="label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="FreeLLMAPI" required />
          </div>
          <div className="field" style={{ flex: '2 1 260px' }}>
            <label htmlFor="baseUrl">Base URL</label>
            <input id="baseUrl" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-gateway.example.com/v1" required />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="model">Model</label>
            <input id="model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="auto" list="discovered-models" required />
            <datalist id="discovered-models">
              {models.map((id) => <option key={id} value={id} />)}
            </datalist>
          </div>
          <div className="field" style={{ flex: '2 1 220px' }}>
            <label htmlFor="apiKey">Bearer token (optional)</label>
            <input id="apiKey" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="freellmapi-…" autoComplete="off" />
          </div>
          <div className="field" style={{ flex: '0 0 110px' }}>
            <label htmlFor="priority">Priority</label>
            <input id="priority" type="number" min={1} max={99} value={priority} onChange={(event) => setPriority(event.target.value)} />
          </div>
        </div>
        <div className="row-between">
          <button className="btn" type="button" onClick={testConnection} disabled={testing || !baseUrl}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add endpoint'}</button>
        </div>
      </form>

      {probe ? <div className="notice" data-tone="green">{probe}{models.length ? ' Pick one from the Model field suggestions.' : ''}</div> : null}

      {error ? <div className="notice" data-tone="rose">{error}</div> : null}
      {notice ? <div className="notice" data-tone="green">{notice}</div> : null}

      {endpoints.length === 0 ? (
        <div className="empty">No custom endpoints yet. Any OpenAI-compatible gateway works - including a self-hosted FreeLLMAPI.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Endpoint</th><th>Base URL</th><th>Model</th><th>Key</th><th></th></tr></thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td>
                    <div className="cell-title">{endpoint.label}</div>
                    <div className="mono dim">{endpoint.id} · priority {endpoint.priority ?? 5}</div>
                  </td>
                  <td className="mono">{endpoint.baseUrl}</td>
                  <td className="mono">{endpoint.model}</td>
                  <td><span className="badge" data-tone={endpoint.hasKey ? 'green' : undefined}>{endpoint.hasKey ? 'sealed' : 'none'}</span></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(endpoint.id)} type="button">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
