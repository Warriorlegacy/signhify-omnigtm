import { optionalSecret } from '@omnigtm/core';
import { listEndpoints } from '@omnigtm/ai-gateway';
import { loadMailboxes } from '@omnigtm/outbound';
import { getGateway, getRepo } from '@/lib/api';
import { EndpointManager } from '@/components/EndpointManager';
import { ActionButton } from '@/components/ActionButton';

export const dynamic = 'force-dynamic';

const CHECKS: { name: string; label: string; required?: boolean }[] = [
  { name: 'GROQ_API_KEY', label: 'Groq (free LPU)', required: true },
  { name: 'OPENROUTER_API_KEY', label: 'OpenRouter :free' },
  { name: 'GEMINI_API_KEY', label: 'Google AI Studio' },
  { name: 'CEREBRAS_API_KEY', label: 'Cerebras' },
  { name: 'NVIDIA_API_KEY', label: 'NVIDIA NIM' },
  { name: 'MISTRAL_API_KEY', label: 'Mistral' },
  { name: 'OLLAMA_API_KEY', label: 'Ollama (local)' },
  { name: 'FREELMAPI_BASE_URL', label: 'FreeLLMAPI aggregator' },
  { name: 'DATABASE_URL', label: 'Postgres (Neon / Supabase)' },
  { name: 'OMNIGTM_ENCRYPTION_KEY', label: 'AES-256-GCM envelope key', required: true },
  { name: 'OMNIGTM_DASHBOARD_TOKEN', label: 'Dashboard token', required: true },
  { name: 'BREVO_API_KEY', label: 'Brevo API key (HTTP sends)' },
  { name: 'BREVO_SMTP_KEY', label: 'Brevo SMTP relay (optional)' },
  { name: 'IG_LONG_LIVED_ACCESS_TOKEN', label: 'Instagram publishing' },
  { name: 'LINKEDIN_ACCESS_TOKEN', label: 'LinkedIn publishing' },
];

export default async function SettingsPage() {
  const repo = await getRepo();
  const gateway = await getGateway(repo);
  const endpoints = await listEndpoints(repo);
  const mailboxes = loadMailboxes();
  const providers = gateway.health();

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Settings</h1>
          <p>
            Secrets live in the platform dashboard, never in git. Anything added here is sealed with AES-256-GCM before
            it touches the database, and the API only ever reports whether a token exists.
          </p>
        </div>
        <ActionButton label="Sign out" path="/api/v1/session" method="DELETE" variant="ghost" onDone="/login" />
      </header>

      <section className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <div>
            <h2>Custom OpenAI-compatible endpoints</h2>
            <div className="card-sub">FreeLLMAPI, LiteLLM, vLLM, Ollama proxies - anything that speaks /chat/completions</div>
          </div>
        </div>
        <EndpointManager endpoints={endpoints} />
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Environment checklist</h2>
              <div className="card-sub">Presence only - values are never rendered</div>
            </div>
          </div>
          {CHECKS.map((check) => {
            const present = Boolean(optionalSecret(check.name));
            return (
              <div className="eval-row" key={check.name}>
                <span className="eval-dot" data-pass={present} />
                <div style={{ flex: 1 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{check.label}</div>
                  <div className="mono dim">{check.name}{check.required ? ' · required' : ''}</div>
                </div>
                <span className="badge" data-tone={present ? 'green' : check.required ? 'rose' : undefined}>{present ? 'set' : 'missing'}</span>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Resolved provider chain</h2>
                <div className="card-sub">Sorted by priority; circuit breakers included</div>
              </div>
            </div>
            {providers.map((provider) => (
              <div className="eval-row" key={provider.id}>
                <span className="eval-dot" data-pass={provider.configured && !provider.open} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{provider.label}</div>
                  <div className="mono dim">{provider.id}</div>
                </div>
                <span className="badge" data-tone={provider.open ? 'rose' : provider.configured ? 'green' : undefined}>
                  {provider.open ? 'open' : provider.configured ? 'ready' : 'no key'}
                </span>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Mailboxes</h2>
            <div className="card-sub" style={{ marginBottom: 12 }}>Daily caps are enforced per mailbox in UTC</div>
            {mailboxes.length === 0 ? (
              <div className="small dim">
                No relay configured. Drafts still work and sends stay in dry-run mode, which is the safe default.
              </div>
            ) : (
              mailboxes.map((mailbox) => (
                <div className="eval-row" key={mailbox.email}>
                  <div style={{ flex: 1 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{mailbox.email}</div>
                    <div className="cell-sub">{mailbox.provider} · cap {mailbox.dailyCap}/day</div>
                  </div>
                  <span className="badge" data-tone="cyan">{mailbox.provider === 'GMAIL_OAUTH' ? 'Gmail OAuth' : mailbox.provider === 'BREVO_HTTP' ? 'Brevo HTTP' : 'SMTP'}</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>MCP server</h2>
            <div className="card-sub" style={{ marginBottom: 10 }}>Five tools over stdio, one of them gated by confirmation</div>
            <pre className="pre">{`{
  "mcpServers": {
    "omnigtm": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"]
    }
  }
}`}</pre>
          </div>
        </div>
      </section>
    </>
  );
}
