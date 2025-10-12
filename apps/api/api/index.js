import 'reflect-metadata';

let cachedServer;

async function loadAppFactory() {
  const candidates = [
    './dist/app.factory.js',
    '../dist/app.factory.js',
    '../../dist/app.factory.js',
    '../../apps/api/dist/app.factory.js'
  ];
  const errors = [];

  for (const candidate of candidates) {
    try {
      const moduleUrl = new URL(candidate, import.meta.url);
      return await import(moduleUrl.href);
    } catch (error) {
      errors.push(`${candidate}: ${error?.message ?? error}`);
    }
  }

  throw new Error(`Unable to load app.factory.js. Tried: ${errors.join(' | ')}`);
}

async function getServer() {
  if (!cachedServer) {
    const { createApp } = await loadAppFactory();
    const app = await createApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
  }

  return cachedServer;
}

export default async function handler(req, res) {
  try {
    const server = await getServer();
    return server(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Bootstrap failed: ${error?.message ?? error}`);
  }
}
