require('reflect-metadata');
const path = require('path');
const { pathToFileURL } = require('url');

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    const modulePath = path.join(__dirname, '..', 'dist', 'app.factory.js');
    const { createApp } = await import(pathToFileURL(modulePath).href);
    const app = await createApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
  }

  return cachedServer;
}

module.exports = async function handler(req, res) {
  try {
    const server = await getServer();
    return server(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Bootstrap failed: ${error?.message || error}`);
  }
};
