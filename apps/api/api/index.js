const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  const baseDir = __dirname;
  const parent = path.join(baseDir, '..');
  const payload = {
    baseDir,
    baseDirEntries: fs.readdirSync(baseDir),
    parent,
    parentEntries: fs.readdirSync(parent)
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload, null, 2));
};
