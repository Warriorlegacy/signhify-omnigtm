import { getRepo } from '@/lib/api';
import { ActionButton } from '@/components/ActionButton';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface EvalDetail {
  id: string;
  name: string;
  passed: boolean;
  score: number;
  details: string;
}

export default async function EvalsPage() {
  const repo = await getRepo();
  const runs = await repo.listEvalRuns(20);
  const latest = runs[0];
  const details: EvalDetail[] = latest ? (JSON.parse(latest.details_json) as EvalDetail[]) : [];

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Quality gate</div>
          <h1>Eval gate</h1>
          <p>
            Seven deterministic dimensions, no network and no credentials. The same assertions run locally, in CI, and
            here - so a green dashboard and a green pull request mean the same thing.
          </p>
        </div>
        <ActionButton label="Run gate" path="/api/v1/evals" variant="primary" />
      </header>

      {latest ? (
        <section className="grid grid-4" style={{ marginBottom: 22 }}>
          <div className="card">
            <div className="stat-label">Result</div>
            <div className="stat-value" style={{ color: latest.passed_cases === latest.total_cases ? 'var(--green)' : 'var(--rose)' }}>
              {latest.passed_cases}/{latest.total_cases}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Faithfulness</div>
            <div className="stat-value">{latest.faithfulness_score.toFixed(3)}</div>
            <div className="stat-hint">threshold 0.92</div>
          </div>
          <div className="card">
            <div className="stat-label">p95 latency</div>
            <div className="stat-value">{latest.p95_latency_ms}<span className="small dim">ms</span></div>
          </div>
          <div className="card">
            <div className="stat-label">Provider</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{latest.provider_used}</div>
            <div className="stat-hint">{formatDate(latest.created_at)}</div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Dimensions</h2>
              <div className="card-sub">Latest recorded run</div>
            </div>
          </div>
          {details.length === 0 ? (
            <div className="empty">No run recorded. Press &quot;Run gate&quot;.</div>
          ) : (
            details.map((item) => (
              <div className="eval-row" key={item.id}>
                <span className="eval-dot" data-pass={item.passed} />
                <div style={{ flex: 1 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{item.id} · {item.name}</div>
                  <div className="cell-sub">{item.details}</div>
                </div>
                <span className="mono dim">{item.score.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>History</h2>
              <div className="card-sub">Every run is persisted with its commit SHA</div>
            </div>
          </div>
          {runs.length === 0 ? (
            <div className="empty">No runs yet.</div>
          ) : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table style={{ minWidth: 0 }}>
                <thead><tr><th>When</th><th>Passed</th><th>Faith.</th><th>Commit</th></tr></thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="small dim nowrap">{formatDate(run.created_at)}</td>
                      <td><span className="badge" data-tone={run.passed_cases === run.total_cases ? 'green' : 'rose'}>{run.passed_cases}/{run.total_cases}</span></td>
                      <td className="mono">{run.faithfulness_score.toFixed(3)}</td>
                      <td className="mono dim">{run.git_commit_sha.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
