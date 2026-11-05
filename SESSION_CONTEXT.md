# Session Context — Signhify OmniGTM

Last updated: 2026-11-06

## Live deployments

| Surface | URL | Host |
| --- | --- | --- |
| Landing page | https://signhify-omnigtm-landing.vercel.app | Vercel (static, git-connected, root `apps/landing`) |
| Dashboard + API | https://signhify-omnigtm.onrender.com | Render free Docker, FFmpeg included |
| Health | https://signhify-omnigtm.onrender.com/api/v1/health | Reports `dialect: postgres` |
| Demo preview | https://signhify-omnigtm.onrender.com/preview/demo | 480 WebP frames @ 60 FPS |
| Static 3D viewer | https://warriorlegacy.github.io/signhify-omnigtm/?slug=demo | GitHub Pages |
| Source | https://github.com/Warriorlegacy/signhify-omnigtm | Public, `main` |

Database: **Neon Postgres**, dedicated database `omnigtm` on the existing Neon
project. Durable across restarts and redeploys — this replaced the ephemeral
SQLite file on Render's free tier.

## Production credentials

Local, gitignored, never committed:

- `.data/deploy-secrets.env` — Render service id/url, `OMNIGTM_ENCRYPTION_KEY`,
  `OMNIGTM_DASHBOARD_TOKEN`, `DATABASE_URL`
- `.data/harvested-credentials.env` — everything extracted from `D:\Autogram`,
  `D:\AutoGTM`, `D:\SignhifyCareer` and `D:\freellmapi`

