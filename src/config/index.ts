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
};

if (!config.databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL is not set. Prisma will fail to connect.');
}
