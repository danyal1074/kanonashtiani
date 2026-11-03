// پشتیبان‌گیری خودکار و دستی از پایگاه داده (VACUUM INTO: نسخه سازگار حتی در زمان کار سرور)
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from './db.js';
import { ymd, hm } from './util.js';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = Math.max(3, Number(process.env.ROSHD_BACKUP_KEEP || 14));
const HOUR = Number(process.env.ROSHD_BACKUP_HOUR ?? 3);

export function makeBackup(prefix = 'roshd') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
  const file = path.join(BACKUP_DIR, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return { name, file };
}

export function pruneBackups(keep = KEEP) {
  if (!fs.existsSync(BACKUP_DIR)) return 0;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db') && !f.startsWith('safety-')).sort().reverse();
  const old = files.slice(keep);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  return old.length;
}

let lastDay = null;
export function backupTick() {
  const today = ymd();
  if (lastDay === today) return null;
  if (Number(hm().slice(0, 2)) !== HOUR) return null;
  lastDay = today;
  const b = makeBackup('auto');
  pruneBackups();
  return b;
}
