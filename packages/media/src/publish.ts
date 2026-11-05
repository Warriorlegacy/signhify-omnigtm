import { readFileSync } from 'node:fs';
import { optionalSecret, requireSecret } from '@omnigtm/core';

export interface PublishResult {
  platform: 'instagram' | 'linkedin' | 'youtube';
  ok: boolean;
  dryRun: boolean;
  id?: string;
  url?: string;
  error?: string;
  payload?: unknown;
}

const GRAPH = 'https://graph.facebook.com/v23.0';

async function graphPost(pathname: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(`${GRAPH}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

/**
 * Instagram Reels via the official container flow:
 * create media container -> poll status_code -> publish -> read permalink.
 * `videoUrl` must be a public HTTPS URL (Meta ingests it server-side).
 */
export async function publishInstagram(input: { videoUrl: string; caption: string }): Promise<PublishResult> {
  const igId = optionalSecret('IG_BUSINESS_ACCOUNT_ID');
  const token = optionalSecret('IG_LONG_LIVED_ACCESS_TOKEN');
  if (!igId || !token) {
    return { platform: 'instagram', ok: true, dryRun: true, payload: { media_type: 'REELS', video_url: input.videoUrl, caption: input.caption.slice(0, 200) } };
  }
  try {
    const container = await graphPost(`/${igId}/media`, {
      media_type: 'REELS',
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: 'true',
      access_token: token,
    });
    const creationId = container.id as string;
    let status = 'IN_PROGRESS';
    for (let i = 0; i < 20 && status !== 'FINISHED'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const res = await fetch(`${GRAPH}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
      const json = (await res.json()) as { status_code?: string; status?: string };
      status = json.status_code ?? 'IN_PROGRESS';
      if (status === 'ERROR') throw new Error(`Instagram container error: ${json.status ?? 'unknown'}`);
    }
    if (status !== 'FINISHED') throw new Error(`Instagram container not ready after polling (last status: ${status})`);
    const published = await graphPost(`/${igId}/media_publish`, { creation_id: creationId, access_token: token });
    const mediaId = published.id as string;
    let url: string | undefined;
    try {
      const permalink = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`);
      url = ((await permalink.json()) as { permalink?: string }).permalink;
    } catch {
      url = undefined;
    }
    return { platform: 'instagram', ok: true, dryRun: false, id: mediaId, url };
  } catch (error) {
    return { platform: 'instagram', ok: false, dryRun: false, error: error instanceof Error ? error.message.slice(0, 400) : 'unknown' };
  }
}

const LINKEDIN_VERSION = '202610';

function linkedInHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
}

export async function publishLinkedIn(input: { text: string; videoPath?: string; title?: string }): Promise<PublishResult> {
  const token = optionalSecret('LINKEDIN_ACCESS_TOKEN');
  const author = optionalSecret('LINKEDIN_AUTHOR_URN');
  if (!token || !author) {
    return { platform: 'linkedin', ok: true, dryRun: true, payload: { author: author ?? 'urn:li:person:<set LINKEDIN_AUTHOR_URN>', commentary: input.text.slice(0, 300) } };
  }
  try {
    let mediaUrn: string | undefined;
    if (input.videoPath) {
      const init = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
        method: 'POST',
        headers: linkedInHeaders(token),
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const initJson = (await init.json()) as { value?: { uploadInstructions?: { uploadUrl: string }[]; video?: string } };
      if (!init.ok || !initJson.value?.uploadInstructions?.[0]) throw new Error(`LinkedIn init failed: ${JSON.stringify(initJson).slice(0, 240)}`);
      const uploadUrl = initJson.value.uploadInstructions[0].uploadUrl;
      mediaUrn = initJson.value.video;
      const bytes = readFileSync(input.videoPath);
      const upload = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes });
      if (!upload.ok) throw new Error(`LinkedIn video upload failed: HTTP ${upload.status}`);
    }
    const body: Record<string, unknown> = {
      author,
      commentary: input.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED' },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (mediaUrn) body.content = { media: { id: mediaUrn, title: input.title ?? 'Signhify OmniGTM' } };
    const res = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: linkedInHeaders(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`LinkedIn post failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const id = res.headers.get('x-restli-id') ?? undefined;
    return { platform: 'linkedin', ok: true, dryRun: false, id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
  } catch (error) {
    return { platform: 'linkedin', ok: false, dryRun: false, error: error instanceof Error ? error.message.slice(0, 400) : 'unknown' };
  }
}

async function youtubeAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireSecret('YOUTUBE_CLIENT_ID'),
      client_secret: requireSecret('YOUTUBE_CLIENT_SECRET'),
      refresh_token: requireSecret('YOUTUBE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`YouTube token refresh failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('YouTube token refresh returned no access_token');
  return json.access_token;
}

/**
 * Resumable upload with the synthetic-media disclosure required by YouTube's
 * altered-content policy. Unverified projects may still land as private.
 */
export async function publishYouTube(input: {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
}): Promise<PublishResult> {
  const configured = optionalSecret('YOUTUBE_CLIENT_ID') && optionalSecret('YOUTUBE_CLIENT_SECRET') && optionalSecret('YOUTUBE_REFRESH_TOKEN');
  const snippet = {
    title: input.title.slice(0, 100),
    description: input.description.slice(0, 4800),
    tags: (input.tags ?? []).slice(0, 15),
    categoryId: '28',
  };
  const status = { privacyStatus: input.privacyStatus ?? 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true };
  if (!configured) {
    return { platform: 'youtube', ok: true, dryRun: true, payload: { snippet, status } };
  }
  try {
    const token = await youtubeAccessToken();
    const bytes = readFileSync(input.videoPath);
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(bytes.length),
      },
      body: JSON.stringify({ snippet, status }),
    });
    if (!init.ok) throw new Error(`YouTube init failed: HTTP ${init.status} ${(await init.text()).slice(0, 240)}`);
    const location = init.headers.get('location');
    if (!location) throw new Error('YouTube did not return a resumable upload URL');
    const upload = await fetch(location, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) }, body: bytes });
    if (!upload.ok) throw new Error(`YouTube upload failed: HTTP ${upload.status}`);
    const json = (await upload.json()) as { id?: string };
    return { platform: 'youtube', ok: true, dryRun: false, id: json.id, url: json.id ? `https://youtu.be/${json.id}` : undefined };
  } catch (error) {
    return { platform: 'youtube', ok: false, dryRun: false, error: error instanceof Error ? error.message.slice(0, 400) : 'unknown' };
  }
}

/** Comment-to-DM private reply. Idempotency is enforced by the caller's comment log. */
export async function sendInstagramPrivateReply(input: { commentId: string; message: string }): Promise<{ ok: boolean; dryRun: boolean; error?: string }> {
  const token = optionalSecret('IG_LONG_LIVED_ACCESS_TOKEN');
  const igId = optionalSecret('IG_BUSINESS_ACCOUNT_ID');
  if (!token || !igId) return { ok: true, dryRun: true };
  try {
    const res = await fetch(`${GRAPH}/${igId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: input.commentId }, message: { text: input.message }, access_token: token }),
    });
    if (!res.ok) throw new Error(`Private reply failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return { ok: true, dryRun: false };
  } catch (error) {
    return { ok: false, dryRun: false, error: error instanceof Error ? error.message : 'unknown' };
  }
}
