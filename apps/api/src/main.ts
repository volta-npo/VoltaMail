import 'reflect-metadata';
import { createApp } from './app.factory.js';

async function bootstrap() {
  const app = await createApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap API', error);
  process.exit(1);
});
