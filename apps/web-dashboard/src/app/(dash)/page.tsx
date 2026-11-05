import Link from 'next/link';
import { getGateway, getRepo } from '@/lib/api';
import { ActionButton } from '@/components/ActionButton';
import { formatDate, parseReasons, relative, scoreBand, stageTone } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const repo = await getRepo();
  const gateway = await getGateway(repo);
  const [stats, opportunities, evals, usage, heartbeat] = await Promise.all([
    repo.stats(),
    repo.listOpportunities({ limit: 6 }),
    repo.listEvalRuns(1),
    repo.usageByProvider(7),
    repo.heartbeat(),
  ]);

  const providers = gateway.health();
  const latestEval = evals[0];
  const evalDetails = latestEval ? (JSON.parse(latestEval.details_json) as { id: string; name: string; passed: boolean; details: string }[]) : [];
  const cacheRate = stats.llmCalls > 0 ? Math.round((stats.llmCacheHits / stats.llmCalls) * 100) : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Autonomous GTM · $0 stack</div>
          <h1>Operator overview</h1>
          <p>
            Every number below comes from the live database - no placeholder metrics. Harvest runs on GitHub Actions,
            drafts are gated by the voice card, and sends require an explicit confirmation.
          </p>
        </div>
        <div className="row">
          <ActionButton label="Run harvest" path="/api/v1/opportunities/harvest" body={{ useLlm: true, llmBudget: 4 }} variant="primary" />
          <ActionButton label="Re-run eval gate" path="/api/v1/evals" variant="ghost" />
        </div>
      </header>

      <section className="grid grid-4">
        <div className="card">
          <div className="stat-label">Pipeline</div>
          <div className="stat-value">{stats.opportunities}</div>
          <div className="stat-hint">
            {stats.remoteJobs} remote roles · {stats.b2bSprints} B2B sprints
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Drafts ready</div>
          <div className="stat-value">{stats.draftsReady}</div>
          <div className="stat-hint">{stats.sent} sent all-time · cap enforced per mailbox</div>
        </div>
        <div className="card">
          <div className="stat-label">Eval gate</div>
          <div className="stat-value" style={{ color: stats.evalScore >= 1 ? 'var(--green)' : 'var(--amber)' }}>
            {stats.evalScore > 0 ? `${Math.round(stats.evalScore * 100)}%` : '—'}
          </div>
          <div className="stat-hint">7 dimensions · last run {relative(stats.evalRunAt)}</div>
        </div>
        <div className="card">
          <div className="stat-label">LLM cache hits</div>
          <div className="stat-value">{cacheRate}%</div>
          <div className="stat-hint">
            {stats.llmCalls} calls · avg {stats.llmAvgLatencyMs}ms
          </div>
        </div>
      </section>

      <section className="grid grid-4" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="stat-label">3D previews</div>
          <div className="stat-value">{stats.previews}</div>
          <div className="stat-hint"><Link href="/previews" className="muted">Build a new scroll preview →</Link></div>
        </div>
        <div className="card">
          <div className="stat-label">Reels rendered</div>
          <div className="stat-value">{stats.reels}</div>
          <div className="stat-hint">{stats.published} published to social</div>
        </div>
        <div className="card">
          <div className="stat-label">Database</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{repo.dialect}</div>
          <div className="stat-hint">Heartbeat {relative(heartbeat?.last_ping_at)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Providers online</div>
          <div className="stat-value">{providers.filter((p) => p.configured && !p.open).length}/{providers.length}</div>
          <div className="stat-hint">Circuit breakers reset automatically</div>
        </div>
      </section>

      <section className="grid grid-2" style={{ marginTop: 22 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Top opportunities</h2>
              <div className="card-sub">Ranked by fit score, then recency</div>
            </div>
            <Link href="/opportunities" className="small muted">View all →</Link>
          </div>
          {opportunities.length === 0 ? (
            <div className="empty">No rows yet. Run a harvest to populate the pipeline.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Score</th><th>Company / role</th><th>Stage</th><th>Track</th></tr>
                </thead>
                <tbody>
                  {opportunities.map((row) => (
                    <tr key={row.id}>
                      <td><span className="score" data-band={scoreBand(row.fit_score)}>{Math.round(row.fit_score)}</span></td>
                      <td>
                        <div className="cell-title">{row.company_name}</div>
                        <div className="cell-sub">{row.role_title}</div>
                        {parseReasons(row.fit_reasons).slice(0, 2).map((reason) => (
                          <span key={reason} className="badge" style={{ marginTop: 6, marginRight: 4 }}>{reason}</span>
                        ))}
                      </td>
                      <td><span className="badge" data-tone={stageTone(row.stage)}>{row.stage}</span></td>
                      <td className="small dim nowrap">{row.track === 'REMOTE_JOB' ? 'Remote job' : 'B2B sprint'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Provider chain</h2>
                <div className="card-sub">Failover order, free tiers only</div>
              </div>
              <Link href="/settings" className="small muted">Configure →</Link>
            </div>
            {providers.map((provider) => (
              <div className="eval-row" key={provider.id}>
                <span className="eval-dot" data-pass={provider.configured && !provider.open} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{provider.label}</div>
                  <div className="mono dim">{provider.id}</div>
                </div>
                <span className="badge" data-tone={provider.open ? 'rose' : provider.configured ? 'green' : undefined}>
                  {provider.open ? 'circuit open' : provider.configured ? 'ready' : 'no key'}
                </span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2>Latest eval run</h2>
                <div className="card-sub">{latestEval ? `${latestEval.passed_cases}/${latestEval.total_cases} · ${formatDate(latestEval.created_at)}` : 'Not run yet'}</div>
              </div>
              <Link href="/evals" className="small muted">History →</Link>
            </div>
            {evalDetails.length === 0 ? (
              <div className="empty">Run the eval gate to record a deterministic baseline.</div>
            ) : (
              evalDetails.slice(0, 7).map((item) => (
                <div className="eval-row" key={item.id}>
                  <span className="eval-dot" data-pass={item.passed} />
                  <div style={{ flex: 1 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{item.id} · {item.name}</div>
                    <div className="cell-sub">{item.details}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>Provider usage (7d)</h2>
            <div className="card-sub" style={{ marginBottom: 12 }}>Telemetry is written by the router on every attempt</div>
            {usage.length === 0 ? (
              <div className="small dim">No calls recorded yet.</div>
            ) : (
              usage.map((row) => (
                <div className="eval-row" key={row.provider}>
                  <div style={{ flex: 1 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{row.provider}</div>
                    <div className="cell-sub">{row.calls} calls · {Math.round(Number(row.avg_latency))}ms avg</div>
                  </div>
                  <span className="badge" data-tone={Number(row.failures) > 0 ? 'amber' : 'green'}>{row.failures} fail</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
