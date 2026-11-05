import { Repo } from './db.js';
import { log } from './logger.js';

/**
 * Seeds a first-run workspace plus a handful of clearly-labelled demo rows so the
 * dashboard is not empty before the first live harvest. Real harvests upsert over
 * these by idempotency key; nothing here is presented as live data in the UI.
 */
export async function seedIfEmpty(repo: Repo): Promise<{ seeded: boolean }> {
  const workspace = await repo.ensureWorkspace();
  const stats = await repo.stats();
  if (stats.opportunities > 0) return { seeded: false };

  const demo: Parameters<Repo['upsertOpportunity']>[0][] = [
    {
      workspaceId: workspace.id,
      track: 'B2B_SPRINT',
      source: 'seed',
      externalId: 'plus-render',
      companyName: 'Plus Render',
      roleTitle: '60 FPS 3D scroll hero for Miami ArchViz portfolio',
      companyUrl: 'https://plusrender.com/3d-rendering-miami/',
      sourceUrl: 'https://plusrender.com/3d-rendering-miami/',
      location: 'Miami, US',
      descriptionSnippet: 'Architectural visualisation studio shipping CGI flythroughs for property developers.',
      painPointSummary: 'Cinematic renders are delivered as flat MP4s, so the website cannot sell the walkthrough experience.',
      fitScore: 92,
      fitReasons: ['CGI flythrough inventory', 'Premium property clients', 'No scroll-reactive web preview'],
      stage: 'PREVIEW_BUILT',
    },
    {
      workspaceId: workspace.id,
      track: 'B2B_SPRINT',
      source: 'seed',
      externalId: 'hex-digital',
      companyName: 'Hex Digital',
      roleTitle: 'Interactive 3D launch microsite for a Webflow studio',
      companyUrl: 'https://hexdigital.com',
      sourceUrl: 'https://hexdigital.com',
      location: 'London, UK',
      descriptionSnippet: 'Webflow and Framer studio building launch sites for venture-backed products.',
      painPointSummary: 'Every 3D hero is a custom Three.js build, which adds weeks and hurts mobile Lighthouse scores.',
      fitScore: 88,
      fitReasons: ['Ships launch microsites weekly', 'No in-house WebGL engineer', 'Cares about Core Web Vitals'],
      stage: 'DRAFT_READY',
    },
    {
      workspaceId: workspace.id,
      track: 'B2B_SPRINT',
      source: 'seed',
      externalId: 'stride-health',
      companyName: 'Stride Health',
      roleTitle: 'Product launch page with a grounded AI concierge',
      companyUrl: 'https://getstride.com',
      sourceUrl: 'https://getstride.com',
      location: 'San Francisco, US',
      descriptionSnippet: 'Benefits marketplace for independent workers, actively shipping growth pages.',
      painPointSummary: 'Static product pages convert poorly for a complex, trust-heavy insurance product.',
      fitScore: 81,
      fitReasons: ['Active growth experiments', 'Complex product needs explainer', 'Series-stage budget'],
      stage: 'DISCOVERED',
    },
    {
      workspaceId: workspace.id,
      track: 'REMOTE_JOB',
      source: 'seed',
      externalId: 'mastra-customer-engineer',
      companyName: 'Mastra',
      roleTitle: 'Customer Engineer (Agents / TypeScript)',
      companyUrl: 'https://mastra.ai',
      sourceUrl: 'https://jobs.ashbyhq.com/mastra',
      location: 'Remote',
      remote: true,
      descriptionSnippet: 'TypeScript agent framework. Forward-deployed engineering with production agent teams.',
      painPointSummary: 'Needs engineers who can ship MCP tooling and deterministic evals in production.',
      fitScore: 95,
      fitReasons: ['TypeScript + agents', 'MCP-adjacent product', 'Remote-friendly'],
      stage: 'DRAFT_READY',
    },
    {
      workspaceId: workspace.id,
      track: 'REMOTE_JOB',
      source: 'seed',
      externalId: 'exa-engineer',
      companyName: 'Exa',
      roleTitle: 'Full-Stack Engineer, Search Products',
      companyUrl: 'https://exa.ai',
      sourceUrl: 'https://exa.ai/careers',
      location: 'Remote (US)',
      remote: true,
      descriptionSnippet: 'Neural search API used by AI products; small product engineering team.',
      painPointSummary: 'Wants product engineers who can own RAG quality and latency end to end.',
      fitScore: 89,
      fitReasons: ['Search / RAG depth', 'Small team ownership', 'AI-native product'],
      stage: 'DISCOVERED',
    },
    {
      workspaceId: workspace.id,
      track: 'REMOTE_JOB',
      source: 'seed',
      externalId: 'infisical-senior-fullstack',
      companyName: 'Infisical',
      roleTitle: 'Senior Full-Stack Engineer',
      companyUrl: 'https://infisical.com',
      sourceUrl: 'https://infisical.com/careers/senior-full-stack-engineer',
      location: 'Remote',
      remote: true,
      descriptionSnippet: 'Open-source secrets management platform with a TypeScript and Go stack.',
      painPointSummary: 'Hiring for security-sensitive platform work with a strong open-source signal.',
      fitScore: 86,
      fitReasons: ['Open-source flagship', 'Secrets / security domain', 'Remote'],
      stage: 'DISCOVERED',
    },
  ];

  for (const item of demo) {
    await repo.upsertOpportunity(item);
  }

  await repo.upsertContent({
    workspaceId: workspace.id,
    topicHash: 'seed-architecture-reel',
    pillar: 'Zero-Burn FOSS Replacements',
    title: 'Stop paying $580/mo for outbound and video SaaS',
    hookLine: 'The $0 stack that replaced Clay, Instantly and Creatomate.',
    script: {
      hook: 'Stop paying $580/month for stacked outbound SaaS.',
      beats: [
        'Poll Greenhouse, Lever and Ashby directly — no enrichment credits.',
        'Route Groq → Cerebras → Gemini with a 400ms circuit breaker.',
        'Render 60 FPS reels with FFmpeg and publish through official APIs.',
      ],
      cta: 'Comment "FOSS" and I will DM the repo.',
      virality_score: 91,
    },
    viralityScore: 91,
  });

  log.info('seeded demo workspace', { workspace: workspace.slug, rows: demo.length });
  return { seeded: true };
}
