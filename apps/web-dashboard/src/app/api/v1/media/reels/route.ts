import { getGateway, getRepo, readJson, withAuth } from '@/lib/api';
import { renderSocialReel } from '@omnigtm/mcp-server/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(): Promise<Response> {
  return withAuth(async () => {
    const repo = await getRepo();
    return Response.json({ ok: true, reels: await repo.listContent(50) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const body = await readJson<{ topic?: string; pillar?: string; preset?: 'full' | 'fast'; ctaKeyword?: string }>(request);
    if (!body.topic || body.topic.trim().length < 4) {
      return Response.json({ ok: false, error: 'topic must be at least 4 characters' }, { status: 400 });
    }
    const repo = await getRepo();
    const outcome = await renderSocialReel({ repo, gateway: await getGateway(repo) }, {
      topic: body.topic.trim(),
      pillar: body.pillar,
      preset: body.preset === 'full' ? 'full' : 'fast',
      ctaKeyword: body.ctaKeyword,
    });
    const data = outcome.data as {
      contentId: string;
      title: string;
      hook: string;
      viralityScore: number;
      gatePassed: boolean;
      provider: string;
      downloadUrl: string;
      render: unknown;
    };
    return Response.json({
      ok: true,
      reel: {
        contentId: data.contentId,
        title: data.title,
        hook: data.hook,
        viralityScore: data.viralityScore,
        gatePassed: data.gatePassed,
        provider: data.provider,
        downloadUrl: data.downloadUrl,
        render: data.render,
      },
    });
  });
}
