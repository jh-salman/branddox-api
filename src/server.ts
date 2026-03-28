import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from './app';
import { config } from './config';

if (process.env.VERCEL !== '1') {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

type ReqWithBody = IncomingMessage & { body?: object };

/** Read JSON body from Node stream (for Vercel when body not already on req). */
function readJsonFromStream(req: IncomingMessage): Promise<object | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        if (raw.length === 0) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw.toString()) as object);
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

/** On Vercel: attach request body to req before passing to Express (fixes empty req.body in serverless). */
async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  const r = req as ReqWithBody & { body?: unknown; json?: () => Promise<unknown> };
  const method = req.method ?? '';
  const isJson = (req.headers['content-type'] ?? '').includes('application/json');

  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && isJson) {
    try {
      const vercelBody = (req as unknown as { body?: unknown }).body;
      if (vercelBody != null && typeof vercelBody === 'object' && !Array.isArray(vercelBody)) {
        r.body = vercelBody as object;
      } else if (typeof r.json === 'function') {
        r.body = (await r.json()) as object;
      } else if (typeof (req as unknown as { on?: (e: string) => void }).on === 'function') {
        const body = await readJsonFromStream(req);
        if (body !== null) r.body = body;
      }
    } catch {
      // leave body as is
    }
  }

  app(req, res);
}

/** Single default export: on Vercel use body-aware handler, otherwise Express handles directly. */
function handler(req: IncomingMessage, res: ServerResponse) {
  if (process.env.VERCEL === '1') {
    vercelHandler(req, res);
    return;
  }
  app(req, res);
}

export default handler;
