# Deployment

Everything below fits a **$0** budget: Render's free web tier, Neon/Supabase's free Postgres, GitHub Actions on a
public repo, and GitHub Pages.

## Option A — Render (recommended)

`render.yaml` is a Blueprint: Docker runtime, 1 GB disk mounted at `/data`, health check on `/api/v1/health`.

```bash
# 1. Push the repo
git remote add origin https://github.com/<owner>/signhify-omnigtm.git
git push -u origin main

# 2. Create the service from the blueprint (dashboard: New → Blueprint),
#    or with the API:
curl -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"web_service","name":"signhify-omnigtm","repo":"https://github.com/<owner>/signhify-omnigtm","branch":"main","autoDeploy":"yes","envVars":[{"key":"OMNIGTM_ENCRYPTION_KEY","generateValue":true},{"key":"OMNIGTM_DASHBOARD_TOKEN","generateValue":true}]}'
```

Required environment variables:

| Variable | Why |
| --- | --- |
| `OMNIGTM_ENCRYPTION_KEY` | AES-256-GCM envelope for stored BYOK tokens (32 bytes, hex or base64) |
| `OMNIGTM_DASHBOARD_TOKEN` | Dashboard login; mutations are refused without it in production |
| `OMNIGTM_PUBLIC_BASE_URL` | Absolute origin used in preview links inside emails |
| `OMNIGTM_INBOUND_WEBHOOK_SECRET` | Shared secret for `/api/v1/webhooks/inbound-email`; without it the endpoint refuses to run |
| `GROQ_API_KEY` | First provider in the failover chain |
| `DATABASE_URL` | Optional. Without it the service uses `/data/omnigtm.db` |

After the first deploy, read `OMNIGTM_DASHBOARD_TOKEN` from the Render dashboard, open `https://<service>/login`, and
paste it.

### Persistence

The free tier has an ephemeral filesystem **except** for the mounted disk. `OMNIGTM_DB_PATH=/data/omnigtm.db` and
`OMNIGTM_MEDIA_DIR=/data/previews` keep SQLite and rendered media across deploys. If you outgrow that, point
`DATABASE_URL` at Neon and treat the disk as a media cache only — a fresh instance can always re-render the demo
preview, and the manifest is stored in the database so `/preview/[slug]` still resolves.

### Inbound replies and bounces

Every outbound email says "Reply STOP", so point a provider's inbound stream at:

```
POST https://<service>/api/v1/webhooks/inbound-email?secret=<OMNIGTM_INBOUND_WEBHOOK_SECRET>
```

SendGrid Inbound Parse (`from`/`subject`/`text`), Mailgun routes (`sender`/`body-plain`), Postmark inbound
(`From`/`Subject`/`TextBody`) and Brevo transactional events (`event`/`email`, including batched `items`) are all
accepted. A STOP reply or a hard-bounce/spam/unsubscribe event writes to `suppressions`; dispatch then returns
`SUPPRESSED` instead of emailing that address again. The secret may also be sent as `x-omnigtm-secret`.

## Option B — Docker Compose

```bash
export OMNIGTM_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export OMNIGTM_DASHBOARD_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
docker compose up -d --build
```

Brings up Postgres 16 plus the app on `:3000`. The image installs FFmpeg and DejaVu fonts, which the reel renderer
needs.

## Option C — GitHub Pages viewer

`.github/workflows/pages.yml` publishes `apps/viewer-3d` with `config.js` pointing at the repository variable
`OMNIGTM_PUBLIC_BASE_URL`. Enable Pages → Source: GitHub Actions. The viewer then loads:

```
https://<owner>.github.io/signhify-omnigtm/?slug=demo
```

## CI and schedules

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | push / PR | typecheck → 47 tests → eval gate → production build |
| `daily-pipeline.yml` | every 6h | migrate, harvest, eval, upload artifact |
| `token-refresh.yml` | weekly | checks Instagram token expiry, opens an issue at < 7 days |
| `pages.yml` | viewer changes | publishes the static viewer |

Repository secrets for the daily pipeline: `DATABASE_URL`, `OMNIGTM_ENCRYPTION_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`.

## Secret rotation

1. Generate a new token/key.
2. Update it in the platform dashboard.
3. Redeploy (Render does this automatically on env change).
4. Re-run `npm run eval` and check `/api/v1/health`.

Rotating `OMNIGTM_ENCRYPTION_KEY` invalidates sealed custom endpoints — re-add them in Settings afterwards.
Rotating `OMNIGTM_DASHBOARD_TOKEN` invalidates existing sessions by design.

## Operational hygiene

- **Retention**: `npm run maintain` deletes expired `llm_cache` rows and `llm_usage` rows older than 90 days. The
  scheduled pipeline runs it after every harvest; run it manually after any backfill.
- **Health**: `/api/v1/health` is the only public probe. It returns `503` with `database unavailable` on failure and
  logs the driver error server-side, so a public response never leaks a host, user or SQL fragment.
- **Headers**: the dashboard sends HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer` and a restrictive
  `Permissions-Policy`; the landing page gets the same set (minus CSP) from `vercel.json` / `netlify.toml`.
- **Login throttle**: 10 attempts per IP per 15 minutes, in-process. That matches the single free Render instance;
  move the bucket to Postgres or Redis before scaling horizontally.
- **Backups**: Postgres is the durable store. Neon's free plan includes a restore window; test a restore before you
  rely on it, and remember that rendered reels/previews under `/app/.data` are intentionally regenerable.

## Known limits (honest list)

- **Lever** public boards 404 on every tested slug. The source is implemented and configurable; it is simply not in
  the default list.
- **Cerebras** free credits can return HTTP 402; it sits behind Gemini in the chain for that reason.
- **Gemini** free quota can 429. The router opens a circuit and moves on.
- **SQLite on a single instance** does not survive a region move. Use Postgres for anything long-lived.
- **Instagram/LinkedIn/YouTube** publishing degrades to dry-run when tokens are absent — by design, never silently.
