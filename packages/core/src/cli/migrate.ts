import { Repo } from '../db.js';
import { loadEnvFiles } from '../load-env.js';
import { seedIfEmpty } from '../seed.js';

loadEnvFiles();

async function main(): Promise<void> {
  const repo = await Repo.open();
  await seedIfEmpty(repo);
  const stats = await repo.stats();
  const heartbeat = await repo.pingHeartbeat('db:migrate');
  console.log(JSON.stringify({ dialect: repo.dialect, heartbeat, stats }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
