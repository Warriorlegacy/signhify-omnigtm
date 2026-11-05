import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.OMNIGTM_OFFLINE_TEST = '1';
process.env.OMNIGTM_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), 'omnigtm-mcp-')), 'test.db');

const { Repo, seedIfEmpty } = await import('@omnigtm/core');
const { createGateway } = await import('@omnigtm/ai-gateway');
const { dispatchOutreach, searchOpportunities } = await import('../src/tools.js');

const repo = await Repo.open();
await seedIfEmpty(repo);
const ctx = { repo, gateway: await createGateway(repo) };

test('search_opportunities returns scored pipeline rows', async () => {
  const result = await searchOpportunities(ctx, { minScore: 80, limit: 5 });
  const data = result.data as { count: number; opportunities: { fitScore: number }[] };
  assert.equal(result.sideEffect, 'read');
  assert.ok(data.count > 0, 'seeded pipeline should not be empty');
  assert.ok(data.count <= 5);
  assert.ok(data.opportunities.every((row) => row.fitScore >= 80));
});

test('dispatch_outreach refuses to send without explicit confirmation', async () => {
  const opp = await repo.upsertOpportunity({
    workspaceId: (await repo.ensureWorkspace()).id,
    track: 'B2B_SPRINT',
    source: 'test',
    externalId: 'confirm-gate',
    companyName: 'Confirm Gate Ltd',
    roleTitle: '3D hero sprint',
    companyUrl: 'https://example.com',
    sourceUrl: 'https://example.com/jobs/1',
    contactEmail: 'buyer@example.com',
    descriptionSnippet: 'Needs a scroll-reactive 3D hero.',
  });

  const pending = await dispatchOutreach(ctx, { opportunityId: opp.id });
  assert.equal(pending.requiresConfirmation, true);
  const pendingData = pending.data as { requiresConfirmation: boolean; body: string };
  assert.equal(pendingData.requiresConfirmation, true);
  assert.match(pendingData.body, /Reply STOP/);

  const sent = await dispatchOutreach(ctx, { opportunityId: opp.id, confirm: true, dryRun: true });
  const sentData = sent.data as { status: string };
  assert.equal(sentData.status, 'DRY_RUN');
});
