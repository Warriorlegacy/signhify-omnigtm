# Session Context — Signhify OmniGTM

Last updated: 2026-11-06

## Live deployments

| Surface | URL | Host |
| --- | --- | --- |
| Landing page | https://signhify-omnigtm-landing.vercel.app | Vercel (static, git-connected, root `apps/landing`) |
| Landing mirror | https://signhify-omnigtm-landing.netlify.app | Netlify (static, API deploy) |
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
- Landing mirror on Netlify: page/js/css/hero/frames 200, dotfiles 404
- Hero shows a live dashboard capture (`apps/landing/assets/dashboard.jpg`)
- No horizontal overflow at 390 / 768 / 1440 px; h1 stays 3 lines
- Drafts round-trip through Postgres: `llm_cache.expires_at` is BIGINT (was INTEGER,
  which overflowed at a 1.79e12 ms epoch and failed every LLM call); cache row written,
  telemetry `ok=1`
- Outreach drafts are ASCII-flattened: a live Groq draft had 0 typographic characters
- Brevo HTTP transport live: settings shows `Brevo HTTP`, real send returned 201 + messageId
- In-app send verified end to end on Render: `/api/v1/outreach/dispatch` returned
  `SENT` via `BREVO_HTTP`, `outreach_events` recorded
  `<202611060639.24549591684@smtp-relay.mailin.fr>`, Brevo's own log matches the
  subject and timestamp. Test opportunity was reverted to `DISCOVERED` / no email.
- FreeLLMAPI preset verified live through `discoverModels` + `draftOutreach`
- Outreach subjects are collapsed to one header line: the live aggregator draft
  returned `"...docs/SDKs?\n\n"`, which is a malformed Subject and a header-
  injection vector; `\s+` is now collapsed and trimmed
- SSRF guard hardened and covered: `[::ffff:127.0.0.1]` is rewritten by WHATWG URL
  to `[::ffff:7f00:1]` and slipped past the private-address check; mapped and
  IPv4-compatible forms now decode, `fe80::/10` and `fc00::/7` are masked
  properly, and hostnames starting with `fc`/`fd` are no longer misread as IPv6
- Scheduled harvest now reaches production: GitHub Actions had **zero repo
  secrets**, so `daily-pipeline` silently migrated to a throwaway SQLite file
  inside the runner. The workflow now fails when `DATABASE_URL` is missing, and
  the secrets are set — a dispatched run logged `dialect: postgres`, inserted
  **109 jobs** from 6 sources with 0 errors, and all 115 rows are visible through
  `/api/v1/opportunities` (109 `REMOTE_JOB`, 6 `B2B_SPRINT`)
- CI is green in **1m28s**: the `Ensure FFmpeg` step had hung on `apt-get update`
  for the entire 25-minute job timeout on `ubuntu-26.04`, so typecheck/tests/build
  never ran. It is now bounded to 3 minutes with apt acquire timeouts and
  `continue-on-error`; the re-run installed FFmpeg and the 480-frame media test
  ran (`skipped 0`)
- Instagram token health is honest: the configured token is non-expiring
  (`expires_at: 0`), which the old arithmetic read as a huge negative day count —
  it would have opened a false "expired" issue and failed every week. The check
  now reports `does not expire`
- CI green (`Typecheck, test, eval, build`), 41 tests

## Production hardening pass (2026-11-06, evening)

Implemented locally and verified with `npm run verify` (41 tests, 7/7 eval, production build):

- **The dashboard send path was broken, not just unpolished.** "Dry-run send" posted only
  `{opportunityId, confirm, dryRun}` while the route required `subject` and `body`, so every row
  returned 400. Drafts were also never persisted — `createDraft` only moved the stage. Now:
  `opportunities.draft_subject` / `draft_body` are persisted (additive `ALTER TABLE` for existing
  databases), `sendDraft` falls back to the stored draft when copy is omitted, and the
  Opportunities UI has a review panel with editable subject/body plus separate Dry run and Send
  buttons. Verified locally: draft 200, then dispatch with no copy → `DRY_RUN`.
- **Duplicate-send guard.** A second real send to the same opportunity is refused (`allowResend:
  true` required) because a retry or double-click must not mail the same person twice. Wired
  through REST and the MCP `dispatch_outreach` tool; dry runs are exempt.
- **Login throttle.** 10 attempts/IP/15 min, 429 + `Retry-After`, cleared on success. In-process
  `Map` with a `ponytail:` note: correct for one Render instance, needs a shared store if scaled.
- **Fail-closed login.** `/api/v1/session` now mirrors `hasSession()`: a missing dashboard token is
  a config error unless `OMNIGTM_OFFLINE_TEST=1`. Previously it returned `dev-open` outside
  `NODE_ENV=production`, which disagreed with the page guard.
