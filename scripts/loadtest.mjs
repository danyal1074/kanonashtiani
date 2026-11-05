// تست بار: شبیه‌سازی دانش‌آموزان هم‌زمان (ورود دسته‌جمعی + گشت‌وگذار + ثبت فعالیت)
// اجرا:  node scripts/loadtest.mjs --users 500 --minutes 1
// بدون --url، یک سرور موقت با پایگاه داده نمونه جداگانه بالا می‌آید (به داده اصلی دست نمی‌زند).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const USERS = Number(arg('users', 500));
const MINUTES = Number(arg('minutes', 1));
const EXAM = !!arg('exam', false); // اوج آزمون: همه هم‌زمان آزمون آنلاین را شروع و ارسال می‌کنند
const WARM = !!arg('warm', false); // مرورگر فایل‌ها را از قبل کش کرده است (روز دوم به بعد)
const WAVE_SECONDS = Number(arg('wave', 10)); // بازه‌ای که همه ورود می‌کنند (۵۰۰ نفر در ۱۰ ثانیه ≈ شروع کلاس)
const PORT = Number(arg('port', 3911));
let BASE = arg('url', null);

let child = null, tmp = null, dbPath = null;
if (!BASE) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-load-'));
  const env = { ...process.env, ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'uploads'), PORT: String(PORT) };
  console.log('ساخت داده نمونه موقت…');
  const s = spawnSync(process.execPath, ['server/seed.js'], { cwd: ROOT, env, encoding: 'utf8' });
  if (s.status !== 0) { console.error(s.stderr || s.stdout); process.exit(1); }
  dbPath = path.join(tmp, 'data', 'roshd.db');
  child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(d));
  BASE = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/public/centers')).ok) break; } catch { /* هنوز بالا نیامده */ } await new Promise((r) => setTimeout(r, 200)); }
} else {
  dbPath = arg('db', null);
}

// فهرست کد ملی دانش‌آموزان
let students = [];
if (dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  students = db.prepare(`SELECT national_code nc FROM users WHERE role='student' AND active=1 AND national_code NOT IN ('0012345679') ORDER BY id`).all().map((r) => r.nc);
  db.close();
}
// اگر تعداد خواسته‌شده از حساب‌های موجود بیشتر باشد، حساب‌ها با نشست‌های جداگانه تکرار می‌شوند
students = Array.from({ length: USERS }, (_, i) => students[i % students.length]);
if (!students.length) { console.error('کد ملی دانش‌آموزی پیدا نشد (برای --url گزینه --db را بدهید)'); process.exit(1); }
const N = students.length;
console.log(`هدف: ${N} دانش‌آموز هم‌زمان، ورود در ${WAVE_SECONDS} ثانیه، ${MINUTES} دقیقه فعالیت`);

// ---------- ابزار ----------
let examDone = 0;
const stats = new Map();
const etags = new Map();
const errors = new Map();
function rec(name, ms, status) {
  let s = stats.get(name); if (!s) stats.set(name, (s = { n: 0, ms: [], bad: 0 }));
  s.n++; s.ms.push(ms);
  if (status >= 400 && !(status === 423) && !(name === 'POST pomodoro' && status === 429)) { s.bad++; errors.set(`${name} ${status}`, (errors.get(`${name} ${status}`) || 0) + 1); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);

class Client {
  constructor() { this.cookie = ''; }
  async req(name, method, p, body) {
    const t = performance.now();
    let status = 0, data = null;
    try {
      const inm = method === 'GET' && etags.get(p);
      const r = await fetch(BASE + p, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...(inm ? { 'If-None-Match': inm } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
      if (method === 'GET' && r.headers.get('etag') && p.includes('.')) etags.set(p, r.headers.get('etag'));
      status = r.status;
      const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
      if (r.headers.get('content-type')?.includes('json')) { const txt = await r.text(); try { data = JSON.parse(txt); } catch { data = txt; } }
      else await r.arrayBuffer(); // فایل ایستا: فقط دریافت
    } catch (e) { status = 599; errors.set(`${name} ${e.cause?.code || e.message}`, (errors.get(`${name} ${e.cause?.code || e.message}`) || 0) + 1); }
    rec(name, performance.now() - t, status);
    return { status, data };
  }
}

const ASSETS = ['/', '/css/app.css', '/css/reference.css', '/js/app.js', '/js/core.js', '/js/icons.js', '/js/login.js', '/js/student.js', '/js/shop.js', '/js/common.js', '/js/games.js', '/js/teacher.js', '/js/manager.js', '/js/admin.js', '/js/reference-ui.js', '/js/profile-photo.js', '/fonts/Vazirmatn.woff2', '/img/education-icons-3d.png', '/img/education-icons-actions-3d.png', '/img/education-icons-tools-3d.png', '/img/logo-ashtiani.png'];

async function loadAssets(c) {
  if (WARM && !etags.size) { const w = new Client(); for (const p of ASSETS) await w.req('warmup', 'GET', p); stats.delete('warmup'); }
  // مرورگر تازه‌وارد: همه فایل‌ها را (با ۶ اتصال هم‌زمان) می‌گیرد
  const q = [...ASSETS];
  await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) { const p = q.shift(); await c.req('static ' + (p === '/' ? 'index' : p.split('.').pop()), 'GET', p); } }));
}

