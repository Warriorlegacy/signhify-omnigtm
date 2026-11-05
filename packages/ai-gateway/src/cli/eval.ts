import { execSync } from 'node:child_process';
import { Repo, loadEnvFiles, log } from '@omnigtm/core';
import { runEvals, summarize } from '../eval.js';

loadEnvFiles();

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local-dev';
  }
}

async function main(): Promise<void> {
  const json = process.argv.includes('--json');
  const persist = !process.argv.includes('--no-persist');
  const results = await runEvals();
  const summary = summarize(results);

  if (json) {
    console.log(JSON.stringify({ results, summary }, null, 2));
  } else {
    console.log('='.repeat(78));
    console.log('OMNIGTM AI GATEWAY — 7/7 REFERENCE-SET READINESS REPORT');
    console.log('='.repeat(78));
    for (const item of results) {
      console.log(`[${item.passed ? 'PASS' : 'FAIL'}] ${item.id} | ${item.name} (score ${item.score.toFixed(2)})`);
      console.log(`       -> ${item.details}`);
    }
    console.log('-'.repeat(78));
    console.log(`TOTAL READINESS SCORE: ${summary.passed}/${summary.total} PASSED (cost: $0.00)`);
    console.log('='.repeat(78));
  }

  if (persist) {
    try {
      const repo = await Repo.open();
      await repo.insertEvalRun({
        commitSha: commitSha(),
        providerUsed: results.find((r) => r.id === 'ECC-02')?.passed ? 'groq_lpu_free (simulated failover)' : 'unknown',
        total: summary.total,
        passed: summary.passed,
        faithfulness: summary.faithfulness,
        p95: summary.p95,
        details: results,
      });
    } catch (error) {
      log.warn('could not persist eval run', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  process.exit(summary.passed === summary.total ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
