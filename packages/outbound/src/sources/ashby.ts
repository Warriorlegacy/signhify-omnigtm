import { htmlToText } from '@omnigtm/core';
import { fetchJson, isRemote, type RawJob, type SourceResult } from './types.js';

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  publishedAt?: string;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: { compensationTierSummary?: string };
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

/**
 * Public posting API (no key): https://api.ashbyhq.com/posting-api/job-board/{org}
 * Preferred over scraping the __appData blob out of the HTML page.
 */
export async function fetchAshby(org: string, limit = 40): Promise<SourceResult> {
  const source = `ashby:${org}`;
  try {
    const data = await fetchJson<AshbyResponse>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`);
    const jobs = (data.jobs ?? []).filter((j) => j.title).slice(0, limit).map<RawJob>((job) => {
      const text = job.descriptionPlain ?? htmlToText(job.descriptionHtml ?? '');
      const location = job.location ?? job.secondaryLocations?.map((l) => l.location).filter(Boolean).join(', ') ?? null;
      return {
        source,
        externalId: job.id,
        companyName: org,
        title: job.title,
        url: job.jobUrl,
        location,
        remote: Boolean(job.isRemote) || job.workplaceType === 'Remote' || isRemote(`${location ?? ''} ${text.slice(0, 400)}`),
        salary: job.compensation?.compensationTierSummary ?? null,
        descriptionHtml: job.descriptionHtml,
        descriptionText: text,
        postedAt: job.publishedAt ?? null,
      };
    });
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}
