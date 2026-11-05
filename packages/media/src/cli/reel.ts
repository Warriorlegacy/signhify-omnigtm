import path from 'node:path';
import { loadEnvFiles } from '@omnigtm/core';
import { AiGateway, generateReelScript, resolveProviders } from '@omnigtm/ai-gateway';
import { renderReel, type ReelPreset, type ReelScript } from '../reel.js';
import { synthesizeVoiceover } from '../tts.js';
import { publishInstagram, publishLinkedIn, publishYouTube } from '../publish.js';

loadEnvFiles();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

const DEMO: ReelScript = {
  title: 'Stop paying $580/mo for outbound and video SaaS',
  hook: 'Stop paying $580/month for stacked outbound SaaS.',
  beats: [
    'Poll Greenhouse, Lever and Ashby directly — no enrichment credits.',
    'Fail over Groq → OpenRouter → Gemini in under 400ms.',
    'Render 60 FPS reels with FFmpeg, not a render farm.',
  ],
  cta: 'Comment "FOSS" and I will DM you the repo.',
};

async function main(): Promise<void> {
  const preset = (arg('preset') as ReelPreset | undefined) ?? 'fast';
  const out = path.resolve(arg('out') ?? path.join(process.cwd(), '.data', 'reels', `reel-${preset}.mp4`));
  const topic = arg('topic');

  let script: ReelScript = DEMO;
  if (topic) {
    const gateway = new AiGateway({ providers: resolveProviders() });
    const generated = await generateReelScript(gateway, { topic, pillar: 'Zero-Burn FOSS Replacements' });
    script = { title: generated.result.title, hook: generated.result.hook, beats: generated.result.beats, cta: generated.result.cta };
    console.log(JSON.stringify({ script, provider: generated.provider, virality: generated.result.virality_score, gatePassed: generated.gatePassed }, null, 2));
  }

  let audioPath: string | undefined;
  if (process.argv.includes('--tts')) {
    const wav = path.join(path.dirname(out), 'voiceover.wav');
    const tts = await synthesizeVoiceover(`${script.hook}. ${script.beats.join('. ')}. ${script.cta}`, wav);
    if (tts.ok) audioPath = tts.path;
    else console.log(`TTS skipped: ${tts.reason}`);
  }

  const result = await renderReel({ script, outPath: out, preset, audioPath });
  console.log(JSON.stringify(result, null, 2));

  if (process.argv.includes('--publish')) {
    const caption = `${script.hook}\n\n${script.beats.map((b) => `• ${b}`).join('\n')}\n\n${script.cta}\n\n#opensource #buildinpublic`;
    console.log(JSON.stringify(await publishLinkedIn({ text: caption, videoPath: out, title: script.title }), null, 2));
    console.log(JSON.stringify(await publishYouTube({ videoPath: out, title: script.title, description: caption, tags: ['opensource', 'ai', 'typescript'] }), null, 2));
    const publicUrl = arg('public-url');
    if (publicUrl) console.log(JSON.stringify(await publishInstagram({ videoUrl: publicUrl, caption }), null, 2));
    else console.log('Instagram skipped: pass --public-url with a public HTTPS MP4 URL.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
