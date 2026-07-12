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

type SearchPageResponse = {
  items?: Array<{
    id?: { channelId?: string; videoId?: string };
    // For type=video results, the owning channel id is on the snippet.
    snippet?: { channelId?: string };
  }>;
  nextPageToken?: string;
};

type ChannelDetailsResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      country?: string;
      publishedAt?: string;
      thumbnails?: ChannelThumbnails;
    };
    statistics?: {
      subscriberCount?: string;
      videoCount?: string;
      viewCount?: string;
      hiddenSubscriberCount?: boolean;
    };
    brandingSettings?: { channel?: { country?: string } };
  }>;
};

export type ChannelSearchRow = {
  channelId: string;
  channelUrl: string;
  title: string;
  description?: string;
  customUrl?: string;
  country?: string;
  subscriberCount: number | null;
  hiddenSubscribers: boolean;
  videoCount: number | null;
  viewCount: number | null;
  thumbnailUrl?: string;
  email: string | null;
  /** Where the email came from: channel description, or a linked website. */
  emailSource: 'description' | 'website' | null;
  /** True when the channel has a business email set on YouTube (CAPTCHA-gated, address not readable). */
  hasYoutubeEmail: boolean;
  links: string[];
  publishedAt?: string;
};

export type SearchChannelsOptions = {
  query: string;
  regionCode?: string;
  /** search.list order: relevance | viewCount | videoCount | date */
  order?: string;
  /** Number of channels to fetch and enrich before filtering (1–200). */
  maxResults?: number;
  /**
   * Discovery mode:
   * - 'topic' (default): search VIDEOS by keyword and collect owning channels, so channels are
   *   matched by the content they make — not by whether the keyword is in the channel name.
   * - 'name': search channels by name/title only (legacy behaviour).
   * - 'both': merge name matches first, then broaden with topic matches.
   */
  mode?: 'topic' | 'name' | 'both';
  /**
   * When true, for channels without an email in their description, follow their public links
   * (website / linktree) and scrape the site's contact pages for an email. Slower, but greatly
   * increases email coverage. No YouTube quota is used for this — just outbound HTTP.
   */
  deepEmail?: boolean;
};

export type SearchChannelsResult = {
  channels: ChannelSearchRow[];
  /** Rough YouTube Data API quota units spent (search=100/page, channels=1/page). */
  quotaCost: number;
  /** Total unique channel IDs discovered before enrichment. */
  discovered: number;
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_REGEX = /https?:\/\/[^\s<>()"']+/g;

/** Pull the first plausible business email out of a channel description. */
export function extractEmailFromText(text: string | undefined): string | null {
  if (!text) return null;
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;
  for (const raw of matches) {
    const email = raw.trim().replace(/[.,;]+$/, '').toLowerCase();
    // Skip obvious non-contact / example addresses.
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(email)) continue;
    if (/^(example|test|noreply|no-reply)@/.test(email)) continue;
    return email;
  }
  return null;
}

function extractLinks(text: string | undefined): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  const cleaned = matches.map((u) => u.replace(/[.,)]+$/, ''));
  return Array.from(new Set(cleaned)).slice(0, 8);
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchChannelDetails(
  apiKey: string,
  channelIds: string[]
): Promise<{ rows: ChannelSearchRow[]; calls: number }> {
  const rows: ChannelSearchRow[] = [];
  let calls = 0;
  for (let i = 0; i < channelIds.length; i += 50) {
    const chunk = channelIds.slice(i, i + 50);
    if (chunk.length === 0) continue;
    const u = new URL('https://www.googleapis.com/youtube/v3/channels');
    u.searchParams.set('key', apiKey);
    u.searchParams.set('part', 'snippet,statistics,brandingSettings');
    u.searchParams.set('id', chunk.join(','));
    u.searchParams.set('maxResults', '50');
    const data = await fetchJson<ChannelDetailsResponse>(u.toString());
    calls += 1;
    for (const ch of data.items ?? []) {
      const description = ch.snippet?.description?.trim() || undefined;
      const country = ch.snippet?.country || ch.brandingSettings?.channel?.country || undefined;
      rows.push({
        channelId: ch.id,
        channelUrl: toCanonicalChannelUrl(ch.id),
        title: ch.snippet?.title?.trim() || 'YouTube Channel',
        description,
        customUrl: ch.snippet?.customUrl || undefined,
        country: country ? country.toUpperCase() : undefined,
        subscriberCount: ch.statistics?.hiddenSubscriberCount
          ? null
          : toNumberOrNull(ch.statistics?.subscriberCount),
        hiddenSubscribers: Boolean(ch.statistics?.hiddenSubscriberCount),
        videoCount: toNumberOrNull(ch.statistics?.videoCount),
        viewCount: toNumberOrNull(ch.statistics?.viewCount),
        thumbnailUrl: pickThumbnail(ch.snippet?.thumbnails),
        email: extractEmailFromText(description),
        emailSource: extractEmailFromText(description) ? 'description' : null,
        hasYoutubeEmail: false,
        links: extractLinks(description),
        publishedAt: ch.snippet?.publishedAt || undefined,
      });
    }
  }
  return { rows, calls };
}

