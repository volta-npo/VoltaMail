import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export default function handler(req, res) {
  const baseDir = fileURLToPath(new URL('.', import.meta.url));
  const parentDir = path.dirname(baseDir);
  const listDir = (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch (error) {
      return `unavailable (${error?.message ?? error})`;
    }
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify(
      {
        baseDir,
        entries: listDir(baseDir),
        parentDir,
        parentEntries: listDir(parentDir)
      },
      null,
      2
    )
  );
}