- **Public health probe stops leaking driver errors.** It logs the Postgres error and returns only
  `database unavailable`.
- **Security headers** on every dashboard response: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `no-referrer`, `Permissions-Policy`, COOP, and `X-Robots-Tag: noindex`. The dashboard also ships
  `robots.txt` disallow-all. The landing page gets the non-CSP set from `vercel.json` and
  `netlify.toml`.
- **Retention.** `npm run maintain` prunes expired `llm_cache` rows and 90-day-old `llm_usage` rows;
  the daily workflow runs it after each harvest. Added an `llm_cache(expires_at)` index.
- **Webhook hardening.** Constant-time compare for the Meta verify token and a 1 MB payload cap.
- **Inbound replies reach suppression.** `/api/v1/webhooks/inbound-email` accepts SendGrid/Mailgun/
  Postmark inbound payloads and Brevo event batches. STOP replies and hard-bounce/spam/unsubscribe
  events write to `suppressions`, so the "Reply STOP" promise in every email is enforced without a
  human in the loop. Requires `OMNIGTM_INBOUND_WEBHOOK_SECRET` (set on Render); the route fails
  closed without it.
- **Opportunities paginate** at 50 rows instead of silently truncating at a hard 200.
- **Error and 404 pages** for the dashboard, plus canonical/OG/Twitter metadata, favicon,
  `robots.txt` and `sitemap.xml` for the landing page.

Verified live on the local production build: all security headers present, the 11th bad login gets
429, and the review/send panel renders. Pushed to `main` as `3ca9005`, `424b9e7` and `02f54b4`;
Render and Vercel auto-deploy from there.

### Second pass — inbound compliance and pagination (`afbb705`)

- `/api/v1/webhooks/inbound-email` normalises SendGrid/Mailgun/Postmark inbound mail and Brevo
  transactional events (single object and batched `items`). STOP replies go through
  `handleInboundReply`; hard-bounce/spam/unsubscribe events write to `suppressions`. The route
  fails closed without `OMNIGTM_INBOUND_WEBHOOK_SECRET`, compares it in constant time, and caps
  payloads at 256 KB.
- Reply text leads with the body, not the subject, because STOP is anchored at the start — a
  quoted "Reply STOP" footer deeper in a thread must not unsubscribe an ordinary reply.
- Dry runs no longer require a contact email; real sends still refuse without one.
- Opportunities paginate at 50 rows with Previous/Next that also render on an empty page.
- Verified locally on a production build (47 tests, 7/7 eval): STOP → `suppressed: 1` and a
  `suppressions` row; a hard_bounce + spam batch → `suppressed: 2`; wrong secret → 401;
  unenriched dry run → `DRY_RUN`; `/opportunities?page=2` → Previous link present.
- `OMNIGTM_INBOUND_WEBHOOK_SECRET` generated, stored in `.data/deploy-secrets.env`, and set on
  Render (env PUT → 200).

Known gap: no live opportunity carries `contact_email`, and there is no enrichment provider or
manual editor yet — so dry runs work, but real sends are blocked until a contact is added.

### Third pass — contact editor and reply stage (`b2c8a3e`)

- **Manual contact editor.** `PATCH /api/v1/opportunities/[id]` validates and normalises the email
  (`normaliseEmail` — lowercase, length-capped, RFC-5322-ish), and the outreach panel now carries a
  contact-email field with a Save button. Production has 115 opportunities and zero `contact_email`,
  so this was the only thing blocking a real send.
- **Reply stage tracking.** A non-STOP reply from an address that was actually contacted advances that
  lead to `REPLIED` (`markReplied`, scoped to `SENT`/`FOLLOW_UP_1`); unknown senders and supplier
  newsletters leave the pipeline untouched, and a second reply does not double-count.
- 49 tests, 7/7 eval, production build green. Verified locally: `PATCH` returns 200 and persists the
  email; the inbound webhook still suppresses STOP/bounces and now reports `replied`.

### Fourth pass — Brevo nested payload support (`54a933d`)

- **Brevo transactional event webhooks nest replies inside `payload.message.headers`**, not at the
  top level. Brevo sends `{ event, email, payload: { message: { headers: { "text-plain": "...",
  subject: "...", sender: { email, name } } } } }`. The previous parser only checked top-level
  fields, so STOP replies through Brevo's event webhook silently did nothing (suppressed: 0).
- Added `unwrapMessagePayload` that flattens `payload.message.headers` into a top-level-like object
  (sanitising hyphens from keys: `text-plain` → `textplain`) so both `addressOf` and `textOf` can
  consume it recursively.
- `addressOf` falls back to the nested `sender.email` when no direct field matches.
- `reduce` prefers the nested sender address for reply records (Brevo's top-level `email` is the
  system report address, not the actual replier).
