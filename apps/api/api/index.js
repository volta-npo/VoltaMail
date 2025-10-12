require('reflect-metadata');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let cachedServer;

function resolveAppFactoryPath() {
  const baseDir = __dirname;
  const candidates = [
    path.join(baseDir, '..', 'dist', 'app.factory.js'),
    path.join(baseDir, '..', '..', 'dist', 'app.factory.js'),
    path.join(baseDir, '..', '..', 'apps', 'api', 'dist', 'app.factory.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to locate app.factory.js. Checked: ${candidates.join(', ')}`);
}

async function getServer() {
  if (!cachedServer) {
    const modulePath = resolveAppFactoryPath();
    const { createApp } = await import(pathToFileURL(modulePath).href);
    const app = await createApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
  }

  return cachedServer;
}

module.exports = async function handler(req, res) {
  const server = await getServer();
  return server(req, res);
};