Harvested and now set on Render: `DATABASE_URL`, `GEMINI_API_KEY`,
`CEREBRAS_API_KEY`, `NVIDIA_API_KEY`, `MISTRAL_API_KEY`, `COHERE_API_KEY`,
`HUGGINGFACE_API_KEY`, `APINEX_API_KEY` (+ `APINEX_BASE_URL`, `APINEX_MODEL`),
`BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `IG_BUSINESS_ACCOUNT_ID`,
`IG_LONG_LIVED_ACCESS_TOKEN` (Meta Graph long-lived), plus the pre-existing
`GROQ_API_KEY` and `OPENROUTER_API_KEY`.

Log in at `/login` with `OMNIGTM_DASHBOARD_TOKEN`. Cookie is `omnigtm_session`
= `sha256("omnigtm-session:" + token)`, HttpOnly/Secure/SameSite=Lax, 12 h.

## Verified in production

- Health 200 with `dialect: postgres`; data survives a service restart
- Auth enforced: unauthenticated API → 401; login cookie → pages 200
- Eval gate **7/7**, faithfulness 1.0
- 60 FPS preview: 480 frames, manifest + frames 200, demo baked into the image
- Live Groq reel render: virality 88, gate passed, MP4 download 200
- Custom endpoint: sealed, never echoed, appears in the provider chain, deletable
- Endpoint probe accepts an OpenRouter-sized (795 KB) model list; capped at 2 MB
- Landing page on Vercel: HTML/CSS/JS/frames 200, immutable frame caching
- CI green (`Typecheck, test, eval, build`), 31 tests

## Provider chain

Ordered, env-overridable, fastest free tier first:

| Priority | Provider | Model | Note |
| --- | --- | --- | --- |
| 10 | Groq | `openai/gpt-oss-120b` | 30 RPM / 1,000 RPD |
| 15 | **APIinex** | `free/gpt-6-luna` | 20M free tokens/day, `free/*` pool |
| 20 | OpenRouter | `…:free` | 50 RPD at $0 |
| 30 | Google AI Studio | `gemini-2.5-flash` | 15 RPM |
| 40 | Cerebras | `gpt-oss-120b` | 5 RPM |
| 50 | NVIDIA NIM | `deepseek-v4.1-flash` | dev credits |
| 60 | Mistral | `mistral-small-latest` | experiment tier |
| 90 | Ollama | local | offline fallback |

APIinex (`https://api.apinex.bond/v1`) is OpenAI-compatible, serves 42 models
(21 under `free/`), and answered `free/gpt-6-luna` in 2.6 s with
`cost_tokens: 0`. Free model ids rotate — override `APINEX_MODEL`.

## Custom endpoints (freellmapi and friends)
Settings → Custom endpoints accepts any OpenAI-compatible gateway.

- **Test connection** calls `GET {baseUrl}/models` and lists up to 200 models,
  so a freellmapi unified key (`freellmapi-…`) can be proven before saving.
- A bare origin is normalized to `/v1`; explicit paths are preserved.
- Keys must go in the Bearer field. URLs containing userinfo or
  `?api_key=`/`?token=` are rejected, because the URL is echoed back by the list
  endpoint.
- The probe refuses loopback, link-local, RFC1918, `*.internal` and
  `*.nip.io` targets and does not follow redirects. To test a self-hosted
  FreeLLMAPI on `127.0.0.1:31415`, set `OMNIGTM_ALLOW_PRIVATE_ENDPOINTS=1`
  (intended for local/self-hosted runs, not the public deployment).
- Responses are capped at 512 KB and the request times out at 10 s.

## Auth hardening

`hasSession()` now fails closed: without `OMNIGTM_DASHBOARD_TOKEN` only the
offline test harness is open. The previous check depended on `NODE_ENV` being
spelled exactly `production`, which would have left a staging deploy open.

## Deployment notes

- **Vercel**: project `signhify-omnigtm-landing`, root directory `apps/landing`,
  connected to the repo. Pushing to `main` redeploys. `vercel.json` sets
  immutable caching for frames. The per-deployment URL is SSO-protected; use the
  production alias.
- **Netlify**: `apps/landing/netlify.toml` is ready, but there is no Netlify
  token on this machine, so it was not deployed. `npx netlify-cli deploy --prod`
  after `netlify login` publishes the same folder.
- **Render**: free Docker service `srv-dblt27rbc2fs73abv0tg`, region `oregon`,
  auto-deploys `main`. Free instances still cannot mount a disk, so runtime
  previews/reels live in `/app/.data` and are lost on restart; the demo is baked
  into the image and the database is now Neon, so only generated media is
  transient.

## Why the app is not fully on Vercel

The dashboard's media routes shell out to FFmpeg: 480-frame slicing and 9:16
reel renders take 30–120 s and write to disk. Vercel/Netlify functions have no
FFmpeg binary, a 250 MB bundle cap and short execution limits, so those routes
cannot run there on a free tier. Vercel hosts the landing page; Render keeps the
media worker. Everything data-only (opportunities, evals, settings, auth) is
already serverless-compatible if the media routes are split out later.

## Still requires human action

1. **Netlify**: `netlify login`, then deploy `apps/landing` for a second mirror.
2. **Email**: `BREVO_SMTP_KEY` is not set. The harvested `BREVO_API_KEY` is a
   transactional API key, not the SMTP relay key the app expects. Add the SMTP
   key (and `BREVO_SMTP_USER`) to enable real sends; outreach stays dry-run
   until then.
3. **Social publishing**: Instagram credentials are set but posting is still
   explicit and confirm-gated. LinkedIn/YouTube tokens are not configured.
4. **Custom gateway**: add the public URL + unified key in Settings if you want
   freellmapi in the chain from the deployed app.

## Local development

```bash
npm install
npm run db:migrate      # SQLite by default; set DATABASE_URL for Postgres
npm run dev             # dashboard on http://localhost:3000
npm run verify          # typecheck + 30 tests + 7/7 eval + production build
npm run mcp             # stdio MCP server
npm run harvest         # ATS harvest (OMNIGTM_LLM=0 for heuristic-only)
```

`OMNIGTM_DASHBOARD_TOKEN` is now required for local dashboard access unless
`OMNIGTM_OFFLINE_TEST=1` is set.

## Repo map

- `packages/core` — env/secrets, `ValidationError`, redaction, crypto, DB, paths
- `packages/ai-gateway` — provider chain, sealed endpoints, discovery, evals
- `packages/outbound` — 7 ATS sources, scoring, mailbox relay, suppression
- `packages/media` — FFmpeg reels, 60 FPS WebP slicer, TTS, publishers
- `packages/mcp-server` — 5 MCP tools (`dispatch_outreach` is confirm-gated)
- `apps/web-dashboard` — Next.js 15 UI + 15 API routes
- `apps/viewer-3d` — dependency-free scroll viewer for GitHub Pages
- `apps/landing` — static Vercel/Netlify landing page with a 120-frame hero
- `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` — design and ops detail