/** One page of search.list. Returns discovered channel ids (in order) + whether more pages exist. */
async function searchPage(
  apiKey: string,
  params: { type: 'channel' | 'video'; query: string; order: string; regionCode?: string; pageToken?: string }
): Promise<{ channelIds: string[]; nextPageToken?: string }> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('type', params.type);
  u.searchParams.set('maxResults', '50');
  u.searchParams.set('order', params.order);
  u.searchParams.set('q', params.query);
  if (params.regionCode) u.searchParams.set('regionCode', params.regionCode);
  if (params.pageToken) u.searchParams.set('pageToken', params.pageToken);

  const data = await fetchJson<SearchPageResponse>(u.toString());
  const channelIds: string[] = [];
  for (const it of data.items ?? []) {
    // type=channel → id.channelId; type=video → snippet.channelId (the owning channel)
    const id = it.id?.channelId ?? it.snippet?.channelId;
    if (id) channelIds.push(id);
  }
  return { channelIds, nextPageToken: data.nextPageToken };
}

/** Emails that are almost always boilerplate/library/third-party service noise, not a real contact. */
const JUNK_EMAIL_RE = new RegExp(
  [
    'example\\.',
    'yourdomain',
    'domain\\.com',
    'email@',
    'user@',
    'name@',
    '@2x',
    '\\.(png|jpe?g|gif|webp|svg)$',
    // Third-party services / libraries / CDNs that appear in page markup
    '@(sentry|wixpress|geniuslink|geni\\.us|linktr\\.ee|beacons\\.ai|bit\\.ly|mailchimp|mailerlite',
    '|shopify|squarespace|godaddy|wordpress|wix|weebly|cloudflare|google|gstatic|schema\\.org',
    '|w3\\.org|gmpg\\.org|sentry\\.io|stripe|paypal|facebook|instagram|youtube|tiktok)\\.',
  ].join(''),
  'i'
);

const EMAIL_EXACT_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function isUsableEmail(email: string): boolean {
  if (!EMAIL_EXACT_RE.test(email)) return false;
  if (JUNK_EMAIL_RE.test(email)) return false;
  if (email.length > 100) return false;
  return true;
}

