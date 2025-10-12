import 'reflect-metadata';

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    const moduleUrl = new URL('../dist/app.factory.js', import.meta.url);
    const { createApp } = await import(moduleUrl.href);
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
