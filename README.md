# Signhify OmniGTM

An open-source, **$0-budget** autonomous GTM and media operating system: it polls public ATS boards, scores the
shortlist with a free-tier LLM failover chain, writes voice-card-compliant outreach, turns any clip into a
**60 FPS scroll-reactive "3D" preview**, renders vertical reels with FFmpeg, and exposes the whole thing to agents
through an MCP server.

No Clay. No Instantly. No Creatomate. No WebGL bundle.

---

## What actually works today

| Capability | Implementation | Verified |
| --- | --- | --- |
| ATS harvesting | Greenhouse, Ashby, Workable, Remotive, Arbeitnow, HN Algolia | 40 real roles inserted, 0 errors |
| LLM routing | Groq → OpenRouter → Gemini → Cerebras → NIM → Mistral → Ollama → custom | Live smoke: `groq_lpu_free / openai/gpt-oss-120b / 712ms` |
| Eval gate | 7 deterministic dimensions, no network, no credentials | **7/7 pass** |
| 60 FPS preview | FFmpeg → 480 WebP frames → canvas scroll scrub | 480 frames, 2.34 MB bundle |
| Reels | Script → virality gate → FFmpeg 1080×1920@60 or 720×1280@30 | Rendered and visually checked |
| Outreach | Voice card + deterministic compliance repair + STOP handling | Enforced in code, not just prompts |
| MCP | 5 tools over stdio, one gated by explicit confirmation | Unit-tested |

Honest gaps: Lever's public API 404s on every tested slug (kept configurable), Cerebras free credits can return
HTTP 402, and Gemini's free quota can 429 — the chain is designed for exactly that.

---

## Architecture

```
GitHub Actions (free)                Render / Docker (free tier)
  ├─ daily-pipeline.yml  ───────────▶  Next.js dashboard  ──▶  Postgres (Neon/Supabase)
  ├─ ci.yml (typecheck/test/eval)      │   ├─ API routes          or SQLite file
  └─ token-refresh.yml                 │   ├─ /preview/[slug]
                                       │   └─ MCP server (stdio)
GitHub Pages (free)                    │
  └─ apps/viewer-3d  ◀── frames ───────┘
```

| Package | Responsibility |
| --- | --- |
| `packages/core` | env/secrets, redaction, AES-256-GCM, dual-driver DB, ids, seed |
| `packages/ai-gateway` | provider registry, circuit-breaker router, task prompts, eval gate |
| `packages/outbound` | ATS sources, scoring, harvest, mailbox relay, drafts, suppression |
| `packages/media` | FFmpeg wrapper, frame slicer, reel/poster renderer, publishers |
| `packages/mcp-server` | MCP tools + the shared job orchestration used by the dashboard |
| `apps/web-dashboard` | Next.js 15 operator UI + API |
| `apps/viewer-3d` | static, build-free scroll viewer for GitHub Pages |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for data flow and design decisions.

---

## Quickstart

Requirements: **Node 22+** and **FFmpeg** on `PATH`.

```bash
npm install
cp .env.example .env.local        # fill OMNIGTM_ENCRYPTION_KEY + OMNIGTM_DASHBOARD_TOKEN
npm run db:migrate                # creates schema, seeds a demo workspace
npm run dev                       # http://localhost:3000/login
```

