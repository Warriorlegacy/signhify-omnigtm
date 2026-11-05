import { loadEnvFiles } from '@omnigtm/core';
import { liveSmoke } from '../eval.js';

loadEnvFiles();

liveSmoke()
  .then((rows) => {
    for (const row of rows) {
      console.log(`${row.provider} | ${row.model} | ${row.latencyMs}ms | ${row.reply}`);
    }
    if (rows.length === 0) console.log('No provider keys configured. Set GROQ_API_KEY or OPENROUTER_API_KEY.');
    process.exit(rows.some((r) => !r.reply.startsWith('FAILED')) ? 0 : 1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
