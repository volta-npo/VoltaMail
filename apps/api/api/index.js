require('reflect-metadata');
const fs = require('fs');
const path = require('path');

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    try {
      const baseDir = __dirname;
      const distCandidate = path.join(baseDir, '..', 'dist', 'app.factory.js');
      const altCandidate = path.join(baseDir, '..', 'apps', 'api', 'dist', 'app.factory.js');
      console.log('[bootstrap] baseDir', baseDir);
      console.log('[bootstrap] candidates', distCandidate, fs.existsSync(distCandidate), altCandidate, fs.existsSync(altCandidate));
      const modulePath = fs.existsSync(distCandidate) ? distCandidate : altCandidate;
      const { createApp } = await import(pathToFileURL(modulePath).href);
      const app = await createApp();
      await app.init();
      cachedServer = app.getHttpAdapter().getInstance();
    } catch (error) {
      console.error('[bootstrap] Failed to initialize Nest application', error);
      throw error;
    }
  }

  return cachedServer;
}

const { pathToFileURL } = require('url');

module.exports = async function handler(req, res) {
  try {
    console.log('[handler] incoming', req.url);
    const server = await getServer();
    return server(req, res);
  } catch (error) {
    console.error('[handler] Request failed', req.url, error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Bootstrap failed: ${error?.message || error}`);
  }
};
