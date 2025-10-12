require('reflect-metadata');
const path = require('path');
const { pathToFileURL } = require('url');

const fs = require('fs');
let cachedServer;

async function getServer() {
  if (!cachedServer) {
    const distPath = path.join(__dirname, '..', 'apps', 'api', 'dist', 'app.factory.js');
    const moduleUrl = pathToFileURL(distPath).href;
    console.log('[bootstrap] loading app from', moduleUrl, 'exists:', fs.existsSync(distPath));
    try {
      const { createApp } = await import(moduleUrl);
      const app = await createApp();
      await app.init();
      cachedServer = app.getHttpAdapter().getInstance();
      console.log('[bootstrap] Nest application initialized');
    } catch (error) {
      console.error('[bootstrap] failed to initialize Nest application', error);
      throw error;
    }
  }

  return cachedServer;
}

module.exports = async function handler(req, res) {
  try {
    const server = await getServer();
    return server(req, res);
  } catch (error) {
    console.error('[handler] request failed', req.url, error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
