import 'dotenv/config';

const defaultOrigins = [
  'https://branddox-web.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const allowedOriginsFromEnv = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : process.env.APP_URL
    ? [process.env.APP_URL]
    : [];

export const config = {
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  /** Frontend URL for links etc. Not used for CORS on Vercel (use ALLOWED_ORIGINS). */
  appUrl: process.env.APP_URL || 'http://localhost:4000',
  /** Origins allowed for CORS. API must send Access-Control-Allow-Origin matching the request origin. */
  allowedOrigins: allowedOriginsFromEnv.length > 0 ? allowedOriginsFromEnv : defaultOrigins,
  databaseUrl: process.env.DATABASE_URL ?? '',
  adminSecret: process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
  youtubeApiKey: process.env.GOOGLE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || '',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    /** Cheap model for bulk service-match + personalized drafts. */
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    /** Higher-reasoning model for single-lead deep analysis. */
    deepModel: process.env.OPENAI_DEEP_MODEL || 'gpt-4o',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    /** From header, e.g. "Braddox <hello@branddox.com>". Falls back to SMTP_USER. */
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    /** Optional per-run cap and delay to protect sender reputation. */
    maxPerRun: process.env.SMTP_MAX_PER_RUN ? Number(process.env.SMTP_MAX_PER_RUN) : 100,
    throttleMs: process.env.SMTP_THROTTLE_MS ? Number(process.env.SMTP_THROTTLE_MS) : 1500,
  },
};

if (!config.databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL is not set. Prisma will fail to connect.');
}
