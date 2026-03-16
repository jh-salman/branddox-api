import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createLead,
  listLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadStats,
} from './leads.service';

const createLeadSchema = z.object({
  name: z.string().optional().nullable(),
  email: z.string().email(),
  channelUrl: z.string().url(),
  leadSource: z.string().min(1),
  service: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
});

const updateLeadSchema = z.object({
  emailRepliedAt: z.union([z.string(), z.null()]).optional(),
  status: z.string().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  status: z.string().optional(),
  leadSource: z.string().optional(),
  replied: z.enum(['true', 'false']).optional(),
});

export async function getAll(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const replied =
    query.replied === 'true' ? true : query.replied === 'false' ? false : undefined;
  const result = await listLeads({
    limit: query.limit,
    offset: query.offset,
    status: query.status,
    leadSource: query.leadSource,
    replied,
  });
  res.json(result);
}

export async function getStats(_req: Request, res: Response) {
  const stats = await getLeadStats();
  res.json(stats);
}

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0]! : id;
}

export async function getById(req: Request, res: Response) {
  const lead = await getLeadById(paramId(req));
  res.json(lead);
}

export async function create(req: Request, res: Response) {
  const data = createLeadSchema.parse(req.body);
  const lead = await createLead(data);
  res.status(201).json(lead);
}

export async function update(req: Request, res: Response) {
  const body = updateLeadSchema.parse(req.body);
  const emailRepliedAt =
    body.emailRepliedAt === null
      ? null
      : body.emailRepliedAt
        ? new Date(body.emailRepliedAt)
        : undefined;
  const lead = await updateLead(paramId(req), {
    ...(emailRepliedAt !== undefined && { emailRepliedAt }),
    ...(body.status !== undefined && { status: body.status }),
  });
  res.json(lead);
}

export async function remove(req: Request, res: Response) {
  await deleteLead(paramId(req));
  res.status(204).send();
}
