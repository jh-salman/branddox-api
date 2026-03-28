import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Max 10MB.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const flat = err.flatten();
    const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
    const messages = Object.entries(fieldErrors)
      .filter(([, v]) => Array.isArray(v) && v.length > 0)
      .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`);
    const summary = messages.length > 0 ? messages.join('; ') : 'Invalid request body or query.';

    // Log in production so you can see which endpoint and which fields failed
    if (process.env.NODE_ENV === 'production') {
      console.error('[Validation failed]', req.method, req.path, fieldErrors);
    }

    res.status(400).json({
      error: 'Validation failed',
      message: summary,
      details: fieldErrors,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Duplicate value', field: (err.meta?.target as string[])?.[0] });
      return;
    }
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: message });
}
