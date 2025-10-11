import 'reflect-metadata';
import { createApp } from '../dist/app.factory.js';

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    const app = await createApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
  }

  return cachedServer;
}

export default async function handler(req, res) {
  const server = await getServer();
  return server(req, res);
}
