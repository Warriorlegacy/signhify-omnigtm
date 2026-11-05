import { readManifest } from '@omnigtm/media';
import { getRepo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Public manifest read so the static viewer (GitHub Pages) can stay deploy-free. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await context.params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return Response.json({ ok: false, error: 'Invalid slug' }, { status: 400 });

  const onDisk = readManifest(slug);
  if (onDisk) return Response.json({ ok: true, manifest: onDisk }, { headers: { 'Cache-Control': 'public, max-age=300' } });

  const repo = await getRepo();
  const record = await repo.getPreview(slug);
  if (!record) return Response.json({ ok: false, error: 'Preview not found' }, { status: 404 });
  try {
    return Response.json({ ok: true, manifest: JSON.parse(record.manifest_json) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return Response.json({ ok: false, error: 'Stored manifest is not valid JSON' }, { status: 500 });
  }
}