/** Fetch a URL as text with a hard timeout; returns null on any failure or non-HTML. */
async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 6000,
  extraHeaders?: Record<string, string>
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html') && !ct.includes('text/plain')) return null;
    const text = await res.text();
    // Cap parsing work for very large pages.
    return text.slice(0, 800_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the first usable email from an HTML string, preferring explicit mailto: links. */
function emailFromHtml(html: string): string | null {
  const mailto = html.match(/mailto:([^"'?>\s]+)/gi) || [];
  for (const m of mailto) {
    const e = decodeURIComponent(m.slice(7)).trim().toLowerCase();
    if (isUsableEmail(e)) return e;
  }
  const generic = html.match(EMAIL_REGEX) || [];
  for (const raw of generic) {
    const e = raw.trim().replace(/[.,;]+$/, '').toLowerCase();
    if (isUsableEmail(e)) return e;
  }
  return null;
}

/**
 * Given a channel's public links, visit the site (and common contact pages) and scrape an email.
 * Best-effort: bounded to a few requests per channel with short timeouts.
 */
async function scrapeEmailFromLinks(links: string[]): Promise<string | null> {
  const origins: string[] = [];
  const candidateUrls: string[] = [];
  const seenOrigin = new Set<string>();

  for (const link of links.slice(0, 3)) {
    try {
      const u = new URL(link);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      // Skip social platforms — they rarely expose a scrapable email and waste time.
      if (/(youtube\.com|youtu\.be|instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|t\.me|discord\.)/i.test(u.hostname)) {
        continue;
      }
      const origin = u.origin;
      if (!seenOrigin.has(origin)) {
        seenOrigin.add(origin);
        origins.push(origin);
      }
      candidateUrls.push(link);
    } catch {
      /* ignore malformed link */
    }
  }

  for (const origin of origins.slice(0, 2)) {
    for (const path of ['', '/contact', '/contact-us', '/about']) {
      candidateUrls.push(`${origin}${path}`);
    }
  }

  const tried = new Set<string>();
  for (const url of candidateUrls) {
    if (tried.has(url)) continue;
    tried.add(url);
    if (tried.size > 6) break; // hard cap on requests per channel
    const html = await fetchTextWithTimeout(url);
    if (!html) continue;
    const email = emailFromHtml(html);
    if (email) return email;
  }
  return null;
}

/** Run an async worker over items with bounded concurrency. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  });
  await Promise.all(runners);
}

/**
 * Discover channels by keyword/niche, then enrich each result with statistics
 * (subscribers/videos/views), country, thumbnail, and any email found in the public description.
 *
 * By default (mode 'topic') this searches VIDEOS for the keyword and collects the channels that
 * publish that content, so a search like "hvac" surfaces channels making HVAC videos even when
 * the keyword is not in the channel name. Use mode 'name' for legacy name-only matching.
 *
 * Quota-aware: each search page costs 100 units (50 results), each channels.list page 1 unit.
 */
export async function searchChannels(
  apiKey: string,
  options: SearchChannelsOptions
): Promise<SearchChannelsResult> {
  if (!apiKey.trim()) {
    throw new Error('YouTube API key is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }
  const query = options.query.trim();
  if (!query) {
    throw new Error('Search query is required.');
  }

  const target = Math.min(Math.max(options.maxResults ?? 25, 1), 200);
  const order = ['relevance', 'viewCount', 'videoCount', 'date'].includes(options.order ?? '')
    ? (options.order as string)
    : 'relevance';
  const mode = options.mode ?? 'topic';

  const channelIds: string[] = [];
  const seen = new Set<string>();
  let quotaCost = 0;

  const addIds = (ids: string[]) => {
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        channelIds.push(id);
      }
    }
  };

  // 1) Optional name matches first (exact/brand-name relevance).
  if (mode === 'name' || mode === 'both') {
    let pageToken: string | undefined;
    const namePages = Math.min(Math.ceil(target / 50), 4);
    for (let page = 0; page < namePages && channelIds.length < target; page += 1) {
      const { channelIds: ids, nextPageToken } = await searchPage(apiKey, {
        type: 'channel',
        query,
        order,
        regionCode: options.regionCode,
        pageToken,
      });
      quotaCost += 100;
      addIds(ids);
      pageToken = nextPageToken;
      if (!pageToken) break;
    }
  }

  // 2) Topic/keyword matches via video search — collect the owning channels (default path).
  //    Video results repeat channels, so we page a bit further to reach the target count.
  if (mode === 'topic' || mode === 'both') {
    let pageToken: string | undefined;
    const videoPages = Math.min(Math.ceil(target / 15) + 1, 6);
    for (let page = 0; page < videoPages && channelIds.length < target; page += 1) {
      const { channelIds: ids, nextPageToken } = await searchPage(apiKey, {
        type: 'video',
        query,
        order,
        regionCode: options.regionCode,
        pageToken,
      });
      quotaCost += 100;
      addIds(ids);
      pageToken = nextPageToken;
      if (!pageToken) break;
    }
  }

  const discovered = channelIds.length;
  const { rows, calls } = await fetchChannelDetails(apiKey, channelIds.slice(0, target));
  quotaCost += calls;

  // Deep email: for channels with no description email, scrape their linked websites.
  if (options.deepEmail) {
    await deepEmailEnrich(rows);
  }

  return { channels: rows, quotaCost, discovered };
}

/**
 * Detect whether a channel has a business email set on YouTube (the CAPTCHA-gated "View email
 * address" button). The address itself is not readable, but its presence is a strong outreach
 * signal. Marker verified against live About pages: `signInForBusinessEmail` in ytInitialData.
 */
async function channelHasBusinessEmail(channelId: string): Promise<boolean> {
  const url = `https://www.youtube.com/channel/${channelId}/about?hl=en&gl=US`;
  // Retry once on an empty/failed fetch: YouTube occasionally throttles, and a missed page
  // would otherwise be reported as "no business email" (false negative).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const html = await fetchTextWithTimeout(url, 7000, { cookie: 'CONSENT=YES+1; SOCS=CAI' });
    if (html) {
      return html.includes('signInForBusinessEmail');
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * For rows without an email, (1) scrape their linked websites for a real address, and
 * (2) detect whether they have a YouTube business email button. Mutates rows in place.
 */
async function deepEmailEnrich(rows: ChannelSearchRow[]): Promise<void> {
  const needsEmail = rows.filter((r) => !r.email);
  // Lower concurrency keeps YouTube from throttling the About-page checks (which caused
  // channels with a real business email to be missed and shown as "No email").
  await runWithConcurrency(needsEmail, 4, async (row) => {
    // 1) A business email on YouTube is collected manually (CAPTCHA-gated), so if one exists
    //    we flag it and skip website scraping entirely — no point scraping.
    row.hasYoutubeEmail = await channelHasBusinessEmail(row.channelId);
    if (row.hasYoutubeEmail) return;
    // 2) Otherwise try to auto-collect a real address from the channel's linked website.
    if (row.links.length > 0) {
      const email = await scrapeEmailFromLinks(row.links);
      if (email) {
        row.email = email;
        row.emailSource = 'website';
      }
    }
  });
}

/**
 * Resolve a set of channel ids to enriched rows (description email + links), optionally scraping
 * their websites for missing emails. Used by lead-enrichment automation (no search step).
 */
export async function enrichChannelsByIds(
  apiKey: string,
  channelIds: string[],
  options?: { deepEmail?: boolean }
): Promise<{ channels: ChannelSearchRow[]; quotaCost: number }> {
  if (!apiKey.trim()) {
    throw new Error('YouTube API key is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }
  const unique = Array.from(new Set(channelIds.filter(Boolean)));
  if (unique.length === 0) return { channels: [], quotaCost: 0 };

  const { rows, calls } = await fetchChannelDetails(apiKey, unique);
  if (options?.deepEmail !== false) {
    await deepEmailEnrich(rows);
  }
  return { channels: rows, quotaCost: calls };
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

/**
 * Fetch the titles of a channel's most recent uploads. Used to give the campaign AI real signal
 * about what a channel actually makes (deep analysis). Returns [] on any failure — never throws.
 */
export async function getRecentVideoTitles(
  apiKey: string,
  channelId: string,
  max = 8
): Promise<string[]> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('type', 'video');
  u.searchParams.set('order', 'date');
  u.searchParams.set('channelId', channelId);
  u.searchParams.set('maxResults', String(Math.min(Math.max(max, 1), 25)));
  try {
    const data = await fetchJson<{ items?: Array<{ snippet?: { title?: string } }> }>(u.toString());
    const titles: string[] = [];
    for (const it of data.items ?? []) {
      const t = it.snippet?.title?.trim();
      if (t) titles.push(t);
    }
    return titles;
  } catch {
    return [];
  }
}
