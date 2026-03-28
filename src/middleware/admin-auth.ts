import { NextFunction, Request, Response } from 'express';
import { config } from '../config';

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-admin-secret'];
  const ok = !!config.adminSecret && typeof token === 'string' && token === config.adminSecret;
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized admin request' });
    return;
  }
  next();
}

