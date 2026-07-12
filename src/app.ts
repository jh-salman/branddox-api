import express, { Application, Request, Response } from 'express';
import { config } from './config';
import { authRouter } from './modules/auth/auth.router';
import { clientsRouter } from './modules/clients/clients.router';
import { leadsRouter } from './modules/leads/leads.router';
import { portfolioRouter } from './modules/portfolio/portfolio.router';
import { servicesRouter } from './modules/services/services.router';
import { uploadRouter } from './modules/upload/upload.router';
import { youtubeRouter } from './modules/youtube/youtube.router';
import { campaignsRouter } from './modules/campaigns/campaigns.router';
import { errorHandler } from './middleware/errorHandler';

export const app: Application = express();

const primaryOrigin = config.allowedOrigins[0] ?? 'https://branddox-web.vercel.app';

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (config.allowedOrigins.includes(origin)) return true;
  if (origin.startsWith('https://branddox-web') && origin.endsWith('.vercel.app')) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : primaryOrigin;
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
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
      auth: { register: 'POST /auth/register', login: 'POST /auth/login' },
      leads: { list: 'GET /leads', stats: 'GET /leads/stats', get: 'GET /leads/:id', create: 'POST /leads', update: 'PATCH /leads/:id', delete: 'DELETE /leads/:id' },
      portfolio: {
        list: 'GET /portfolio',
        youtubeThumbnails: 'POST /portfolio/youtube-thumbnails (admin; dryRun or import)',
        get: 'GET /portfolio/:id',
        create: 'POST /portfolio',
        update: 'PATCH|PUT /portfolio/:id',
        delete: 'DELETE /portfolio/:id',
      },
      services: { list: 'GET /services', get: 'GET /services/:id', create: 'POST /services', update: 'PATCH|PUT /services/:id', delete: 'DELETE /services/:id' },
      clients: {
        list: 'GET /clients',
        get: 'GET /clients/:id',
        resolveYoutube: 'POST /clients/resolve-youtube (admin)',
        create: 'POST /clients',
        update: 'PATCH|PUT /clients/:id',
        delete: 'DELETE /clients/:id',
      },
      upload: 'POST /upload (multipart, field: image)',
      youtube: {
        searchChannels: 'POST /youtube/search-channels (admin; keyword + country + subscriber filters + email)',
        saveLeads: 'POST /youtube/save-leads (admin; bulk-save channels as leads, deduped by channelId)',
        enrichLeads: 'POST /youtube/enrich-leads (admin; fill missing emails on saved leads via description + linked sites)',
      },
      campaigns: {
        config: 'GET /campaigns/config (admin; whether OpenAI + SMTP are configured)',
        verifySmtp: 'POST /campaigns/verify-smtp (admin; test SMTP connection)',
        list: 'GET /campaigns (admin)',
        create: 'POST /campaigns (admin; {leadIds, name} → AI drafts best-fit service + email per lead)',
        get: 'GET /campaigns/:id (admin; campaign + recipients)',
        editRecipient: 'PATCH /campaigns/:id/recipients/:recipientId (admin; edit subject/body/status)',
        deepRecipient: 'POST /campaigns/:id/recipients/:recipientId/deep (admin; re-draft with deep analysis)',
        send: 'POST /campaigns/:id/send (admin; send approved recipients via SMTP, throttled)',
        delete: 'DELETE /campaigns/:id (admin)',
      },
    },
  });
});

app.use('/auth', authRouter);
app.use('/leads', leadsRouter);
app.use('/portfolio', portfolioRouter);
app.use('/services', servicesRouter);
app.use('/clients', clientsRouter);
app.use('/upload', uploadRouter);
app.use('/youtube', youtubeRouter);
app.use('/campaigns', campaignsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);
