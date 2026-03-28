import { prisma } from '../../lib/prisma';
import { createPortfolioItemsForNewClient } from '../portfolio/portfolio.service';
import { baseSlugFromName, generateUniqueClientSlug } from '../../lib/slug';

export interface CreateClientInput {
  channelName: string;
  channelUrl: string;
  imageUrl: string;
  logoUrl?: string;
  subscriberCount?: string;
  description?: string;
  sortOrder?: number;
  /** If omitted, generated from channelName (unique). */
  slug?: string;
}

export interface UpdateClientInput {
  channelName?: string;
  channelUrl?: string;
  imageUrl?: string;
  logoUrl?: string;
  subscriberCount?: string;
  description?: string;
  sortOrder?: number;
  slug?: string;
}

function mapRow(row: {
  id: string;
  slug: string;
  channelName: string;
  channelUrl: string;
  imageUrl: string;
  logoUrl: string | null;
  subscriberCount: string | null;
  description: string | null;
  sortOrder: number;
}) {
  return {
    id: row.id,
    slug: row.slug,
    channelName: row.channelName,
    channelUrl: row.channelUrl,
    imageUrl: row.imageUrl,
    logoUrl: row.logoUrl ?? undefined,
    subscriberCount: row.subscriberCount ?? undefined,
    description: row.description ?? undefined,
    sortOrder: row.sortOrder,
  };
}

export async function listClients() {
  const rows = await prisma.client.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(mapRow);
}

export async function getClientById(id: string) {
  const row = await prisma.client.findUnique({ where: { id } });
  if (!row) return null;
  return mapRow(row);
}

export async function getClientBySlug(slug: string) {
  const row = await prisma.client.findUnique({ where: { slug: slug.trim() } });
  if (!row) return null;
  return mapRow(row);
}

export async function createClient(input: CreateClientInput) {
  const slugInput = input.slug?.trim();
  const slug =
    slugInput && slugInput.length > 0
      ? await ensureUniqueSlug(prisma, slugInput)
      : await generateUniqueClientSlug(prisma, input.channelName);

  const row = await prisma.client.create({
    data: {
      slug,
      channelName: input.channelName.trim(),
      channelUrl: input.channelUrl.trim(),
      imageUrl: input.imageUrl.trim(),
      logoUrl: input.logoUrl?.trim() || null,
      subscriberCount: input.subscriberCount?.trim() ?? null,
      description: input.description?.trim() ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  try {
    await createPortfolioItemsForNewClient({
      clientId: row.id,
      channelName: row.channelName,
      logoUrl: row.logoUrl,
      imageUrl: row.imageUrl,
    });
  } catch (e) {
    console.error('[createClient] portfolio sync failed', e);
  }

  return mapRow(row);
}

async function ensureUniqueSlug(
  db: typeof prisma,
  desired: string
): Promise<string> {
  const base = baseSlugFromName(desired) || 'channel';
  let candidate = base;
  let n = 0;
  while (await db.client.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export async function updateClient(id: string, input: UpdateClientInput) {
  const update: {
    slug?: string;
    channelName?: string;
    channelUrl?: string;
    imageUrl?: string;
    logoUrl?: string | null;
    subscriberCount?: string | null;
    description?: string | null;
    sortOrder?: number;
  } = {};
  if (input.slug !== undefined) {
    const t = input.slug.trim();
    if (t.length === 0) {
      throw new Error('slug cannot be empty');
    }
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) throw new Error('Not found');
    const next = await ensureUniqueSlugForUpdate(prisma, t, id);
    update.slug = next;
  }
  if (input.channelName !== undefined) update.channelName = input.channelName.trim();
  if (input.channelUrl !== undefined) update.channelUrl = input.channelUrl.trim();
  if (input.imageUrl !== undefined) update.imageUrl = input.imageUrl.trim();
  if (input.logoUrl !== undefined) update.logoUrl = input.logoUrl?.trim() || null;
  if (input.subscriberCount !== undefined) update.subscriberCount = input.subscriberCount?.trim() ?? null;
  if (input.description !== undefined) update.description = input.description?.trim() ?? null;
  if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;

  const row = await prisma.client.update({
    where: { id },
    data: update,
  });
  return mapRow(row);
}

async function ensureUniqueSlugForUpdate(
  db: typeof prisma,
  desired: string,
  excludeId: string
): Promise<string> {
  const base = baseSlugFromName(desired) || 'channel';
  let candidate = base;
  let n = 0;
  for (;;) {
    const hit = await db.client.findUnique({ where: { slug: candidate } });
    if (!hit || hit.id === excludeId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function deleteClient(id: string) {
  await prisma.client.delete({ where: { id } });
}
