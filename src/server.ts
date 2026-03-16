import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

if (process.env.VERCEL !== '1') {
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

export default app;