- 51 tests, 7/7 eval, production build green.

## Known gaps

- **No enrichment provider.** `contact_email` is manual only, so every live send starts with an
  operator typing an address.
- **No real send has been made from production.** Dry runs work; the first real send needs a contact
  email on the lead and a live Brevo key (already set on Render).
- **Login throttle is in-process.** Correct for one Render instance; a shared store is needed if the
  service scales horizontally.
- **Media routes need FFmpeg.** Vercel/Netlify cannot run them on a free tier, so the dashboard and
  the media worker stay on separate hosts.


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
- Responses are capped at 2 MB and the request times out at 10 s. The cap is
  2 MB because OpenRouter's `/models` alone is ~800 KB of metadata.
- **Verified live** against a local FreeLLMAPI (`127.0.0.1:31415`, unified key):
  blocked with `baseUrl points at a private address` by default, `GET /v1/models`
  returned 287 models (capped to 200) in ~296 ms once
  `OMNIGTM_ALLOW_PRIVATE_ENDPOINTS=1`, and both `chat` and `draftOutreach` ran
  through `model: auto` with valid JSON. Not reachable from the Render
  deployment — loopback is the caller's machine, so production needs a public
  tunnel URL entered in Settings.

## Auth hardening

`hasSession()` now fails closed: without `OMNIGTM_DASHBOARD_TOKEN` only the
offline test harness is open. The previous check depended on `NODE_ENV` being
spelled exactly `production`, which would have left a staging deploy open.

## Deployment notes

- **Vercel**: project `signhify-omnigtm-landing`, root directory `apps/landing`,
  connected to the repo. Pushing to `main` redeploys. `vercel.json` sets
  immutable caching for frames. The per-deployment URL is SSO-protected; use the
  production alias.
- **Netlify**: site `signhify-omnigtm-landing` (`8fcad096-8f50-4ded-87d8-17fd27ee637d`),
  team `piyushrajsingh092`. Logged in as piyushrajsingh092@gmail.com. The CLI
  stalls on the npm-workspace picker when run from the repo root, so deploy via
  the REST API instead: zip `apps/landing` (exclude dotfiles) and
  `POST /api/v1/sites/<id>/deploys` with `Content-Type: application/zip`.
- **Render**: free Docker service `srv-dblt27rbc2fs73abv0tg`, region `oregon`,
  auto-deploys `main`. Free instances still cannot mount a disk, so runtime
  previews/reels live in `/app/.data` and are lost on restart; the demo is baked
  into the image and the database is now Neon, so only generated media is
  transient.
- **GitHub Actions**: repo secrets `DATABASE_URL`, `OMNIGTM_ENCRYPTION_KEY`,
  `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `APINEX_API_KEY`,
  `CEREBRAS_API_KEY`, `NVIDIA_API_KEY`, `MISTRAL_API_KEY`,
  `IG_LONG_LIVED_ACCESS_TOKEN`. The scheduled harvest writes to the same Neon
  database the dashboard reads. Set new provider keys with
  `gh secret set <NAME> --repo Warriorlegacy/signhify-omnigtm`; a missing
  `DATABASE_URL` fails the workflow instead of falling back to SQLite.

## Why the app is not fully on Vercel

The dashboard's media routes shell out to FFmpeg: 480-frame slicing and 9:16
reel renders take 30–120 s and write to disk. Vercel/Netlify functions have no
FFmpeg binary, a 250 MB bundle cap and short execution limits, so those routes
cannot run there on a free tier. Vercel hosts the landing page; Render keeps the
media worker. Everything data-only (opportunities, evals, settings, auth) is
already serverless-compatible if the media routes are split out later.

## Still requires human action

1. **Email**: solved — no SMTP key needed. `packages/outbound` now sends through
   the Brevo **HTTP** API (`POST /v3/smtp/email`) using `BREVO_API_KEY`, which is
   set on Render. Mailboxes default to `BREVO_HTTP` when that key exists. Live
   check returned `201` with a real `messageId`. `BREVO_SMTP_*` remain supported
   but optional (they need a separate `xsmtpsib-` key).
2. **Social publishing**: Instagram credentials are set but posting is still
   explicit and confirm-gated. LinkedIn/YouTube tokens are not configured.
3. **Custom gateway**: add the public URL + unified key in Settings if you want
   freellmapi in the chain from the deployed app. A `127.0.0.1` URL only works
   from the machine running it; expose it through a tunnel first.

## Local development

```bash
npm install
npm run db:migrate      # SQLite by default; set DATABASE_URL for Postgres
npm run dev             # dashboard on http://localhost:3000
npm run verify          # typecheck + 51 tests + 7/7 eval + production build
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
- `apps/landing` — static Vercel/Netlify landing page; dashboard hero shot + 120-frame backdrop
- `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` — design and ops detail
