// Shared builtin books can live outside an isolated preview/user database.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR } from './db.js';
export function resolveBookPage(id, n) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !Number.isInteger(n) || n < 1) return null;
  const roots = [path.join(DATA_DIR, 'books')];
  if (process.env.ROSHD_BOOKS_DIR) roots.push(path.resolve(process.env.ROSHD_BOOKS_DIR));
  else if (['hoosh_6', 'hoosh_8_9'].includes(id)) roots.push(path.join(ROOT, 'data', 'books'));
  for (const root of roots) {
    const file = path.join(root, id, 'page_' + n + '.jpg');
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}
