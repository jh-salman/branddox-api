import type { PrismaClient } from '@prisma/client';

/** URL-safe segment from a channel display name. */
export function baseSlugFromName(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'channel';
}

/** Ensures uniqueness against Client.slug. */
export async function generateUniqueClientSlug(prisma: PrismaClient, name: string): Promise<string> {
  const base = baseSlugFromName(name.trim() || 'channel');
  let candidate = base;
  let n = 0;
  while (await prisma.client.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
