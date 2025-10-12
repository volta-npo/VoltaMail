const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
require('reflect-metadata');

module.exports = async function handler(req, res) {
  const baseDir = __dirname;
  const parent = path.join(baseDir, '..');
  const distCandidate = path.join(baseDir, '..', 'dist', 'app.factory.js');
  const altCandidate = path.join(baseDir, '..', 'apps', 'api', 'dist', 'app.factory.js');
  const payload = {
    baseDir,
    baseDirEntries: fs.readdirSync(baseDir),
    parent,
    parentEntries: fs.readdirSync(parent),
    distCandidate,
    distCandidateExists: fs.existsSync(distCandidate),
    altCandidate,
    altCandidateExists: fs.existsSync(altCandidate)
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload, null, 2));
};
