import { createDemoPreview, readManifest } from '@omnigtm/media';
import { getRepo } from '@/lib/api';

export const dynamic = 'force-dynamic';

// The static viewer on GitHub Pages reads this cross-origin, so the response
// must opt in. Read-only, unauthenticated, no credentials - a wildcard is safe.
const CORS = { 'Access-Control-Allow-Origin': '*' };

// Free instances have no persistent disk, so the synthetic demo is regenerated
// on first read after a restart. Single-flight keeps concurrent visitors from
// running FFmpeg more than once.
let building: Promise<unknown> | null = null;

async function ensureDemo(): Promise<void> {
  building ??= createDemoPreview('demo').finally(() => {
    building = null;
  });
  await building;
}

/** Public manifest read so the static viewer (GitHub Pages) can stay deploy-free. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await context.params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return Response.json({ ok: false, error: 'Invalid slug' }, { status: 400 });

  let onDisk = readManifest(slug);
  if (!onDisk && slug === 'demo') {
    await ensureDemo();
    onDisk = readManifest(slug);
  }
  if (onDisk) return Response.json({ ok: true, manifest: onDisk }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } });

  const repo = await getRepo();
  const record = await repo.getPreview(slug);
  if (!record) return Response.json({ ok: false, error: 'Preview not found' }, { status: 404 });
  try {
    return Response.json({ ok: true, manifest: JSON.parse(record.manifest_json) }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return Response.json({ ok: false, error: 'Stored manifest is not valid JSON' }, { status: 500 });
  }
}
