/**
 * Resolve YouTube channel metadata from a channel URL using YouTube Data API v3.
 * Requires GOOGLE_YOUTUBE_API_KEY (or YOUTUBE_API_KEY).
 */

export type YoutubeChannelResolved = {
  channelId: string;
  channelUrl: string;
  title: string;
  description?: string;
  subscriberCount?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
};

type ChannelThumbnails = {
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
};

type YoutubeChannelsResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: ChannelThumbnails;
    };
    statistics?: { subscriberCount?: string };
    brandingSettings?: { image?: { bannerExternalUrl?: string } };
  }>;
};

type YoutubeSearchResponse = {
  items?: Array<{
    id?: { channelId?: string };
    snippet?: { channelId?: string };
  }>;
};

function normalizeYoutubeInput(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return new URL(s);
}

type Parsed =
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'username'; value: string }
  | { kind: 'searchQuery'; value: string };

/** Parse common YouTube channel URL shapes into an API lookup strategy. */
export function parseYoutubeChannelUrl(input: string): Parsed | null {
  let url: URL;
  try {
    url = normalizeYoutubeInput(input);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'channel' && segments[1]?.startsWith('UC')) {
    return { kind: 'id', value: segments[1] };
  }

  if (segments[0]?.startsWith('@')) {
    return { kind: 'handle', value: segments[0].slice(1) };
  }

  if (segments[0] === 'user' && segments[1]) {
    return { kind: 'username', value: segments[1] };
  }

  if (segments[0] === 'c' && segments[1]) {
    return { kind: 'searchQuery', value: segments[1] };
  }

  // Legacy: youtube.com/CustomName
  if (segments.length === 1 && segments[0] && !segments[0].startsWith('@')) {
    return { kind: 'searchQuery', value: segments[0] };
  }

  return null;
}

function pickThumbnail(thumbs: ChannelThumbnails | undefined): string | undefined {
  if (!thumbs) return undefined;
  return thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function channelsList(apiKey: string, params: Record<string, string>): Promise<YoutubeChannelsResponse> {
  const u = new URL('https://www.googleapis.com/youtube/v3/channels');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('part', 'snippet,statistics,brandingSettings');
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return fetchJson<YoutubeChannelsResponse>(u.toString());
}

async function searchChannelId(apiKey: string, query: string): Promise<string | null> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('type', 'channel');
  u.searchParams.set('maxResults', '5');
  u.searchParams.set('q', query);
  const data = await fetchJson<YoutubeSearchResponse>(u.toString());
  const first = data.items?.[0];
  const id = first?.id?.channelId ?? first?.snippet?.channelId;
  return id ?? null;
}

function toCanonicalChannelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

export async function resolveYoutubeChannelFromUrl(
  channelUrlInput: string,
  apiKey: string
): Promise<YoutubeChannelResolved> {
  if (!apiKey.trim()) {
    throw new Error('YouTube API key is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }

  const parsed = parseYoutubeChannelUrl(channelUrlInput);
  if (!parsed) {
    throw new Error('Unsupported YouTube channel URL. Use /channel/UC..., /@handle, /user/..., or /c/...');
  }

  let channelId: string | null = null;

  if (parsed.kind === 'id') {
    channelId = parsed.value;
  } else if (parsed.kind === 'handle') {
    const data = await channelsList(apiKey, { forHandle: parsed.value });
    channelId = data.items?.[0]?.id ?? null;
  } else if (parsed.kind === 'username') {
    const data = await channelsList(apiKey, { forUsername: parsed.value });
    channelId = data.items?.[0]?.id ?? null;
  } else {
    channelId = await searchChannelId(apiKey, parsed.value);
  }

  if (!channelId) {
    throw new Error('Channel not found for this URL. Check the link or try the /channel/UC... form.');
  }

  const full = await channelsList(apiKey, { id: channelId });
  const ch = full.items?.[0];
  if (!ch) {
    throw new Error('Channel details could not be loaded.');
  }

  const subs = ch.statistics?.subscriberCount;
  const subscriberCount =
    subs !== undefined && subs !== null ? Number(subs).toLocaleString('en-US') : undefined;

  return {
    channelId: ch.id,
    channelUrl: toCanonicalChannelUrl(ch.id),
    title: ch.snippet?.title?.trim() || 'YouTube Channel',
    description: ch.snippet?.description?.trim() || undefined,
    subscriberCount,
    thumbnailUrl: pickThumbnail(ch.snippet?.thumbnails),
    bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl || undefined,
  };
}

type ChannelContentResponse = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
};

type PlaylistItemsResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
      resourceId?: { videoId?: string };
      thumbnails?: {
        maxres?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
  nextPageToken?: string;
};

export type YoutubeVideoThumbnail = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
};

