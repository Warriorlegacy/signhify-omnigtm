import { getRepo } from '@/lib/api';
import { ReelForm } from '@/components/ReelForm';
import { formatDate, stageTone } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReelsPage() {
  const repo = await getRepo();
  const items = await repo.listContent(50);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Content engine</div>
          <h1>Reels</h1>
          <p>
            Script, gate, render. The virality gate refuses anything under 85, and the CTA must contain the configured
            keyword - both are checked after generation, not just requested in the prompt.
          </p>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <div>
            <h2>Render a reel</h2>
            <div className="card-sub">One model call for the script, one FFmpeg pass for the MP4</div>
          </div>
        </div>
        <ReelForm />
      </section>

      {items.length === 0 ? (
        <div className="empty">No reels yet. Render one above; the fast preset takes a few seconds.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Pillar</th><th>Virality</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ minWidth: 240 }}>
                    <div className="cell-title">{item.title}</div>
                    <div className="cell-sub">{item.hook_line}</div>
                  </td>
                  <td className="small dim">{item.pillar}</td>
                  <td><span className="score" data-band={item.virality_score >= 85 ? 'high' : item.virality_score >= 60 ? 'mid' : 'low'}>{item.virality_score}</span></td>
                  <td><span className="badge" data-tone={stageTone(item.status)}>{item.status}</span></td>
                  <td className="small dim nowrap">{formatDate(item.created_at)}</td>
                  <td>
                    {item.mp4_storage_url ? (
                      <a className="btn btn-sm" href={item.mp4_storage_url}>MP4</a>
                    ) : (
                      <span className="small dim">not rendered</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
