import { htmlToText } from '@omnigtm/core';
import { fetchJson, isRemote, type RawJob, type SourceResult } from './types.js';

interface WorkableJob {
  title: string;
  shortcode: string;
  url: string;
  application_url?: string;
  telecommuting?: boolean;
  department?: string;
  published_on?: string;
  country?: string;
  city?: string;
  description?: string;
}

interface WorkableResponse {
  name?: string;
  jobs: WorkableJob[];
}

/** Public widget API: https://apply.workable.com/api/v1/widget/accounts/{account}?details=true */
export async function fetchWorkable(account: string, limit = 40): Promise<SourceResult> {
  const source = `workable:${account}`;
  try {
    const data = await fetchJson<WorkableResponse>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`);
    const jobs = (data.jobs ?? []).slice(0, limit).map<RawJob>((job) => {
      const text = htmlToText(job.description ?? '');
      const location = [job.city, job.country].filter(Boolean).join(', ') || null;
      return {
        source,
        externalId: job.shortcode,
        companyName: data.name ?? account,
        title: job.title,
        url: job.url,
        location,
        remote: Boolean(job.telecommuting) || isRemote(`${location ?? ''} ${job.title}`),
        descriptionHtml: job.description,
        descriptionText: text,
        postedAt: job.published_on ?? null,
      };
    });
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}
