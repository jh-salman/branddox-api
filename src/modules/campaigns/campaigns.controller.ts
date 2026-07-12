import { Request, Response } from 'express';
import { z } from 'zod';
import { isOpenAiConfigured } from '../../lib/ai';
import { isSmtpConfigured, verifySmtp } from '../../lib/mailer';
import {
  createCampaignWithDrafts,
  listCampaigns,
  getCampaign,
  updateRecipient,
  deepAnalyzeRecipient,
  sendCampaign,
  deleteCampaign,
} from './campaigns.service';

function paramId(req: Request, key = 'id'): string {
  const id = req.params[key];
  return Array.isArray(id) ? id[0]! : id;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  leadIds: z.array(z.string().min(1)).min(1, 'Select at least one lead.'),
});

const updateRecipientSchema = z.object({
  subject: z.string().max(300).optional(),
  body: z.string().max(8000).optional(),
  status: z.enum(['draft', 'approved', 'skipped']).optional(),
  recommendedService: z.string().max(200).nullable().optional(),
});

export async function getConfigStatus(_req: Request, res: Response) {
  res.json({ openai: isOpenAiConfigured(), smtp: isSmtpConfigured() });
}

export async function verifySmtpHandler(_req: Request, res: Response) {
  if (!isSmtpConfigured()) {
    res.status(400).json({ ok: false, error: 'SMTP is not configured.' });
    return;
  }
  try {
    await verifySmtp();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'SMTP verify failed' });
  }
}

export async function create(req: Request, res: Response) {
  const body = createSchema.parse(req.body ?? {});
  const name = body.name || `Campaign ${new Date().toLocaleDateString('en-US')}`;
  const campaign = await createCampaignWithDrafts(name, body.leadIds);
  res.status(201).json(campaign);
}

export async function list(_req: Request, res: Response) {
  res.json({ items: await listCampaigns() });
}

export async function getOne(req: Request, res: Response) {
  res.json(await getCampaign(paramId(req)));
}

export async function patchRecipient(req: Request, res: Response) {
  const body = updateRecipientSchema.parse(req.body ?? {});
  res.json(await updateRecipient(paramId(req, 'recipientId'), body));
}

export async function deepRecipient(req: Request, res: Response) {
  res.json(await deepAnalyzeRecipient(paramId(req, 'recipientId')));
}

export async function send(req: Request, res: Response) {
  res.json(await sendCampaign(paramId(req)));
}

export async function remove(req: Request, res: Response) {
  await deleteCampaign(paramId(req));
  res.status(204).send();
}
