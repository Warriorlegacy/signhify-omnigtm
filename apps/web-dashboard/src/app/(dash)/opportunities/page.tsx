import Link from 'next/link';
import { getRepo } from '@/lib/api';
import { ActionButton } from '@/components/ActionButton';
import { OutreachPanel } from '@/components/OutreachPanel';
import { parseReasons, scoreBand, stageTone } from '@/lib/format';
import type { Stage, Track } from '@omnigtm/core';

export const dynamic = 'force-dynamic';

const TRACKS: (Track | '')[] = ['', 'REMOTE_JOB', 'B2B_SPRINT'];
const STAGES: (Stage | '')[] = ['', 'DISCOVERED', 'PREVIEW_BUILT', 'DRAFT_READY', 'SENT', 'REPLIED', 'BOOKED', 'CLOSED_WON'];
const SENT_STAGES: Stage[] = ['SENT', 'FOLLOW_UP_1', 'REPLIED', 'BOOKED', 'CLOSED_WON'];
const PAGE_SIZE = 50;

function pageHref(filters: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  query.set('page', String(page));
  return `/opportunities?${query.toString()}`;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; stage?: string; minScore?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const repo = await getRepo();
  const minScore = params.minScore ? Number(params.minScore) : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // One extra row tells us whether a next page exists without a second COUNT
  // query. The previous hard `limit: 200` silently hid every later opportunity.
  const fetched = await repo.listOpportunities({
    track: params.track ? (params.track as Track) : undefined,
    stage: params.stage ? (params.stage as Stage) : undefined,
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    q: params.q?.trim() || undefined,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const hasMore = fetched.length > PAGE_SIZE;
  const rows = fetched.slice(0, PAGE_SIZE);
  const filters = { track: params.track, stage: params.stage, minScore: params.minScore, q: params.q };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Opportunities</h1>
          <p>
            Two tracks share one table: remote roles scored against the TypeScript/agents/MCP profile, and B2B sprint
            leads scored against the 3D-web offer. Drafts cost one model call; sends are always confirmed.
          </p>
        </div>
        <ActionButton label="Harvest now" path="/api/v1/opportunities/harvest" body={{ useLlm: true, llmBudget: 6 }} variant="primary" />
      </header>

      <form className="toolbar" method="get">
        <div className="field" style={{ flex: '0 0 160px' }}>
          <label htmlFor="track">Track</label>
          <select id="track" name="track" defaultValue={params.track ?? ''}>
            {TRACKS.map((track) => (
              <option key={track} value={track}>{track === '' ? 'Both' : track === 'REMOTE_JOB' ? 'Remote job' : 'B2B sprint'}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 180px' }}>
          <label htmlFor="stage">Stage</label>
          <select id="stage" name="stage" defaultValue={params.stage ?? ''}>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage === '' ? 'Any stage' : stage}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 140px' }}>
          <label htmlFor="minScore">Min score</label>
          <input id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={params.minScore ?? ''} placeholder="0" />
        </div>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Company or role" />
        </div>
        <button className="btn" type="submit">Filter</button>
        <Link className="btn btn-ghost" href="/opportunities">Reset</Link>
        <span className="spacer" />
        <span className="small dim">Page {page} · {rows.length} rows</span>
      </form>

      {rows.length === 0 ? (
        <div className="empty">
          {page > 1 ? 'This page is empty.' : 'No opportunities match. Run a harvest or widen the filters.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Score</th>
                <th scope="col">Company / role</th>
                <th scope="col">Why it fits</th>
                <th scope="col">Stage</th>
                <th scope="col">Source</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const reasons = parseReasons(row.fit_reasons);
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="score" data-band={scoreBand(row.fit_score)}>{Math.round(row.fit_score)}</span>
                      <div className="cell-sub">{row.remote ? 'remote' : row.location ?? '—'}</div>
                    </td>
                    <td style={{ minWidth: 240 }}>
                      <div className="cell-title">{row.company_name}</div>
                      <div className="cell-sub">{row.role_title}</div>
                      {row.pain_point_summary ? <div className="cell-sub" style={{ marginTop: 6 }}>{row.pain_point_summary}</div> : null}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      {reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="badge" style={{ marginRight: 4, marginBottom: 4 }}>{reason}</span>
                      ))}
                    </td>
                    <td><span className="badge" data-tone={stageTone(row.stage)}>{row.stage}</span></td>
                    <td className="small">
                      <div className="dim">{row.source}</div>
                      <a className="muted" href={row.source_url} target="_blank" rel="noreferrer noopener">Open source ↗</a>
                    </td>
                    <td style={{ minWidth: 340 }}>
                      <div className="grid" style={{ gap: 8 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <ActionButton
                            label={row.draft_subject || row.draft_body ? 'Regenerate' : 'Draft'}
                            path="/api/v1/outreach/draft"
                            body={{ opportunityId: row.id }}
                            size="sm"
                          />
                          {row.contact_email ? <span className="small dim">{row.contact_email}</span> : null}
                        </div>
                        <OutreachPanel
                          opportunityId={row.id}
                          company={row.company_name}
                          subject={row.draft_subject}
                          body={row.draft_body}
                          contactEmail={row.contact_email}
                          alreadySent={SENT_STAGES.includes(row.stage)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 || page > 1 ? (
        <nav className="row" style={{ justifyContent: 'space-between', marginTop: 12 }} aria-label="Pagination">
          {page > 1 ? (
            <Link className="btn btn-sm" href={pageHref(filters, page - 1)}>Previous</Link>
          ) : (
            <span />
          )}
          <span className="small dim">Page {page}</span>
          {hasMore ? (
            <Link className="btn btn-sm" href={pageHref(filters, page + 1)}>Next</Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
