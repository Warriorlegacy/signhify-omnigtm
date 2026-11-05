import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.OMNIGTM_MEDIA_DIR = mkdtempSync(path.join(os.tmpdir(), 'omnigtm-media-'));

const { dirSize, ensureFfmpeg, escapeFilterValue, frameFile, previewDir, readManifest, wrapText, createDemoPreview } = await import('../src/index.js');

test('wrapText breaks on word boundaries within the width', () => {
  const wrapped = wrapText('Stop paying $580 per month for stacked outbound SaaS today', 20);
  assert.ok(wrapped.split('\n').every((line) => line.length <= 20));
  assert.ok(!wrapped.includes('  '));
});

test('escapeFilterValue neutralises FFmpeg filter metacharacters', () => {
  const escaped = escapeFilterValue("C:\\Fonts\\A:B, C'.ttf");
  assert.equal(escaped, "C\\:/Fonts/A\\:B\\, C\\'.ttf");
});

test('frame names are zero padded to four digits', () => {
  assert.match(frameFile('demo', 7).replace(/\\/g, '/'), /frames\/frame_0007\.webp$/);
});

test('readManifest returns null for an unknown slug', () => {
  assert.equal(readManifest('does-not-exist'), null);
});

test('dirSize counts only files', () => {
  const dir = path.join(previewDir('size-check'), 'frames');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'a.webp'), Buffer.alloc(10));
  writeFileSync(path.join(dir, 'b.webp'), Buffer.alloc(5));
  mkdirSync(path.join(dir, 'nested'));
  assert.deepEqual(dirSize(dir), { bytes: 15, files: 2 });
});

test('demo preview slices 60 FPS frames and writes a manifest', async (t) => {
  try {
    await ensureFfmpeg();
  } catch {
    t.skip('FFmpeg not installed on this runner');
    return;
  }
  const result = await createDemoPreview('unit-demo');
  assert.equal(result.manifest.fps, 60);
  assert.equal(result.manifest.frameCount, 480);
  assert.ok(result.manifest.bundleBytes > 0);
  const manifest = readManifest('unit-demo');
  assert.equal(manifest?.frameCount, 480);
  assert.equal(manifest?.width, 1280);
});
