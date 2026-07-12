import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { draftOutreachBulk, draftOutreach, type LeadInfo, type ServiceInfo } from '../../lib/ai';
import { sendEmail } from '../../lib/mailer';
import { getRecentVideoTitles } from '../../lib/youtube';

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

async function loadServices(): Promise<ServiceInfo[]> {
  const rows = await prisma.service.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map((s) => ({ title: s.title, description: s.description, benefit: s.benefit }));
}

/**
 * Build the outreach signature/footer appended to every email at send time. Kept out of the AI body
 * so it stays consistent and always includes an unsubscribe/opt-out line (deliverability + ethics).
 */
function buildFooter(): string {
  const from = config.smtp.from || 'Braddox';
  const name = from.replace(/<[^>]*>/, '').trim() || 'Braddox';
  return `\n\n— ${name}\nBraddox · YouTube growth & automation\n\nNot interested? Just reply "no" and I won't follow up.`;
}

/** Create a campaign and generate AI drafts for every selected lead that has an email. */
export async function createCampaignWithDrafts(name: string, leadIds: string[]) {
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, email: { not: null } },
  });
  if (leads.length === 0) {
    throw httpError(400, 'None of the selected leads have an email address to send to.');
  }

  const services = await loadServices();
  const leadInfos: LeadInfo[] = leads.map((l) => ({
    channelName: l.channelName || l.name || 'this channel',
    channelUrl: l.channelUrl,
    subscriberCount: l.subscriberCount,
    country: l.country,
  }));

  const drafts = await draftOutreachBulk(leadInfos, services);

  const campaign = await prisma.campaign.create({ data: { name, status: 'draft' } });

  await prisma.campaignRecipient.createMany({
    data: leads.map((l, i) => {
      const d = drafts[i]?.draft;
      const err = drafts[i]?.error;
      return {
        campaignId: campaign.id,
        leadId: l.id,
        email: l.email as string,
        channelName: l.channelName || l.name || null,
        recommendedService: d?.recommendedService ?? null,
        aiReason: d?.reason ?? null,
        confidence: d?.confidence ?? null,
        subject: d?.subject ?? '',
        body: d?.body ?? '',
        status: d ? 'draft' : 'failed',
        error: err ?? null,
      };
    }),
  });

  return getCampaign(campaign.id);
}

export async function listCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { recipients: true } } },
  });
  // Attach a small status breakdown per campaign for the list view.
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ['campaignId', 'status'],
    _count: { _all: true },
  });
  return campaigns.map((c) => {
    const counts: Record<string, number> = {};
    for (const g of grouped) {
      if (g.campaignId === c.id) counts[g.status] = g._count._all;
    }
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      total: c._count.recipients,
      counts,
    };
  });
}

export async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { recipients: { orderBy: { createdAt: 'asc' } } },
  });
  if (!campaign) throw httpError(404, 'Campaign not found.');
  return campaign;
}

export async function updateRecipient(
  id: string,
  data: { subject?: string; body?: string; status?: string; recommendedService?: string | null }
) {
  const existing = await prisma.campaignRecipient.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Recipient not found.');
  return prisma.campaignRecipient.update({
    where: { id },
    data: {
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.recommendedService !== undefined && { recommendedService: data.recommendedService }),
    },
  });
}

/** Re-draft a single recipient with the stronger model + recent-video context ("Deep analyze"). */
export async function deepAnalyzeRecipient(id: string) {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!recipient) throw httpError(404, 'Recipient not found.');

  const services = await loadServices();

  let extraContext: string | null = null;
  if (recipient.lead.channelId && config.youtubeApiKey) {
    const titles = await getRecentVideoTitles(config.youtubeApiKey, recipient.lead.channelId, 8);
    if (titles.length > 0) {
      extraContext = `Recent video titles from this channel:\n- ${titles.join('\n- ')}`;
    }
  }

  const draft = await draftOutreach(
    {
      channelName: recipient.channelName || recipient.lead.name || 'this channel',
      channelUrl: recipient.lead.channelUrl,
      subscriberCount: recipient.lead.subscriberCount,
      country: recipient.lead.country,
      extraContext,
    },
    services,
    { deep: true }
  );

  return prisma.campaignRecipient.update({
    where: { id },
    data: {
      recommendedService: draft.recommendedService,
      aiReason: draft.reason,
      confidence: draft.confidence,
      subject: draft.subject,
      body: draft.body,
      status: recipient.status === 'sent' ? recipient.status : 'draft',
      error: null,
    },
  });
}

/**
 * Send all approved recipients of a campaign via SMTP, throttled and capped to protect sender
 * reputation. Marks each recipient sent/failed and flips the underlying lead to "contacted".
 */
export async function sendCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) throw httpError(404, 'Campaign not found.');

  const approved = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, status: 'approved' },
    orderBy: { createdAt: 'asc' },
    take: config.smtp.maxPerRun,
  });
  if (approved.length === 0) {
    throw httpError(400, 'No approved recipients to send. Approve at least one draft first.');
  }

  await prisma.campaign.update({ where: { id }, data: { status: 'sending' } });

  const footer = buildFooter();
  let sent = 0;
  let failed = 0;

  for (const r of approved) {
    try {
      await sendEmail({ to: r.email, subject: r.subject, text: `${r.body}${footer}` });
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: 'sent', sentAt: new Date(), error: null },
      });
      await prisma.lead.update({
        where: { id: r.leadId },
        data: { status: 'contacted', service: r.recommendedService ?? undefined },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: 'failed', error: err instanceof Error ? err.message : 'send failed' },
      });
    }
    if (config.smtp.throttleMs > 0) {
      await new Promise((res) => setTimeout(res, config.smtp.throttleMs));
    }
  }

  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId: id, status: 'approved' },
  });
  await prisma.campaign.update({
    where: { id },
    data: { status: remaining > 0 ? 'draft' : 'sent' },
  });

  return { sent, failed, remaining };
}

export async function deleteCampaign(id: string) {
  return prisma.campaign.delete({ where: { id } });
}
