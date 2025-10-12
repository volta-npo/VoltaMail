import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

let cachedServer;

async function loadAppFactory() {
  const candidates = [
    './dist/app.factory.js',
    '../dist/app.factory.js',
    '../../dist/app.factory.js',
    '../../apps/api/dist/app.factory.js'
  ];
  const baseDir = fileURLToPath(new URL('.', import.meta.url));
  const listDir = (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch (error) {
      return `unavailable (${error?.message ?? error})`;
    }
  };

  const errors = [];

  for (const candidate of candidates) {
    try {
      const moduleUrl = pathToFileURL(path.resolve(baseDir, candidate));
      return await import(moduleUrl.href);
    } catch (error) {
      errors.push(`${candidate}: ${error?.message ?? error}`);
    }
  }

  throw new Error(
    `Unable to load app.factory.js. baseDir=${baseDir}, baseEntries=${JSON.stringify(listDir(baseDir))}, parentEntries=${JSON.stringify(listDir(path.dirname(baseDir)))}, Tried: ${errors.join(' | ')}`
  );
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
