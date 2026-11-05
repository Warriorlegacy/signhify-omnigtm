import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mediaRoot } from '@omnigtm/media';
import { getRepo, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAuth(async () => {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
    const repo = await getRepo();
    const item = await repo.getContent(id);
    if (!item?.mp4_storage_url) return new Response('Not found', { status: 404 });
    try {
      const bytes = await readFile(path.join(mediaRoot(), 'reels', `${id}.mp4`));
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(bytes.byteLength),
          'Content-Disposition': `inline; filename="omnigtm-${id.slice(0, 8)}.mp4"`,
          'Cache-Control': 'private, max-age=600',
        },
      });
    } catch {
      return new Response('Reel file missing on this instance - re-render it.', { status: 404 });
    }
  });
}