const stopAt = { t: 0 };
async function student(i) {
  const c = new Client();
  await sleep((i / N) * WAVE_SECONDS * 1000);
  await loadAssets(c);
  const login = await c.req('POST login', 'POST', '/api/auth/login', { role: 'student', identifier: students[i], password: '123456' });
  if (login.status !== 200) return;
  const me = await c.req('GET me', 'GET', '/api/me');
  if (me.data?.fee?.locked) return;
  for (const u of me.data?.unseen || []) await c.req('POST announcement seen', 'POST', `/api/announcements/${u.id}/seen`);
  await c.req('GET dashboard', 'GET', '/api/student/dashboard');
  if (EXAM) {
    const e = await c.req('GET exams', 'GET', '/api/student/exams');
    const open = e.data?.find?.((x) => x.percent == null);
    if (open) {
      const st = await c.req('POST exam start', 'POST', `/api/student/exams/${open.id}/start`);
      if (st.status === 200) {
        for (let q = 0; q < st.data.questions.length; q++) await sleep(jitter(200, 700));
        const r = await c.req('POST exam submit', 'POST', `/api/student/exams/${open.id}/submit`, { answers: st.data.questions.map(() => Math.floor(Math.random() * 4)) });
        if (r.status === 200) examDone++;
      }
    }
    return;
  }
  while (performance.now() < stopAt.t) {
    await sleep(jitter(1500, 5000));
    const pick = Math.random();
    if (pick < 0.18) await c.req('GET assignments', 'GET', '/api/student/assignments');
    else if (pick < 0.32) await c.req('GET exams', 'GET', '/api/student/exams');
    else if (pick < 0.44) await c.req('GET study', 'GET', '/api/student/study');
    else if (pick < 0.55) await c.req('GET dashboard', 'GET', '/api/student/dashboard');
    else if (pick < 0.65) await c.req('GET profile', 'GET', '/api/student/profile');
    else if (pick < 0.73) await c.req('GET results', 'GET', '/api/student/results');
    else if (pick < 0.80) await c.req('GET learning-path', 'GET', '/api/student/learning-path');
    else if (pick < 0.88) { const k = await c.req('GET contacts', 'GET', '/api/messages/contacts'); const t = k.data?.[0]; if (t) { await c.req('GET thread', 'GET', `/api/messages/${t.id}`); if (Math.random() < 0.3) await c.req('POST message', 'POST', '/api/messages', { to: t.id, body: 'سلام، تست بار' }); } }
    else if (pick < 0.94) await c.req('POST pomodoro', 'POST', '/api/student/pomodoro', { subject: 'ریاضی', minutes: 25 });
    else { const e = await c.req('GET exams', 'GET', '/api/student/exams'); const open = e.data?.find?.((x) => x.percent == null && !x.started_at); if (open && Math.random() < 0.5) { const st = await c.req('POST exam start', 'POST', `/api/student/exams/${open.id}/start`); if (st.status === 200) { await sleep(jitter(1500, 4000)); await c.req('POST exam submit', 'POST', `/api/student/exams/${open.id}/submit`, { answers: st.data.questions.map(() => Math.floor(Math.random() * 4)) }); } } }
  }
}

// نمونه‌برداری از حافظه/CPU سرور
let sampler;
if (child) {
  const peak = { rss: 0 };
  globalThis.__peak = peak;
  sampler = setInterval(() => { try { const out = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${child.pid}).WorkingSet64`], { encoding: 'utf8' }); const v = Number(out.stdout); if (v > peak.rss) peak.rss = v; } catch { /* */ } }, 2000);
}

const t0 = performance.now();
stopAt.t = t0 + (WAVE_SECONDS + MINUTES * 60) * 1000;
await Promise.all(students.map((_, i) => student(i)));
const secs = (performance.now() - t0) / 1000;
clearInterval(sampler);

// ---------- گزارش ----------
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
let total = 0, bad = 0;
const rows = [...stats.entries()].map(([name, s]) => { s.ms.sort((a, b) => a - b); total += s.n; bad += s.bad; return { name, n: s.n, bad: s.bad, p50: pct(s.ms, .5), p95: pct(s.ms, .95), p99: pct(s.ms, .99), max: s.ms[s.ms.length - 1] }; }).sort((a, b) => b.p95 - a.p95);
console.log(`\nمدت: ${secs.toFixed(0)} ثانیه • ${total} درخواست (${(total / secs).toFixed(0)} در ثانیه) • خطا: ${bad}`);
console.log('endpoint'.padEnd(30), 'n'.padStart(6), 'p50'.padStart(7), 'p95'.padStart(7), 'p99'.padStart(7), 'max'.padStart(7), 'err'.padStart(5));
for (const r of rows) console.log(r.name.padEnd(30), String(r.n).padStart(6), r.p50.toFixed(0).padStart(7), r.p95.toFixed(0).padStart(7), r.p99.toFixed(0).padStart(7), r.max.toFixed(0).padStart(7), String(r.bad).padStart(5));
if (errors.size) console.log('\nخطاها:', Object.fromEntries(errors));
if (globalThis.__peak?.rss) console.log(`اوج حافظه سرور: ${(globalThis.__peak.rss / 1048576).toFixed(0)} مگابایت`);
if (EXAM) console.log(`آزمون‌های ثبت‌شده: ${examDone} از ${N}`);
const apiRows = rows.filter((r) => !r.name.startsWith('static'));
const worst = Math.max(...apiRows.map((r) => r.p95));
console.log(`\nبدترین p95 در API: ${worst.toFixed(0)} میلی‌ثانیه`);
if (arg('json', false)) console.log('JSON:' + JSON.stringify({ users: N, secs: Math.round(secs), total, errors: bad, worstApiP95: Math.round(worst), rows: rows.map((r) => ({ name: r.name, n: r.n, p95: Math.round(r.p95), bad: r.bad })) }));
if (child) { child.kill(); await sleep(300); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
process.exit(bad ? 1 : 0);
