# Session Context — Signhify OmniGTM

Last updated: 2026-11-05

## Live deployments

| Surface | URL | Notes |
| --- | --- | --- |
| Dashboard + API | https://signhify-omnigtm.onrender.com | Render free Docker service `srv-dblt27rbc2fs73abv0tg`, region `oregon`, auto-deploys `main` |
| Health | https://signhify-omnigtm.onrender.com/api/v1/health | Returns `{ ok, dialect, uptimeMs }` |
| Demo preview | https://signhify-omnigtm.onrender.com/preview/demo | 480 WebP frames @ 60 FPS, public |
| Static 3D viewer | https://warriorlegacy.github.io/signhify-omnigtm/?slug=demo | GitHub Pages from `apps/viewer-3d`, API base from repo variable `OMNIGTM_PUBLIC_BASE_URL` |
| Source | https://github.com/Warriorlegacy/signhify-omnigtm | Public, branch `main` |

## Production credentials

Generated for this deployment and stored **locally, gitignored** in `.data/deploy-secrets.env`:

- `OMNIGTM_ENCRYPTION_KEY` — AES-256-GCM key for sealed custom endpoints
- `OMNIGTM_DASHBOARD_TOKEN` — dashboard login token
- `RENDER_SERVICE_ID`, `RENDER_SERVICE_URL`

Log in at `/login` with `OMNIGTM_DASHBOARD_TOKEN`. The cookie is `omnigtm_session`
= `sha256("omnigtm-session:" + token)`, HttpOnly/Secure/SameSite=Lax, 12 h.

To rotate: generate new values, update the Render env vars, redeploy, and replace
the local file. Rotating the encryption key invalidates previously sealed endpoint
secrets (they must be re-entered in Settings).

## Verified in production

- Health 200, SQLite dialect, auth enforced (unauthenticated API returns 401)
- Login sets the session cookie; dashboard pages return 200
- Eval gate: **7/7**, faithfulness 1.0, p95 4 ms
- 60 FPS preview build: 480 frames, ~2.4 MB, manifest + `frame_0001..0480.webp` serve 200
- Live reel render through Groq (`groq_lpu_free`): virality 88, gate passed, ~170 KB MP4
- Sealed custom endpoint: stored, never echoed back, appears in the live provider chain
- GitHub Pages viewer loads; manifest is served with `Access-Control-Allow-Origin: *`
- CI (`Typecheck, test, eval, build`) green on `main`

Two bugs were found only after deploying, both fixed:
1. The Pages viewer fetched the manifest cross-origin with no CORS header.
2. `offline` mode skipped the key check but still called real providers, so tests
   without keys made live HTTP calls and failed in CI. Offline now returns the
   deterministic mock before any network call.

## Known constraints (free tier)

- Render free instances **cannot mount a persistent disk**. SQLite lives at
  `/app/.data/omnigtm.db`, which survives requests but resets on redeploy/restart
  and when the instance idles out. The synthetic `demo` preview is generated
  during `docker build`, so the public viewer always works; previews and reels
  built at runtime are regenerable, but harvested opportunities are not.
- **Upgrade path:** create a free Neon/Supabase Postgres, set `DATABASE_URL` on
  Render (the `pg` driver activates automatically), and re-run
  `npm run migrate`. No code change needed.
- Free instances sleep after ~15 min idle; the first request afterwards is slow.
- Provider keys set on Render: `GROQ_API_KEY`, `OPENROUTER_API_KEY`. Gemini
  returns 429, Cerebras 402, NIM times out on the free tier — the router fails
  over and records telemetry instead of erroring.

## Still requires human action

1. **Social publishing tokens** — X/LinkedIn/Instagram credentials are not set.
   Reels render and download, but nothing is auto-posted.
2. **Mailbox relay** — `BREVO_API_KEY` / Gmail app password not set, so
   `dispatch_outreach` stays dry-run.
3. **Custom LLM endpoint** — add a freellmapi-compatible base URL + key in
   Settings; values are sealed with AES-256-GCM and merged ahead of env providers.
4. Optional: point `DATABASE_URL` at Neon for durable state (see above).

## Local development

```bash
npm install
npm run migrate      # create .data/omnigtm.db
npm run dev          # dashboard on http://localhost:3000
npm run verify       # typecheck + 26 tests + 7/7 eval + production build
npm run mcp          # stdio MCP server
npm run harvest      # ATS harvest (OMNIGTM_LLM=0 for heuristic-only)
```

Set `OMNIGTM_DASHBOARD_TOKEN` and `OMNIGTM_ENCRYPTION_KEY` in `.env` for a
production-like local run. `.env.example` documents the full matrix.

## Repo map

- `packages/core` — env/secrets, redaction, crypto, dual-driver DB + `Repo`, paths
- `packages/ai-gateway` — provider registry, circuit breaker, sealed endpoints, evals
- `packages/outbound` — 7 ATS sources, scoring, mailbox relay, suppression
- `packages/media` — FFmpeg reels, 60 FPS WebP slicer, Kokoro TTS, publishers
- `packages/mcp-server` — 5 MCP tools (`dispatch_outreach` is confirm-gated)
- `apps/web-dashboard` — Next.js 15 App Router UI + 14 API routes
- `apps/viewer-3d` — dependency-free scroll-scrub viewer for GitHub Pages
- `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` — design and ops detail
