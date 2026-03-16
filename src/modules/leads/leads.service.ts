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

export interface ListLeadsFilters {
  limit?: number;
  offset?: number;
  status?: string;
  leadSource?: string;
  replied?: boolean; // true = has emailRepliedAt, false = not replied
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

export async function listLeads(filters: ListLeadsFilters = {}) {
  const { limit = 50, offset = 0, status, leadSource, replied } = filters;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (leadSource) where.leadSource = leadSource;
  if (replied === true) where.emailRepliedAt = { not: null };
  if (replied === false) where.emailRepliedAt = null;

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total };
}

export async function getLeadById(id: string) {
  return prisma.lead.findUniqueOrThrow({ where: { id } });
}

export async function updateLead(
  id: string,
  data: { emailRepliedAt?: Date | null; status?: string }
) {
  return prisma.lead.update({
    where: { id },
    data: {
      ...(data.emailRepliedAt !== undefined && { emailRepliedAt: data.emailRepliedAt }),
      ...(data.status !== undefined && { status: data.status }),
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

