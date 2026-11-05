import { readFile } from 'node:fs/promises';
import { frameFile } from '@omnigtm/media';

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FRAME = /^frame_(\d{1,4})\.webp$/;

/**
 * Frame server for the scroll viewer. Public by design (it only serves generated
 * WebP frames) but path-traversal safe: the slug and frame name are validated
 * against strict patterns before touching the filesystem.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string; frame: string }> }): Promise<Response> {
  const { slug, frame } = await context.params;
  const match = FRAME.exec(frame);
  if (!SLUG.test(slug) || !match) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(frameFile(slug, Number(match[1])));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