Generate the two required secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # encryption key
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))" # dashboard token
```

Without `DATABASE_URL` the app runs on a local SQLite file (`node:sqlite`), so a fresh clone boots with **zero
external services**.

### Useful commands

```bash
npm run verify        # typecheck + tests + eval gate + production build
npm test              # 47 tests across core, gateway, outbound, media, MCP
npm run eval          # the 7-dimension gate
npm run smoke:llm     # opt-in live call against the real provider chain
npm run harvest       # poll ATS boards, dedupe, LLM-score the shortlist
npm run maintain      # prune expired LLM cache and 90-day-old usage rows
npm run preview       # build the synthetic 60 FPS demo preview
npm run reel          # render a demo reel
npm run mcp           # start the MCP server on stdio
```

---

## Security model

- **No plaintext secret fallbacks.** `requireSecret()` throws `ConfigurationError` instead of defaulting.
- **Every outbound string is scrubbed** for connection strings, API keys, JWTs and phone numbers before it is
  persisted, logged or shown.
- **Untrusted scraped text is enveloped** (`<untrusted_source_data>`) and instruction-override patterns are stripped
  before it reaches a model.
- **BYOK tokens are sealed** with AES-256-GCM in the database; the API only ever reports `hasKey: true`.
- **Mutations require a session.** `/api/v1/health` and `/preview/*` are public; everything else needs the dashboard
  token. Sending email additionally requires `confirm: true`, and defaults to dry-run.
- **Login is rate-limited** to 10 attempts per IP per 15 minutes, and a missing dashboard token fails closed even
  outside `NODE_ENV=production`.
- **A real send is single-shot.** A second real email to the same opportunity is refused unless `allowResend: true`
  is explicit, so double-clicks and agent retries cannot duplicate mail. Drafts are persisted verbatim for review.
- **The public probes stay quiet.** The health route logs driver errors but returns only `database unavailable`;
  security headers (`nosniff`, `DENY`, HSTS, CSP, no-referrer) apply to every dashboard response.
- **Retention is scheduled.** `npm run maintain` prunes expired LLM cache rows and 90-day-old usage rows; it runs
  after every scheduled harvest so the free 0.5 GB Postgres tier does not fill with telemetry.
- **Replies and bounces suppress automatically.** Point a SendGrid/Mailgun/Postmark inbound stream or a Brevo
  event webhook at `/api/v1/webhooks/inbound-email` with `OMNIGTM_INBOUND_WEBHOOK_SECRET`; STOP replies and
  hard-bounce/spam events are written to `suppressions`, and dispatch refuses suppressed addresses.
- **Webhooks are signature-verified** and idempotent on the external comment id.
- **No mutable state in git.** `.data/`, previews and databases are ignored.

---

## MCP server

```json
{
  "mcpServers": {
    "omnigtm": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"],
      "env": { "OMNIGTM_PUBLIC_BASE_URL": "http://localhost:3000" }
    }
  }
}
```

| Tool | Effect | Gate |
| --- | --- | --- |
| `search_opportunities` | read pipeline | read-only |
| `build_3d_preview` | slice MP4 → WebP frames | idempotent |
| `render_social_reel` | script + FFmpeg render | never publishes implicitly |
| `draft_outreach` | generate a draft | does not send |
| `dispatch_outreach` | **send email** | requires `confirm: true` |

---

## API surface

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/v1/health` | GET | public | liveness + dialect |
| `/api/v1/session` | POST/DELETE | token | login/logout |
| `/api/v1/opportunities` | GET | session | filter pipeline |
| `/api/v1/opportunities/harvest` | POST | session | run a harvest |
| `/api/v1/outreach/draft` | POST | session | generate a draft |
| `/api/v1/outreach/dispatch` | POST | session + confirm | send (dry-run by default) |
| `/api/v1/media/render-3d-preview` | POST | session | build a preview |
| `/api/v1/media/manifest/[slug]` | GET | public | preview manifest |
| `/api/v1/media/frames/[slug]/[frame]` | GET | public | WebP frames |
| `/api/v1/media/reels` | GET/POST | session | list/render reels |
| `/api/v1/media/reels/[id]/file` | GET | session | MP4 download |
| `/api/v1/evals` | GET/POST | session | run the gate |
| `/api/v1/providers` | GET | session | chain health + usage |
| `/api/v1/settings/endpoints` | GET/POST/DELETE | session | custom LLM endpoints |
| `/api/v1/webhooks/instagram` | GET/POST | signature | comment-to-DM |

---

## Custom LLM endpoints (FreeLLMAPI and friends)

Any OpenAI-compatible gateway works. Two ways:

1. **Env** — `FREELMAPI_BASE_URL`, `FREELMAPI_API_KEY`, `FREELMAPI_MODEL=auto`, `FREELMAPI_PRIORITY=5`.
2. **Settings UI** — add label, base URL, model and bearer token. The token is sealed before it is stored and is
   merged into the live failover chain on the next request.

---

## Deployment

- **Render (Docker)** — `render.yaml` provisions a free web service with a 1 GB disk, generated secrets and a health
  check. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Docker Compose** — `docker compose up -d --build` (app + Postgres).
- **GitHub Pages** — `pages.yml` publishes `apps/viewer-3d`, pointed at the live API through the
  `OMNIGTM_PUBLIC_BASE_URL` repository variable.

---

## License

MIT. The curated B2B seeds in `packages/outbound/src/b2b.ts` are the studio's own research, not scraped data.
