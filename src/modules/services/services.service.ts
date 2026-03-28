import { prisma } from '../../lib/prisma';

export interface CreateServiceInput {
  title: string;
  description: string;
  benefit: string;
  sortOrder?: number;
}

export interface UpdateServiceInput {
  title?: string;
  description?: string;
  benefit?: string;
  sortOrder?: number;
}

export async function listServices() {
  const rows = await prisma.service.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    benefit: row.benefit,
    sortOrder: row.sortOrder,
  }));
}

export async function getServiceById(id: string) {
  const row = await prisma.service.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    benefit: row.benefit,
    sortOrder: row.sortOrder,
  };
}

export async function createService(input: CreateServiceInput) {
  const row = await prisma.service.create({
    data: {
      title: input.title.trim(),
      description: input.description.trim(),
      benefit: input.benefit.trim(),
      sortOrder: input.sortOrder ?? 0,
    },
  });
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    benefit: row.benefit,
    sortOrder: row.sortOrder,
  };
}

export async function updateService(id: string, input: UpdateServiceInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.benefit !== undefined) data.benefit = input.benefit.trim();
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  const row = await prisma.service.update({
    where: { id },
    data: data as { title?: string; description?: string; benefit?: string; sortOrder?: number },
  });
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    benefit: row.benefit,
    sortOrder: row.sortOrder,
  };
}

export async function deleteService(id: string) {
  await prisma.service.delete({ where: { id } });
}
