import { fetchAshby } from './ashby.js';
import { fetchArbeitnow, fetchRemotive } from './feeds.js';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchHackerNews } from './hackernews.js';
import { fetchLever } from './lever.js';
import type { SourceResult } from './types.js';
import { fetchWorkable } from './workable.js';

export type { RawJob, SourceResult } from './types.js';

export const DEFAULT_SOURCES = [
  'ashby:mastra',
  'ashby:supabase',
  'ashby:livekit',
  'greenhouse:yipitdata',
  'workable:huggingface',
  'remotive:all',
];

export function parseSourceSpec(spec: string): { type: string; token: string } {
  const [type, ...rest] = spec.split(':');
  return { type: (type ?? '').trim().toLowerCase(), token: rest.join(':').trim() };
}

export async function fetchSource(spec: string, limit = 30): Promise<SourceResult> {
  const { type, token } = parseSourceSpec(spec);
  switch (type) {
    case 'greenhouse':
      return token ? fetchGreenhouse(token, limit) : { source: spec, jobs: [], error: 'Missing board token' };
    case 'ashby':
      return token ? fetchAshby(token, limit) : { source: spec, jobs: [], error: 'Missing org slug' };
    case 'workable':
      return token ? fetchWorkable(token, limit) : { source: spec, jobs: [], error: 'Missing account' };
    case 'lever':
      return token ? fetchLever(token, limit) : { source: spec, jobs: [], error: 'Missing site' };
    case 'remotive':
      return fetchRemotive(limit);
    case 'arbeitnow':
      return fetchArbeitnow(limit);
    case 'hn':
      return fetchHackerNews(limit);
    default:
      return { source: spec, jobs: [], error: `Unknown source type '${type}'` };
  }
}

export async function fetchAll(sources: string[], limitPerSource = 30): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  for (const spec of sources) {
    results.push(await fetchSource(spec, limitPerSource));
  }
  return results;
}
