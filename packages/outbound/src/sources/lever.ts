import { htmlToText } from '@omnigtm/core';
import { fetchJson, isRemote, type RawJob, type SourceResult } from './types.js';

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
  description?: string;
}

/**
 * Lever public postings API. Kept configurable because Lever boards increasingly
 * 404 when a company moves ATS — the harvest report surfaces that per source.
 */
export async function fetchLever(site: string, limit = 40): Promise<SourceResult> {
  const source = `lever:${site}`;
  try {
    const data = await fetchJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
    const jobs = (Array.isArray(data) ? data : []).slice(0, limit).map<RawJob>((job) => {
      const text = job.descriptionPlain ?? htmlToText(job.description ?? '');
      const location = job.categories?.location ?? null;
      return {
        source,
        externalId: job.id,
        companyName: site,
        title: job.text,
        url: job.hostedUrl,
        location,
        remote: isRemote(`${location ?? ''} ${text.slice(0, 400)}`),
        descriptionHtml: job.description,
        descriptionText: text,
        postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      };
    });
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}
