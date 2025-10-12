require('reflect-metadata');
const path = require('path');
const { pathToFileURL } = require('url');

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    const distPath = path.join(__dirname, '..', 'apps', 'api', 'dist', 'app.factory.js');
    const moduleUrl = pathToFileURL(distPath).href;
    const { createApp } = await import(moduleUrl);
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
