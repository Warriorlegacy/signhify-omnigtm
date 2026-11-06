import { Repo } from '../db.js';
import { loadEnvFiles } from '../load-env.js';

loadEnvFiles();

/**
 * Retention sweep. Runs from the scheduled pipeline, after the harvest:
 * expired LLM cache entries and usage rows older than 90 days are deleted so a
 * free-tier database does not grow without bound.
 */
async function main(): Promise<void> {
  const repo = await Repo.open();
  const removed = await repo.pruneExpired();
  const heartbeat = await repo.pingHeartbeat('maintenance');
  console.log(JSON.stringify({ dialect: repo.dialect, removed, heartbeat }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
