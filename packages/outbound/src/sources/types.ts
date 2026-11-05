export interface RawJob {
  source: string;
  externalId: string;
  companyName: string;
  title: string;
  url: string;
  location?: string | null;
  remote?: boolean;
  salary?: string | null;
  descriptionHtml?: string;
  descriptionText: string;
  postedAt?: string | null;
  contactEmail?: string | null;
}

export interface SourceResult {
  source: string;
  jobs: RawJob[];
  error?: string;
}

const UA = 'Signhify-OmniGTM/1.0 (+https://signhify.dpdns.org; public ATS feed reader)';

export async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function isRemote(text: string): boolean {
  return /\b(remote|anywhere|distributed|work from home|wfh)\b/i.test(text);
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}
