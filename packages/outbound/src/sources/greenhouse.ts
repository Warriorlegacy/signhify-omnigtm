import { htmlToText } from '@omnigtm/core';
import { fetchJson, isRemote, type RawJob, type SourceResult } from './types.js';

interface GreenhouseJob {
  id: number | string;
  title: string;
  absolute_url: string;
  updated_at?: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
  metadata?: { name: string; value: string }[] | null;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

/** Public, unauthenticated board API. https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true */
export async function fetchGreenhouse(token: string, limit = 40): Promise<SourceResult> {
  const source = `greenhouse:${token}`;
  try {
    const data = await fetchJson<GreenhouseResponse>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
    const jobs = (data.jobs ?? []).slice(0, limit).map<RawJob>((job) => {
      const text = htmlToText(job.content ?? '');
      const location = job.location?.name ?? null;
      const salaryMeta = job.metadata?.find((m) => /salary|compensation/i.test(m.name));
      return {
        source,
        externalId: String(job.id),
        companyName: job.company_name ?? token,
        title: job.title,
        url: job.absolute_url,
        location,
        remote: isRemote(`${location ?? ''} ${text.slice(0, 600)}`),
        salary: salaryMeta?.value ?? null,
        descriptionHtml: job.content,
        descriptionText: text,
        postedAt: job.updated_at ?? null,
      };
    });
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}
