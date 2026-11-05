import { htmlToText } from '@omnigtm/core';
import { fetchJson, isRemote, type RawJob, type SourceResult } from './types.js';

interface HnHit {
  objectID: string;
  title?: string;
  created_at?: string;
}

interface HnSearch {
  hits: HnHit[];
}

interface HnItem {
  id: number;
  created_at: string;
  text?: string;
  author?: string;
}

/**
 * Hacker News "Who is hiring" via the Algolia API. Comments are free text, so the
 * parse is deliberately conservative: first line becomes the role, first 60 chars
 * of the remainder become the company guess. Anything unparseable is skipped.
 */
export async function fetchHackerNews(limit = 25): Promise<SourceResult> {
  const source = 'hn:whoishiring';
  try {
    const search = await fetchJson<HnSearch>('https://hn.algolia.com/api/v1/search_by_date?query=%22Ask%20HN%3A%20Who%20is%20hiring%22&tags=story&hitsPerPage=1');
    const story = search.hits?.[0];
    if (!story) return { source, jobs: [], error: 'No hiring thread found' };
    const thread = await fetchJson<{ children: HnItem[] }>(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
    const jobs: RawJob[] = [];
    for (const comment of thread.children ?? []) {
      if (!comment.text) continue;
      const text = htmlToText(comment.text);
      if (text.length < 40) continue;
      const [firstLine, ...rest] = text.split('\n');
      const headline = (firstLine ?? '').trim();
      const company = headline.split(/[|–—-]/)[0]?.trim().slice(0, 70) || 'HN poster';
      const title = headline.slice(0, 120) || 'Role posted on HN';
      jobs.push({
        source,
        externalId: String(comment.id),
        companyName: company,
        title,
        url: `https://news.ycombinator.com/item?id=${comment.id}`,
        location: null,
        remote: isRemote(text),
        descriptionText: text.slice(0, 4000),
        postedAt: comment.created_at,
      });
      if (jobs.length >= limit) break;
    }
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}
