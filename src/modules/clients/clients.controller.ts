import { Request, Response } from 'express';
import { z } from 'zod';
import {
  listClients,
  getClientById,
  getClientBySlug,
  createClient,
  updateClient,
  deleteClient,
} from './clients.service';
import { config } from '../../config';
import { uploadRemoteUrlToCloudinary } from '../../lib/cloudinary-upload';
import { resolveYoutubeChannelFromUrl } from '../../lib/youtube';

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const createSchema = z.object({
  channelName: z.string().min(1),
  channelUrl: z.string().url(),
  imageUrl: z.string().min(1),
  logoUrl: z.string().min(1).optional(),
  subscriberCount: z.string().optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  slug: z.string().min(1).optional(),
});

const updateSchema = z.object({
  channelName: z.string().min(1).optional(),
  channelUrl: z.string().url().optional(),
  imageUrl: z.string().min(1).optional(),
  logoUrl: z.string().min(1).optional(),
  subscriberCount: z.string().optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  slug: z.string().min(1).optional(),
});

const resolveYoutubeSchema = z.object({
  channelUrl: z.string().min(1),
});

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0]! : id;
}

function paramSlug(req: Request): string {
  const s = req.params.slug;
  return Array.isArray(s) ? s[0]! : s;
}

export async function getAll(_req: Request, res: Response) {
  const items = await listClients();
  res.json(items);
}

export async function getBySlug(req: Request, res: Response) {
  const item = await getClientBySlug(paramSlug(req));
  if (!item) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(item);
}

export async function getById(req: Request, res: Response) {
  const item = await getClientById(paramId(req));
  if (!item) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(item);
}

export async function create(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  try {
    const item = await createClient(body);
    res.status(201).json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bad request';
    if (msg === 'Not found') {
      res.status(400).json({ error: msg });
      return;
    }
    throw e;
  }
}

export async function update(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  try {
    const item = await updateClient(paramId(req), body);
    res.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bad request';
    if (msg === 'slug cannot be empty' || msg === 'Not found') {
      res.status(400).json({ error: msg });
      return;
    }
    throw e;
  }
}

export async function remove(req: Request, res: Response) {
  await deleteClient(paramId(req));
  res.status(204).send();
}

/**
 * POST /clients/resolve-youtube
 * Admin-only. Fetches channel title, subscriber count, and uploads logo + banner to Cloudinary.
 */
export async function resolveYoutube(req: Request, res: Response) {
  const body = resolveYoutubeSchema.parse(req.body ?? {});
  const apiKey = config.youtubeApiKey;
  if (!apiKey) {
    throw httpError(503, 'YouTube resolver is not configured. Set GOOGLE_YOUTUBE_API_KEY.');
  }

  const resolved = await resolveYoutubeChannelFromUrl(body.channelUrl, apiKey);

  let logoUrl: string | undefined;
  let imageUrl: string | undefined;

  if (resolved.thumbnailUrl) {
    try {
      logoUrl = await uploadRemoteUrlToCloudinary(resolved.thumbnailUrl, 'branddox/clients/logos');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Logo upload failed';
      throw httpError(502, `Could not upload channel logo to Cloudinary: ${msg}`);
    }
  }

  const bannerCandidate = resolved.bannerUrl || resolved.thumbnailUrl;
  if (bannerCandidate) {
    try {
      imageUrl =
        bannerCandidate === resolved.thumbnailUrl && logoUrl
          ? logoUrl
          : await uploadRemoteUrlToCloudinary(bannerCandidate, 'branddox/clients/banners');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Banner upload failed';
      throw httpError(502, `Could not upload channel banner to Cloudinary: ${msg}`);
    }
  }

  if (!logoUrl || !imageUrl) {
    throw httpError(502, 'Could not resolve channel images from YouTube.');
  }

  res.json({
    channelName: resolved.title,
    channelUrl: resolved.channelUrl,
    subscriberCount: resolved.subscriberCount,
    description: resolved.description,
    logoUrl,
    imageUrl,
  });
}
