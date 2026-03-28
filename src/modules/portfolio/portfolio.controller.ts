import { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { listChannelVideoThumbnails } from '../../lib/youtube';
import {
  listPortfolio,
  getPortfolioById,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  PORTFOLIO_CATEGORIES,
  ASPECT_CLASSES,
} from './portfolio.service';

/** Matches frontend CreatePortfolioBody: required category, imageUrl; optional title, aspectClass, width, height */
const createSchema = z.object({
  title: z.string().optional(),
  category: z.enum(PORTFOLIO_CATEGORIES as unknown as [string, ...string[]]),
  imageUrl: z.string().min(1),
  aspectClass: z.enum(ASPECT_CLASSES as unknown as [string, ...string[]]).optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  clientId: z.union([z.string().min(1), z.null()]).optional(),
  youtubeVideoId: z.string().min(1).optional(),
});

const youtubeThumbnailsSchema = z.object({
  channelUrl: z.string().min(1),
  clientId: z.union([z.string().min(1), z.null()]).optional(),
  maxResults: z.coerce.number().int().min(1).max(200).optional(),
  dryRun: z.boolean().optional(),
});

/** All fields optional for PATCH; title may be empty string to clear */
const updateSchema = z.object({
  title: z.string().optional(),
  category: z.enum(PORTFOLIO_CATEGORIES as unknown as [string, ...string[]]).optional(),
  imageUrl: z.string().optional(),
  aspectClass: z.enum(ASPECT_CLASSES as unknown as [string, ...string[]]).optional(),
  width: z.coerce.number().int().positive().optional().nullable(),
  height: z.coerce.number().int().positive().optional().nullable(),
  clientId: z.union([z.string().min(1), z.null()]).optional(),
});

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0]! : id;
}

export async function getAll(req: Request, res: Response) {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
  const clientSlug = typeof req.query.clientSlug === 'string' ? req.query.clientSlug : undefined;
  const items = await listPortfolio({ clientId, clientSlug });
  res.json(items);
}

export async function getById(req: Request, res: Response) {
  const item = await getPortfolioById(paramId(req));
  if (!item) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(item);
}

export async function create(req: Request, res: Response) {
  const raw = req.body ?? {};
  const body = createSchema.parse(raw);
  try {
    const item = await createPortfolio({
      title: body.title ?? undefined,
      category: body.category,
      imageUrl: body.imageUrl,
      aspectClass: body.aspectClass,
      width: body.width,
      height: body.height,
      clientId: body.clientId === undefined ? undefined : body.clientId,
      youtubeVideoId: body.youtubeVideoId,
    });
    res.status(201).json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bad request';
    if (msg === 'Invalid clientId') {
      res.status(400).json({ error: msg });
      return;
    }
    throw e;
  }
}

export async function update(req: Request, res: Response) {
  const raw = req.body ?? {};
  const body = updateSchema.parse(raw);
  try {
    const item = await updatePortfolio(paramId(req), {
      title: body.title === '' ? undefined : body.title,
      category: body.category,
      imageUrl: body.imageUrl,
      aspectClass: body.aspectClass,
      width: body.width ?? undefined,
      height: body.height ?? undefined,
      clientId: body.clientId,
    });
    res.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bad request';
    if (msg === 'Invalid clientId') {
      res.status(400).json({ error: msg });
      return;
    }
    throw e;
  }
}

export async function remove(req: Request, res: Response) {
  await deletePortfolio(paramId(req));
  res.status(204).send();
}

/**
 * POST /portfolio/youtube-thumbnails (admin)
 * dryRun: true → list video thumbnails only; false → create portfolio items (Thumbnails, 16:9).
 */
export async function youtubeThumbnails(req: Request, res: Response) {
  const body = youtubeThumbnailsSchema.parse(req.body ?? {});
  const apiKey = config.youtubeApiKey;
  if (!apiKey) {
    res.status(503).json({ error: 'YouTube API key is not configured. Set GOOGLE_YOUTUBE_API_KEY.' });
    return;
  }

  const maxResults = body.maxResults ?? 50;
  let clientId: string | null | undefined = body.clientId === undefined ? undefined : body.clientId;

  if (clientId) {
    const c = await prisma.client.findUnique({ where: { id: clientId } });
    if (!c) {
      res.status(400).json({ error: 'Invalid clientId' });
      return;
    }
  }

  const data = await listChannelVideoThumbnails(body.channelUrl.trim(), apiKey, { maxResults });

  if (body.dryRun === true) {
    res.json({
      dryRun: true,
      channelId: data.channelId,
      channelTitle: data.channelTitle,
      channelUrl: data.channelUrl,
      videos: data.videos,
    });
    return;
  }

  const created: Awaited<ReturnType<typeof createPortfolio>>[] = [];
  let skipped = 0;

  for (const v of data.videos) {
    const dup = await prisma.portfolio.findUnique({ where: { youtubeVideoId: v.videoId } });
    if (dup) {
      skipped++;
      continue;
    }
    try {
      const item = await createPortfolio({
        title: v.title,
        category: 'Thumbnails',
        imageUrl: v.thumbnailUrl,
        aspectClass: 'wide',
        width: 1280,
        height: 720,
        clientId: clientId ?? null,
        youtubeVideoId: v.videoId,
      });
      created.push(item);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Invalid clientId') {
        res.status(400).json({ error: msg });
        return;
      }
      skipped++;
    }
  }

  res.status(201).json({
    dryRun: false,
    channelId: data.channelId,
    channelTitle: data.channelTitle,
    channelUrl: data.channelUrl,
    videos: data.videos,
    created,
    skipped,
    imported: created.length,
  });
}
