// پنل مدیر سامانه (پشتیبانی): کانون‌ها، کاربران، مشاهده به‌جای کاربر، پشتیبان‌گیری و بازیابی
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, db, DB_PATH, DATA_DIR, closeDb, openDb } from '../db.js';
import { fail, hashPassword, clampStr, toEnDigits } from '../util.js';
import { setSession } from './common.js';
import { makeBackup, pruneBackups, BACKUP_DIR } from '../backup.js';
import { snapshot } from '../metrics.js';
import { staticCacheStats } from '../http.js';

const A = { roles: ['admin'] };
export { makeBackup };

export default function register(r) {
  r.get('/api/admin/overview', A, () => ({
    centers: all(`SELECT c.id, c.name, c.slug, c.logo, c.color, c.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.center_id=c.id AND u.role='student') students,
      (SELECT COUNT(*) FROM users u WHERE u.center_id=c.id AND u.role='teacher') teachers,
      (SELECT full_name FROM users u WHERE u.center_id=c.id AND u.role='manager' LIMIT 1) manager
      FROM centers c ORDER BY c.id`),
    totals: get(`SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM users WHERE role='student') students,
      (SELECT COUNT(*) FROM exam_results) results, (SELECT COUNT(*) FROM pomodoros) pomodoros, (SELECT COUNT(*) FROM messages) messages`),
    dbSize: fs.statSync(DB_PATH).size,
    backups: fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse().slice(0, 10)
      .map((f) => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size })) : [],
  }));

  r.post('/api/admin/centers', A, (ctx) => {
    const b = ctx.body, name = clampStr(b.name, 100), slug = clampStr(b.slug, 40).toLowerCase();
    const mUser = toEnDigits(clampStr(b.manager_username, 40)).toLowerCase();
    if (!name || !/^[a-z0-9-]{3,40}$/.test(slug)) fail(400, 'نام کانون و شناسه لاتین (slug) لازم است');
    if (!/^[a-z0-9_.]{3,40}$/.test(mUser) || !b.manager_password || String(b.manager_password).length < 6) fail(400, 'نام کاربری و رمز (حداقل ۶) مدیر لازم است');
    if (get('SELECT 1 FROM centers WHERE slug=?', slug)) fail(400, 'این شناسه تکراری است');
    if (get(`SELECT 1 FROM users WHERE role='manager' AND username=?`, mUser)) fail(400, 'نام کاربری مدیر تکراری است');
    tx(() => {
      const c = run('INSERT INTO centers (name, slug, tagline, color, logo) VALUES (?,?,?,?,?)', name, slug, clampStr(b.tagline, 150), /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#7c3aed', clampStr(b.logo, 8) || '🌟');
      const cid = Number(c.lastInsertRowid);
      run(`INSERT INTO users (center_id, role, username, pass_hash, full_name) VALUES (?,?,?,?,?)`, cid, 'manager', mUser, hashPassword(b.manager_password), clampStr(b.manager_name, 80) || 'مدیر کانون');
      const classIns = [4, 5, 6, 7, 8, 9];
      for (const g of classIns) run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', cid, g, 'الف');
    });
    return { ok: true };
  });
  r.put('/api/admin/centers/:id', A, (ctx) => {
    const b = ctx.body;
    run('UPDATE centers SET name=COALESCE(?,name), tagline=COALESCE(?,tagline), color=COALESCE(?,color), logo=COALESCE(?,logo) WHERE id=?',
      clampStr(b.name, 100) || null, b.tagline != null ? clampStr(b.tagline, 150) : null, /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : null, b.logo ? clampStr(b.logo, 200000) : null, Number(ctx.params.id));
    return { ok: true };
  });

  r.get('/api/admin/users', A, (ctx) => {
    const q = `%${toEnDigits(ctx.query.q || '').trim()}%`;
    return all(`SELECT u.id, u.role, u.full_name, u.username, u.national_code, u.mobile, u.active, c.name center FROM users u LEFT JOIN centers c ON c.id=u.center_id
      WHERE (u.full_name LIKE ? OR u.username LIKE ? OR u.national_code LIKE ? OR u.mobile LIKE ?) ${ctx.query.role ? 'AND u.role=?' : ''}
      ORDER BY u.role, u.full_name LIMIT 60`, ...[q, q, q, q, ...(ctx.query.role ? [ctx.query.role] : [])]);
  });
  r.post('/api/admin/users/:id/reset-password', A, (ctx) => {
    const pw = String(ctx.body.password || '');
    if (pw.length < 6) fail(400, 'رمز جدید حداقل ۶ کاراکتر');
    run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(pw), Number(ctx.params.id));
    return { ok: true };
  });
  r.post('/api/admin/users/:id/toggle', A, (ctx) => {
    run(`UPDATE users SET active=1-active WHERE id=? AND role<>'admin'`, Number(ctx.params.id));
    return { ok: true };
  });
  // دسترسی کامل: ورود به پنل هر کاربر برای پشتیبانی
  r.post('/api/admin/impersonate/:id', A, (ctx) => {
    const u = get('SELECT * FROM users WHERE id=? AND role<>?', Number(ctx.params.id), 'admin');
    if (!u) fail(404, 'کاربر یافت نشد');
    setSession(ctx, u, { imp: ctx.user.id });
    return { ok: true, role: u.role };
  });

  r.post('/api/admin/backup', A, () => { const b = makeBackup('manual'); pruneBackups(); return { ok: true, name: b.name }; });
  r.get('/api/admin/metrics', A, () => ({ ...snapshot(), static_cache: staticCacheStats() }));
  r.get('/api/admin/backup/:name', A, (ctx) => {
    const name = path.basename(ctx.params.name);
    const file = path.join(BACKUP_DIR, name);
    if (!name.endsWith('.db') || !fs.existsSync(file)) fail(404, 'فایل پشتیبان یافت نشد');
    ctx.handled = true;
    ctx.res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(ctx.res);
  });
  r.post('/api/admin/restore', A, (ctx) => {
    let buf;
    if (ctx.body.name) {
      const file = path.join(BACKUP_DIR, path.basename(ctx.body.name));
      if (!fs.existsSync(file)) fail(404, 'فایل پشتیبان یافت نشد');
      buf = fs.readFileSync(file);
    } else if (ctx.body.file?.data) {
      buf = Buffer.from(String(ctx.body.file.data).split(',').pop(), 'base64');
    } else fail(400, 'فایل پشتیبان را انتخاب کنید');
    if (buf.subarray(0, 15).toString() !== 'SQLite format 3') fail(400, 'فایل انتخابی پایگاه داده معتبر نیست');
    makeBackup('safety'); // پشتیبان ایمنی قبل از بازیابی
    closeDb();
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(DB_PATH + ext)) fs.rmSync(DB_PATH + ext);
    fs.writeFileSync(DB_PATH, buf);
    openDb();
    return { ok: true };
  });
}
