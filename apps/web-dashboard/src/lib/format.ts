export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

export function relative(value: string | null | undefined): string {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return 'never';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function scoreBand(score: number): 'high' | 'mid' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 55) return 'mid';
  return 'low';
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function stageTone(stage: string): 'cyan' | 'green' | 'amber' | 'rose' | undefined {
  if (['BOOKED', 'CLOSED_WON', 'SENT', 'PUBLISHED'].includes(stage)) return 'green';
  if (['DRAFT_READY', 'PREVIEW_BUILT', 'RENDERED'].includes(stage)) return 'cyan';
  if (['DISCOVERED', 'ENRICHED', 'PLANNED', 'QUEUED'].includes(stage)) return 'amber';
  if (['SUPPRESSED', 'FAILED'].includes(stage)) return 'rose';
  return undefined;
}

export function parseReasons(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}
