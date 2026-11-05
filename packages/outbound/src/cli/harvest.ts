import { Repo, loadEnvFiles } from '@omnigtm/core';
import { createGateway } from '@omnigtm/ai-gateway';
import { harvest } from '../harvest.js';

loadEnvFiles();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const repo = await Repo.open();
  const useLlm = !process.argv.includes('--no-llm') && process.env.OMNIGTM_LLM !== '0';
  const gateway = useLlm ? await createGateway(repo) : null;
  const report = await harvest({
    repo,
    gateway,
    track: (arg('track') as 'REMOTE_JOB' | 'B2B_SPRINT' | 'BOTH' | undefined) ?? 'BOTH',
    sources: arg('sources')?.split(',').map((s) => s.trim()).filter(Boolean),
    limitPerSource: Number(arg('limit') ?? 25),
    useLlm,
    llmBudget: Number(arg('llm-budget') ?? 6),
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
