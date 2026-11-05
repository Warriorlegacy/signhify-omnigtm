import { requireSessionPage } from '@/lib/auth';
import { Nav } from '@/components/Nav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireSessionPage();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">OmniGTM</div>
            <div className="brand-sub">Signhify Studio</div>
          </div>
        </div>
        <Nav />
        <div className="sidebar-foot">
          <div><span className="dot" />$0 stack online</div>
          <div>Cloudflare · Neon · Groq · FFmpeg</div>
          <div className="mono" style={{ marginTop: 8 }}>v1.0.0</div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
