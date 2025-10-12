require('reflect-metadata');

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    try {
      const { createApp } = await import('../dist/app.factory.js');
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

module.exports = async function handler(req, res) {
  try {
    const server = await getServer();
    return server(req, res);
  } catch (error) {
    console.error('[handler] Request failed', req.url, error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message, stack: error.stack }));
  }
};
