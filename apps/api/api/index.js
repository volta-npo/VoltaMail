require('reflect-metadata');

let cachedServer;

async function getServer() {
  if (!cachedServer) {
    const { createApp } = await import('../dist/app.factory.js');
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
