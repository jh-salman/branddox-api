import express, { Request, Response } from 'express';
import cors from 'cors';
import { authRouter } from './modules/auth/auth.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      name: 'Branddox API',
      version: '1.0',
      endpoints: {
        health: 'GET /health',
        auth: {
          register: 'POST /auth/register',
          login: 'POST /auth/login',
        },
        leads: {
          list: 'GET /leads?limit=&offset=&status=&leadSource=&replied=',
          stats: 'GET /leads/stats',
          get: 'GET /leads/:id',
          create: 'POST /leads',
          update: 'PATCH /leads/:id',
          delete: 'DELETE /leads/:id',
        },
      },
    });
  });

  app.use('/auth', authRouter);
  app.use('/leads', leadsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}

