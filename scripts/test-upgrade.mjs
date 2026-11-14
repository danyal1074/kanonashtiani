// Upgrade rehearsal on a disposable copy of a real-schema database.
// Usage: node scripts/test-upgrade.mjs /path/to/old/roshd.db
// The source file is never modified: it is copied with VACUUM INTO, migrated, and compared table by table.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Usage: node scripts/test-upgrade.mjs <old roshd.db>'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-upgrade-'));
process.env.ROSHD_DATA_DIR = path.join(tmp, 'scratch');
const copy = path.join(tmp, 'copy.db');
{ const s = new DatabaseSync(src, { readOnly: true }); s.exec(`VACUUM INTO '${copy.replaceAll("'", "''")}'`); s.close(); }
const { migrate, migrations } = await import('../server/db.js');
const db = new DatabaseSync(copy);
db.exec('PRAGMA foreign_keys=ON');
const fromVersion = db.prepare('PRAGMA user_version').get().user_version;
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
const before = Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n]));
const money = (d) => d.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='approved'").get().s;
const moneyBefore = money(db), invBefore = db.prepare('SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM fee_invoices').get();
const resultsBefore = db.prepare('SELECT COALESCE(SUM(percent),0) s FROM exam_results').get().s;
const t0 = Date.now();
const v = migrate(db);
const ms = Date.now() - t0;
assert.equal(v, migrations.length);
for (const t of tables) assert.equal(db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n, before[t], `${t} row count changed`);
assert.equal(money(db), moneyBefore, 'approved payment total changed');
const invAfter = db.prepare('SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM fee_invoices').get();
assert.deepEqual({ ...invAfter }, { ...invBefore }, 'invoice totals changed');
assert.equal(db.prepare('SELECT COUNT(*) n FROM fee_invoices i WHERE amount <> (SELECT COALESCE(SUM(amount),0) FROM fee_invoice_lines l WHERE l.invoice_id=i.id)').get().n, 0, 'invoice lines do not match invoice totals');
assert.equal(db.prepare('SELECT COALESCE(SUM(percent),0) s FROM exam_results').get().s, resultsBefore, 'exam results changed');
assert.equal(db.prepare("SELECT COUNT(*) n FROM exams WHERE status<>'published' OR results_released_at IS NULL").get().n, 0, 'existing exams must stay published with visible results');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
const counselors = db.prepare("SELECT COUNT(*) n FROM users WHERE role='counselor'").get().n;
console.log(`✓ Upgraded copy from v${fromVersion} to v${v} in ${ms} ms; ${tables.length} tables, ${Object.values(before).reduce((a, b) => a + b, 0)} rows preserved`);
console.log(`✓ Payments/invoices/exam results unchanged; ${invAfter.n} invoices itemized; ${counselors} counselors backfilled to ${db.prepare('SELECT COUNT(*) n FROM counselor_classes').get().n} class assignments`);
console.log('✓ foreign_key_check and integrity_check clean');
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
