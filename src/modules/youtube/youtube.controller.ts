import { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { searchChannels, enrichChannelsByIds, type ChannelSearchRow } from '../../lib/youtube';
import {
  saveChannelLeads,
  listLeadsMissingEmail,
  setLeadEmail,
} from '../leads/leads.service';

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const searchSchema = z.object({
  query: z.string().min(1),
  regionCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'regionCode must be a 2-letter ISO country code')
    .optional(),
  /** Filter results to channels whose country matches (ISO 2-letter). */
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter ISO country code')
    .optional(),
  order: z.enum(['relevance', 'viewCount', 'videoCount', 'date']).optional(),
  minSubscribers: z.coerce.number().int().min(0).optional(),
  maxSubscribers: z.coerce.number().int().min(0).optional(),
  maxResults: z.coerce.number().int().min(1).max(200).optional(),
  onlyWithEmail: z.boolean().optional(),
  mode: z.enum(['topic', 'name', 'both']).optional(),
  deepEmail: z.boolean().optional(),
});

function applyFilters(
  rows: ChannelSearchRow[],
  opts: {
    country?: string;
    minSubscribers?: number;
    maxSubscribers?: number;
    onlyWithEmail?: boolean;
  }
): ChannelSearchRow[] {
  const country = opts.country?.toUpperCase();
  return rows.filter((r) => {
    if (country && r.country !== country) return false;
    if (opts.onlyWithEmail && !r.email) return false;
    if (opts.minSubscribers !== undefined) {
      if (r.subscriberCount === null || r.subscriberCount < opts.minSubscribers) return false;
    }
    if (opts.maxSubscribers !== undefined) {
      if (r.subscriberCount === null || r.subscriberCount > opts.maxSubscribers) return false;
    }
    return true;
  });
}

/**
 * POST /youtube/search-channels (admin)
 * Playboard-style channel discovery: keyword + region + subscriber range + email filter.
 */
export async function searchChannelsHandler(req: Request, res: Response) {
  const body = searchSchema.parse(req.body ?? {});
  const apiKey = config.youtubeApiKey;
  if (!apiKey) {
    throw httpError(503, 'YouTube search is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }

  if (
    body.minSubscribers !== undefined &&
    body.maxSubscribers !== undefined &&
    body.minSubscribers > body.maxSubscribers
  ) {
    throw httpError(400, 'minSubscribers cannot be greater than maxSubscribers.');
  }

  const result = await searchChannels(apiKey, {
    query: body.query,
    regionCode: body.regionCode ?? body.country,
    order: body.order,
    maxResults: body.maxResults,
    mode: body.mode,
    // Scanning linked sites is required for "only with email" to be meaningful.
    deepEmail: body.deepEmail || body.onlyWithEmail,
  });

  const filtered = applyFilters(result.channels, {
    country: body.country,
    minSubscribers: body.minSubscribers,
    maxSubscribers: body.maxSubscribers,
    onlyWithEmail: body.onlyWithEmail,
  });

  res.json({
    channels: filtered,
    total: filtered.length,
    discovered: result.discovered,
    enriched: result.channels.length,
    withEmail: filtered.filter((c) => c.email).length,
    withYoutubeEmail: filtered.filter((c) => !c.email && c.hasYoutubeEmail).length,
    quotaCost: result.quotaCost,
  });
}

const saveLeadsSchema = z.object({
  leadSource: z.string().min(1).optional(),
  channels: z
    .array(
      z.object({
        channelId: z.string().min(1).optional(),
        channelUrl: z.string().url(),
        title: z.string().optional(),
        email: z.string().email().optional().nullable(),
        subscriberCount: z.union([z.number(), z.string()]).optional().nullable(),
        country: z.string().optional().nullable(),
        thumbnailUrl: z.string().optional().nullable(),
      })
    )
    .min(1),
});

/**
 * POST /youtube/save-leads (admin)
 * Bulk-save selected channels as leads. Deduped by channelId (or channelUrl).
 */
export async function saveLeadsHandler(req: Request, res: Response) {
  const body = saveLeadsSchema.parse(req.body ?? {});
  const leadSource = body.leadSource?.trim() || 'youtube_search';

  const result = await saveChannelLeads(
    body.channels.map((c) => ({
      channelId: c.channelId ?? null,
      channelUrl: c.channelUrl,
      name: c.title ?? null,
      email: c.email ?? null,
      subscriberCount:
        c.subscriberCount === null || c.subscriberCount === undefined
          ? null
          : String(c.subscriberCount),
      country: c.country ?? null,
      thumbnailUrl: c.thumbnailUrl ?? null,
    })),
    leadSource
  );

  res.status(201).json(result);
}

const enrichLeadsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  deepEmail: z.boolean().optional(),
});

/**
 * POST /youtube/enrich-leads (admin)
 * Find saved leads with no email, re-resolve their channels (description + linked sites),
 * and fill in any email found. This is the automation backbone — can be called manually
 * from the Leads tab or on a schedule (Vercel Cron / n8n).
 */
export async function enrichLeadsHandler(req: Request, res: Response) {
  const body = enrichLeadsSchema.parse(req.body ?? {});
  const apiKey = config.youtubeApiKey;
  if (!apiKey) {
    throw httpError(503, 'YouTube enrichment is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }

  const leads = await listLeadsMissingEmail(body.limit ?? 100);
  const withChannelId = leads.filter((l): l is typeof l & { channelId: string } => Boolean(l.channelId));

  const { channels, quotaCost } = await enrichChannelsByIds(
    apiKey,
    withChannelId.map((l) => l.channelId),
    { deepEmail: body.deepEmail ?? true }
  );

  const emailByChannel = new Map(
    channels.filter((c) => c.email).map((c) => [c.channelId, c.email as string])
  );

  let updated = 0;
  for (const lead of withChannelId) {
    const email = emailByChannel.get(lead.channelId);
    if (email) {
      await setLeadEmail(lead.id, email);
      updated += 1;
    }
  }

  res.json({
    scanned: leads.length,
    withChannelId: withChannelId.length,
    updated,
    stillMissing: leads.length - updated,
    quotaCost,
  });
}
