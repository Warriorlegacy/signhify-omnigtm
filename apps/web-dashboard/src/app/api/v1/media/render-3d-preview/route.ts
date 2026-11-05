import { getRepo, readJson, withAuth } from '@/lib/api';
import { createDemoPreview, sliceVideo } from '@omnigtm/media';
import { publicBaseUrl, slugify } from '@omnigtm/core';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface Body {
  slug?: string;
  inputPath?: string;
  fps?: number;
  width?: number;
  sourceUrl?: string;
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const body = await readJson<Body>(request).catch(() => ({} as Body));
    const slug = slugify(body.slug ?? 'demo', 'demo');
    const result = body.inputPath
      ? await sliceVideo({
          inputPath: body.inputPath,
          slug,
          fps: Math.min(Math.max(body.fps ?? 60, 24), 60),
          width: Math.min(Math.max(body.width ?? 1280, 480), 1920),
        })
      : await createDemoPreview(slug);

    const repo = await getRepo();
    await repo.upsertPreview({
      slug,
      sourceUrl: body.sourceUrl ?? body.inputPath ?? 'synthetic:ffmpeg-gradients',
      frameCount: result.manifest.frameCount,
      bundleBytes: result.manifest.bundleBytes,
      fps: result.manifest.fps,
      width: result.manifest.width,
      height: result.manifest.height,
      manifest: result.manifest,
    });

    return Response.json({
      ok: true,
      preview: {
        slug,
        frameCount: result.manifest.frameCount,
        bundleBytes: result.manifest.bundleBytes,
        fps: result.manifest.fps,
        width: result.manifest.width,
        height: result.manifest.height,
        viewerUrl: `${publicBaseUrl()}/preview/${slug}`,
      },
    });
  });
}
