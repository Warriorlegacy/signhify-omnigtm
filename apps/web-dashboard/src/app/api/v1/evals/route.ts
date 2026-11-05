import { getRepo, withAuth } from '@/lib/api';
import { runEvals, summarize } from '@omnigtm/ai-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  return withAuth(async () => {
    const repo = await getRepo();
    return Response.json({ ok: true, runs: await repo.listEvalRuns(20) });
  });
}

export async function POST(): Promise<Response> {
  return withAuth(async () => {
    const repo = await getRepo();
    const results = await runEvals();
    const summary = summarize(results);
    const commitSha = process.env.GITHUB_SHA ?? process.env.RENDER_GIT_COMMIT ?? 'local';
    const id = await repo.insertEvalRun({
      commitSha,
      providerUsed: 'deterministic-mock',
      total: summary.total,
      passed: summary.passed,
      faithfulness: summary.faithfulness,
      p95: summary.p95,
      details: results,
    });
    return Response.json({ ok: summary.passed === summary.total, id, summary, results });
  });
}