/** Parse ISO 8601 duration e.g. PT1M30S → 90 */
function parseIso8601Duration(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

type VideoSnippetForFilter = {
  title?: string;
  description?: string;
  tags?: string[];
  thumbnails?: {
    default?: { width?: number; height?: number };
    medium?: { width?: number; height?: number };
    high?: { width?: number; height?: number };
  };
};

/** Skip YouTube Shorts / Reels-style uploads (portfolio wants main video thumbnails only). */
export function isShortOrReelVideo(
  snippet: VideoSnippetForFilter | undefined,
  durationSec: number
): boolean {
  if (!snippet) return true;
  const title = (snippet.title || '').trim();
  const desc = (snippet.description || '').slice(0, 2000);
  const combined = `${title}\n${desc}`.toLowerCase();

  if (combined.includes('#shorts')) return true;
  if (/\b#\s*shorts\b/.test(combined)) return true;
  if (/\b#\s*short\b/.test(combined)) return true;
  if (/\breels?\b/i.test(title)) return true;

  const tags = snippet.tags || [];
  for (const t of tags) {
    const x = t.toLowerCase();
    if (x === 'shorts' || x === 'short') return true;
  }

  const pickDims = () => {
    const d = snippet.thumbnails?.default;
    const m = snippet.thumbnails?.medium;
    const h = snippet.thumbnails?.high;
    const cand = d?.width && d?.height ? d : m?.width && m?.height ? m : h?.width && h?.height ? h : null;
    return cand ? { w: cand.width!, h: cand.height! } : null;
  };
  const dims = pickDims();
  const vertical = dims && dims.h > dims.w * 1.05;
  if (vertical && durationSec > 0 && durationSec <= 60) return true;

  return false;
}

type VideosListResponse = {
  items?: Array<{
    id: string;
    snippet?: VideoSnippetForFilter;
    contentDetails?: { duration?: string };
  }>;
};

async function fetchVideosDetails(
  apiKey: string,
  videoIds: string[]
): Promise<Map<string, { snippet?: VideoSnippetForFilter; durationSec: number }>> {
  const map = new Map<string, { snippet?: VideoSnippetForFilter; durationSec: number }>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    if (chunk.length === 0) continue;
    const u = new URL('https://www.googleapis.com/youtube/v3/videos');
    u.searchParams.set('key', apiKey);
    u.searchParams.set('part', 'snippet,contentDetails');
    u.searchParams.set('id', chunk.join(','));
    const data = await fetchJson<VideosListResponse>(u.toString());
    for (const it of data.items ?? []) {
      const durationSec = parseIso8601Duration(it.contentDetails?.duration || '');
      map.set(it.id, { snippet: it.snippet, durationSec });
    }
  }
  return map;
}

/**
 * List videos on a channel’s uploads playlist (newest first), up to maxResults (capped at 200).
 * Uses YouTube Data API: channels (contentDetails) + playlistItems + videos (filter out Shorts/Reels).
 */
export async function listChannelVideoThumbnails(
  channelUrlInput: string,
  apiKey: string,
  options?: { maxResults?: number }
): Promise<{
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  videos: YoutubeVideoThumbnail[];
}> {
  if (!apiKey.trim()) {
    throw new Error('YouTube API key is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }

  const resolved = await resolveYoutubeChannelFromUrl(channelUrlInput, apiKey);
  const channelId = resolved.channelId;

  const u = new URL('https://www.googleapis.com/youtube/v3/channels');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('part', 'contentDetails,snippet');
  u.searchParams.set('id', channelId);
  const chData = await fetchJson<ChannelContentResponse>(u.toString());
  const ch = chData.items?.[0];
  const uploadsPlaylistId = ch?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error('Could not find uploads playlist for this channel.');
  }
  const channelTitle = ch?.snippet?.title?.trim() || resolved.title;

  const maxTotal = Math.min(Math.max(options?.maxResults ?? 50, 1), 200);
  const videos: YoutubeVideoThumbnail[] = [];
  let pageToken: string | undefined;

  while (videos.length < maxTotal) {
    const pu = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    pu.searchParams.set('key', apiKey);
    pu.searchParams.set('part', 'snippet,contentDetails');
    pu.searchParams.set('playlistId', uploadsPlaylistId);
    pu.searchParams.set('maxResults', '50');
    if (pageToken) {
      pu.searchParams.set('pageToken', pageToken);
    }

    const plData = await fetchJson<PlaylistItemsResponse>(pu.toString());
    const items = plData.items ?? [];
    if (items.length === 0) break;

    const batch: YoutubeVideoThumbnail[] = [];
    const ids: string[] = [];
    for (const it of items) {
      const vid = it.snippet?.resourceId?.videoId;
      if (!vid) continue;
      const title = it.snippet?.title?.trim() || 'Video';
      const thumbs = it.snippet?.thumbnails;
      const thumbnailUrl =
        thumbs?.maxres?.url ||
        thumbs?.high?.url ||
        thumbs?.medium?.url ||
        thumbs?.default?.url ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      batch.push({ videoId: vid, title, thumbnailUrl });
      ids.push(vid);
    }

    const details = await fetchVideosDetails(apiKey, ids);

    for (const row of batch) {
      if (videos.length >= maxTotal) break;
      const d = details.get(row.videoId);
      if (!d) continue;
      if (isShortOrReelVideo(d.snippet, d.durationSec)) continue;
      videos.push(row);
    }

    pageToken = plData.nextPageToken;
    if (!pageToken) break;
  }

  return {
    channelId,
    channelTitle,
    channelUrl: resolved.channelUrl,
    videos,
  };
}
