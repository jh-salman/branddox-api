import { prisma } from '../../lib/prisma';

const PORTFOLIO_CATEGORIES = ['Thumbnails', 'Logo', 'Art/Banner', 'Brand Kit'] as const;
const ASPECT_CLASSES = ['tall', 'square', 'wide', 'xtall'] as const;

export { PORTFOLIO_CATEGORIES, ASPECT_CLASSES };

export interface CreatePortfolioInput {
  title?: string;
  category: string;
  imageUrl: string;
  aspectClass?: string;
  width?: number;
  height?: number;
  clientId?: string | null;
  youtubeVideoId?: string | null;
}

export interface UpdatePortfolioInput {
  title?: string;
  category?: string;
  imageUrl?: string;
  aspectClass?: string;
  width?: number;
  height?: number;
  clientId?: string | null;
}

function mapRow(row: {
  id: string;
  title: string | null;
  category: string;
  imageUrl: string;
  aspectClass: string;
  width: number | null;
  height: number | null;
  clientId: string | null;
  youtubeVideoId: string | null;
}) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    imageUrl: row.imageUrl,
    aspectClass: row.aspectClass as 'tall' | 'square' | 'wide' | 'xtall',
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    clientId: row.clientId ?? undefined,
    youtubeVideoId: row.youtubeVideoId ?? undefined,
  };
}

export interface ListPortfolioFilters {
  clientId?: string;
  clientSlug?: string;
}

export async function listPortfolio(filters?: ListPortfolioFilters) {
  let clientId = filters?.clientId?.trim();
  if (filters?.clientSlug?.trim()) {
    const client = await prisma.client.findUnique({
      where: { slug: filters.clientSlug.trim() },
    });
    if (!client) {
      return [];
    }
    clientId = client.id;
  }

  const items = await prisma.portfolio.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return items.map(mapRow);
}

export async function getPortfolioById(id: string) {
  const row = await prisma.portfolio.findUnique({ where: { id } });
  if (!row) return null;
  return mapRow(row);
}

export async function createPortfolio(input: CreatePortfolioInput) {
  const titleValue = input.title?.trim();
  const clientId = input.clientId?.trim() || null;
  if (clientId) {
    const c = await prisma.client.findUnique({ where: { id: clientId } });
    if (!c) throw new Error('Invalid clientId');
  }

  const yt = input.youtubeVideoId?.trim();
  const row = await prisma.portfolio.create({
    data: {
      ...(titleValue ? { title: titleValue } : {}),
      category: input.category.trim(),
      imageUrl: input.imageUrl.trim(),
      aspectClass: (input.aspectClass?.trim() || 'square') as string,
      width: input.width ?? null,
      height: input.height ?? null,
      clientId,
      ...(yt ? { youtubeVideoId: yt } : {}),
    },
  });
  return mapRow(row);
}

export async function updatePortfolio(id: string, input: UpdatePortfolioInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.category !== undefined) data.category = input.category.trim();
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl.trim();
  if (input.aspectClass !== undefined) data.aspectClass = input.aspectClass;
  if (input.width !== undefined) data.width = input.width;
  if (input.height !== undefined) data.height = input.height;
  if (input.clientId !== undefined) {
    const v = input.clientId;
    if (v === null || v === '') {
      data.clientId = null;
    } else {
      const c = await prisma.client.findUnique({ where: { id: v.trim() } });
      if (!c) throw new Error('Invalid clientId');
      data.clientId = v.trim();
    }
  }

  const row = await prisma.portfolio.update({
    where: { id },
    data: data as {
      title?: string;
      category?: string;
      imageUrl?: string;
      aspectClass?: string;
      width?: number;
      height?: number;
      clientId?: string | null;
    },
  });
  return mapRow(row);
}

export async function deletePortfolio(id: string) {
  await prisma.portfolio.delete({ where: { id } });
}

/**
 * After a client is created: add Logo + Channel art to portfolio (same images as Top Clients).
 * If logo and banner URLs are identical, only one Art/Banner item is added (avoids duplicate cards).
 */
export async function createPortfolioItemsForNewClient(params: {
  clientId: string;
  channelName: string;
  logoUrl?: string | null;
  imageUrl: string;
}): Promise<void> {
  const { clientId, channelName, logoUrl, imageUrl } = params;
  const logo = logoUrl?.trim() || '';
  const banner = imageUrl.trim();
  if (!banner) return;

  const label = channelName.trim().slice(0, 120) || 'Channel';

  if (logo && logo !== banner) {
    await createPortfolio({
      title: `${label} — Logo`,
      category: 'Logo',
      imageUrl: logo,
      aspectClass: 'square',
      width: 800,
      height: 800,
      clientId,
    });
  }

  await createPortfolio({
    title: `${label} — Channel art`,
    category: 'Art/Banner',
    imageUrl: banner,
    aspectClass: 'wide',
    width: 2560,
    height: 1440,
    clientId,
  });
}
