import { prisma } from '../../lib/prisma';

const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

export interface CreateLeadInput {
  name?: string | null;
  email: string;
  channelUrl: string;
  leadSource: string;
  service?: string | null;
  message?: string | null;
}

export interface SaveChannelLeadInput {
  channelId?: string | null;
  channelUrl: string;
  name?: string | null;
  email?: string | null;
  subscriberCount?: string | null;
  country?: string | null;
  thumbnailUrl?: string | null;
}

export interface ListLeadsFilters {
  limit?: number;
  offset?: number;
  page?: number;
  status?: string;
  leadSource?: string;
  replied?: boolean; // true = has emailRepliedAt, false = not replied
}

export interface ListLeadsResult {
  items: Awaited<ReturnType<typeof prisma.lead.findMany>>;
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
}

export async function createLead(input: CreateLeadInput) {
  const lead = await prisma.lead.create({
    data: {
      name: input.name ?? null,
      email: input.email,
      channelUrl: input.channelUrl,
      leadSource: input.leadSource,
      service: input.service ?? null,
      message: input.message ?? null,
    },
  });

  if (n8nWebhookUrl) {
    // fire-and-forget: don't block request if automation is down
    void sendToN8nWebhook(input).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('Failed to send lead to n8n webhook', err);
    });
  }

  return lead;
}

/**
 * Bulk-save scraped YouTube channels as leads. Deduped by channelId (unique) when present,
 * otherwise by channelUrl within the given source. Returns counts + created rows.
 */
export async function saveChannelLeads(channels: SaveChannelLeadInput[], leadSource: string) {
  let created = 0;
  let skipped = 0;
  const items: Array<{ id: string; channelUrl: string; channelName: string | null }> = [];

  for (const ch of channels) {
    const channelId = ch.channelId?.trim() || null;
    const channelUrl = ch.channelUrl.trim();

    const existing = channelId
      ? await prisma.lead.findUnique({ where: { channelId } })
      : await prisma.lead.findFirst({ where: { channelUrl, leadSource } });

    if (existing) {
      skipped += 1;
      continue;
    }

    const lead = await prisma.lead.create({
      data: {
        name: ch.name?.trim() || null,
        channelName: ch.name?.trim() || null,
        email: ch.email?.trim() || null,
        channelUrl,
        channelId,
        subscriberCount: ch.subscriberCount?.trim() || null,
        country: ch.country?.trim()?.toUpperCase() || null,
        thumbnailUrl: ch.thumbnailUrl?.trim() || null,
        leadSource,
      },
    });
    created += 1;
    items.push({ id: lead.id, channelUrl: lead.channelUrl, channelName: lead.channelName });
  }

  return { created, skipped, total: channels.length, items };
}

export async function listLeads(filters: ListLeadsFilters = {}): Promise<ListLeadsResult> {
  const { status, leadSource, replied } = filters;
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (leadSource) where.leadSource = leadSource;
  if (replied === true) where.emailRepliedAt = { not: null };
  if (replied === false) where.emailRepliedAt = null;

  const total = await prisma.lead.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const requestedPage =
    filters.page != null
      ? Math.max(filters.page, 1)
      : Math.floor(Math.max(filters.offset ?? 0, 0) / limit) + 1;
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const offset = (page - 1) * limit;

  const items = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return {
    items,
    total,
    limit,
    offset,
    page,
    totalPages,
  };
}

export async function getLeadById(id: string) {
  return prisma.lead.findUniqueOrThrow({ where: { id } });
}

/** Leads that still have no email — candidates for automated email enrichment. */
export async function listLeadsMissingEmail(limit = 100) {
  return prisma.lead.findMany({
    where: { email: null, channelId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

export async function countLeadsMissingEmail() {
  return prisma.lead.count({ where: { email: null } });
}

export async function setLeadEmail(id: string, email: string) {
  return prisma.lead.update({ where: { id }, data: { email } });
}

export async function updateLead(
  id: string,
  data: { emailRepliedAt?: Date | null; status?: string; email?: string | null }
) {
  return prisma.lead.update({
    where: { id },
    data: {
      ...(data.emailRepliedAt !== undefined && { emailRepliedAt: data.emailRepliedAt }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.email !== undefined && { email: data.email }),
    },
  });
}

export async function deleteLead(id: string) {
  return prisma.lead.delete({ where: { id } });
}

export async function getLeadStats() {
  const [total, replied, notReplied, bySource] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { emailRepliedAt: { not: null } } }),
    prisma.lead.count({ where: { emailRepliedAt: null } }),
    prisma.lead.groupBy({
      by: ['leadSource'],
      _count: { id: true },
    }),
  ]);

  return {
    total,
    replied,
    notReplied,
    bySource: bySource.map((s: { leadSource: string; _count: { id: number } }) => ({
      source: s.leadSource,
      count: s._count.id,
    })),
  };
}

async function sendToN8nWebhook(input: CreateLeadInput) {
  if (!n8nWebhookUrl) return;

  const payload = {
    lead_source: input.leadSource,
    name: input.name ?? '',
    email: input.email,
    channel_url: input.channelUrl,
    service: input.service ?? '',
    message: input.message ?? '',
  };

  await fetch(n8nWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

