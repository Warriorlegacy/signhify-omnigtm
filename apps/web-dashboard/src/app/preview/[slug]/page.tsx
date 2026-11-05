import { notFound } from 'next/navigation';
import { readManifest, type PreviewManifest } from '@omnigtm/media';
import { getRepo } from '@/lib/api';
import { ScrollPreview } from '@/components/ScrollPreview';

export const dynamic = 'force-dynamic';

/** Public artefact: this is the link that goes into an outreach email. */
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) notFound();

  let manifest: PreviewManifest | null = readManifest(slug);

  if (!manifest) {
    const repo = await getRepo();
    const record = await repo.getPreview(slug);
    if (record) {
      try {
        manifest = JSON.parse(record.manifest_json) as PreviewManifest;
      } catch {
        manifest = null;
      }
    }
  }

  if (!manifest || !manifest.frameCount) notFound();

  return (
    <ScrollPreview
      slug={slug}
      frameCount={manifest.frameCount}
      width={manifest.width}
      height={manifest.height}
      fps={manifest.fps}
      title="Scroll to move through the scene"
      subtitle={`${manifest.frameCount} WebP frames at ${manifest.fps} FPS · ${(manifest.bundleBytes / 1024 / 1024).toFixed(2)} MB total · no WebGL bundle`}
    />
  );
}
