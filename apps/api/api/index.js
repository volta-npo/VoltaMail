import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

let cachedServer;
let lastContext;

async function loadAppFactory() {
  const baseDir = fileURLToPath(new URL('.', import.meta.url));
  const parentDir = path.dirname(baseDir);
  const listDir = (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch (error) {
      return `unavailable (${error?.message ?? error})`;
    }
  };

  const candidates = [
    './dist/app.factory.js',
    '../dist/app.factory.js',
    '../../dist/app.factory.js',
    '../../apps/api/dist/app.factory.js'
  ];
  const attempts = [];

  for (const candidate of candidates) {
    const resolvedPath = path.resolve(baseDir, candidate);
    try {
      const moduleUrl = pathToFileURL(resolvedPath);
      const mod = await import(moduleUrl.href);
      lastContext = {
        resolvedPath,
        baseDir,
        baseEntries: listDir(baseDir),
        parentDir,
        parentEntries: listDir(parentDir)
      };
      return mod;
    } catch (error) {
      attempts.push({ resolvedPath, error: error?.message ?? `${error}` });
    }
  }

  lastContext = {
    baseDir,
    baseEntries: listDir(baseDir),
    parentDir,
    parentEntries: listDir(parentDir),
    attempts
  };
  throw new Error('Unable to load app.factory.js');
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
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        {
          message: 'Bootstrap failed',
          error: error?.message ?? `${error}`,
          context: lastContext
        },
        null,
        2
      )
    );
  }
}
