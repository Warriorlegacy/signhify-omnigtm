# Architecture

## Boundaries

```
packages/core          no dependencies except pg
  env · redaction · crypto · ids · paths · dual-driver DB · seed
        ▲
        ├── packages/ai-gateway    providers · router · tasks · eval · endpoints
        ├── packages/media         ffmpeg · preview · reel · tts · publish · social
        └── packages/outbound      sources · score · harvest · relay · draft · suppression
                    ▲
packages/mcp-server    tools + job orchestration (depends on all four)
                    ▲
apps/web-dashboard     Next.js 15 UI + API (depends on all five)
```

`core` never imports a feature package. Feature packages never import each other except `outbound → ai-gateway`
(for scoring/drafting) and `media → core` (for `statePath`). The dashboard and MCP server share the same job
functions in `packages/mcp-server/src/tools.ts`, so there is exactly one implementation of "render a reel" and one
of "dispatch outreach".

## Request flow: harvest

```
POST /api/v1/opportunities/harvest
  └─ withAuth() ── session cookie == sha256(token)
      └─ harvest({ repo, gateway })
          ├─ fetchAll(DEFAULT_SOURCES)          // Ashby, Greenhouse, Workable, Remotive, ...
          ├─ heuristicScore(job)                // deterministic, zero tokens
          ├─ repo.findByCompanyRole()           // cross-source dedupe
          ├─ repo.upsertOpportunity()           // idempotency_key = sha256(source:externalId)[0..24]
          └─ scoreOpportunity(gateway, shortlist top N)
                └─ AiGateway.run()
                    ├─ cache (llm_cache, TTL 24h)
                    ├─ circuit breaker per provider
                    ├─ local RPM window per provider
                    └─ provider chain, model fallbacks on 404/decommission
```

Only the shortlist (heuristic ≥ 55, capped by `llmBudget`) costs tokens. A harvest of ~100 postings normally uses
≤ 6 model calls.

## Request flow: 60 FPS preview

```
POST /api/v1/media/render-3d-preview
  └─ sliceVideo() | createDemoPreview()
      └─ ffmpeg -vf fps=60,scale=1280:-2 -c:v libwebp -quality 78 → frame_0001.webp … frame_0480.webp
  └─ repo.upsertPreview()   // manifest JSON persisted for fresh instances
GET /preview/[slug]         // server component reads manifest, renders <ScrollPreview>
GET /api/v1/media/frames/[slug]/[frame_000N.webp]   // immutable, public, path-validated
```

The client keeps a sliding window of decoded frames (±12 behind, +24 ahead) and draws the current frame on a
canvas inside a 340vh scroll track. `prefers-reduced-motion` swaps the canvas for a single poster frame.

## Data model

12 tables, one schema for SQLite and Postgres. SQL is written with `?` placeholders; the Postgres driver rewrites
them to `$1..$n`. Text timestamps keep the two dialects identical.

`opportunities.idempotency_key` is unique, which is what makes re-harvesting safe. `social_comments_dm_log
.external_comment_id` is unique, which is what stops duplicate Instagram DMs when Meta retries a webhook.

## The eval gate

| ID | Dimension | What actually fails it |
| --- | --- | --- |
| ECC-01 | Secret fallback | `requireSecret` returning a value instead of throwing |
| ECC-02 | 429 failover | primary provider answering when it should be rate-limited |
| ECC-03 | Virality + schema | `virality_score < 85` or missing CTA keyword |
| ECC-04 | Citation groundedness | citations that are not verbatim source substrings |
| ECC-05 | Redaction | a credential literal surviving in output |
| ECC-06 | Voice card | banned phrase present or `Reply STOP` missing |
| ECC-07 | Idempotency + latency | key length ≠ 24 or mock latency ≥ 500 ms |

The gate runs against mock providers, so it is deterministic and credential-free. `npm run eval` in CI and the
dashboard button execute the same code.

## Deliberate trade-offs

- **SQLite by default.** A fresh clone boots with zero services. Postgres is a config change, not a rewrite.
- **FFmpeg over Remotion.** No headless Chrome, no licence, no render farm. Text layout is explicit (one `drawtext`
  per line) because multi-line `textfile` rendering varies across builds.
- **Curated B2B seeds.** Scraping prospect lists would be both unreliable and legally murky; the six seeds are the
  studio's own research and are labelled `seed:b2b`.
- **Cookie auth, not OAuth.** One operator, one token. Adding a full identity provider would not reduce risk here.
- **No queue.** GitHub Actions is the scheduler; the web service handles one request at a time. That is the correct
  amount of infrastructure for a solo operator, and it is documented rather than hidden.
