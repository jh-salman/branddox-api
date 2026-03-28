import { Request, Response } from 'express';
import { z } from 'zod';
import {
  listServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} from './services.service';

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  benefit: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  benefit: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0]! : id;
}

export async function getAll(_req: Request, res: Response) {
  const items = await listServices();
  res.json(items);
}

export async function getById(req: Request, res: Response) {
  const item = await getServiceById(paramId(req));
  if (!item) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(item);
}

export async function create(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  const item = await createService({
    title: body.title,
    description: body.description,
    benefit: body.benefit,
    sortOrder: body.sortOrder,
  });
  res.status(201).json(item);
}

export async function update(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  const item = await updateService(paramId(req), body);
  res.json(item);
}

export async function remove(req: Request, res: Response) {
  await deleteService(paramId(req));
  res.status(204).send();
}
