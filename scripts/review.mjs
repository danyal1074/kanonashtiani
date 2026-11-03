// بازبینی خودکار تغییرات (برای ناظر): npm run review [-- --base main] [--quick]
// ۱) نحو همه فایل‌ها  ۲) مرز فایل‌های تغییرکرده نسبت به شاخه پایه  ۳) قواعد ایمنی  ۴) تست دودی  ۵) تست بار ۵۰۰ نفر با آستانه‌ها
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const BASE = opt('base', 'HEAD');
const QUICK = args.includes('--quick');
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o });
const results = [];
const add = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

// ۱) نحو
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['node_modules', 'data', 'uploads', 'deploy', '.git', '.claude'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
const jsFiles = ['server', 'scripts', 'public/js'].flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : [])).filter((f) => /\.(m?js)$/.test(f));
const bad = jsFiles.filter((f) => run(process.execPath, ['--check', f]).status !== 0);
add('نحو فایل‌های جاوااسکریپت', !bad.length, bad.length ? bad.map((f) => path.relative(ROOT, f)).join(', ') : `${jsFiles.length} فایل`);

// ۲) مرز تغییرات
const changed = run('git', ['diff', '--name-only', BASE]).stdout.split('\n').filter(Boolean).concat(run('git', ['ls-files', '-o', '--exclude-standard']).stdout.split('\n').filter(Boolean));
const ALLOWED = [/^server\//, /^scripts\//, /^deploy\//, /^docs\//, /^public\//, /^data\//, /^README\.md$/, /^package(-lock)?\.json$/, /^\.gitignore$/];
const outside = changed.filter((f) => !ALLOWED.some((r) => r.test(f)));
add('تغییرات فقط در server/ scripts/ deploy/ docs/', !outside.length, outside.length ? `خارج از مرز: ${outside.slice(0, 8).join(', ')}` : `${changed.length} فایل`);

// ۳) قواعد ایمنی
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
add('بدون وابستگی npm تازه', !Object.keys(pkg.dependencies || {}).length && !Object.keys(pkg.devDependencies || {}).length);
const serverSrc = jsFiles.filter((f) => f.includes(`${path.sep}server${path.sep}`)).map((f) => [f, fs.readFileSync(f, 'utf8')]);
const risky = serverSrc.flatMap(([f, t]) => [[/\beval\s*\(|new Function\s*\(/, 'eval/new Function'], [/child_process/, 'child_process'], [/console\.(log|warn|error)\([^)]*(password|pass_hash|secret)/i, 'چاپ رمز یا راز در لاگ']].filter(([re]) => re.test(t)).map(([, n]) => `${path.basename(f)}: ${n}`));
add('الگوهای پرخطر در server/', !risky.length, risky.join('; '));
const tracked = run('git', ['ls-files']).stdout.split('\n');
const secrets = tracked.filter((f) => /(^|\/)(secret\.key|\.env)$|\.db(-wal|-shm)?$/.test(f));
add('فایل راز یا پایگاه داده در گیت نیست', !secrets.length, secrets.join(', '));
const sm = fs.readFileSync(path.join(ROOT, 'scripts/smoke.mjs'), 'utf8');
const baseSm = run('git', ['show', `${BASE}:scripts/smoke.mjs`]);
if (baseSm.status === 0) {
  const count = (t) => (t.match(/check\(/g) || []).length;
  add('تست دودی کوچک‌تر نشده (بررسی‌ها حذف نشده)', count(sm) >= count(baseSm.stdout), `${count(baseSm.stdout)} ← ${count(sm)} بررسی در کد`);
}

// ۴) تست دودی
const smoke = run(process.execPath, ['scripts/smoke.mjs'], { timeout: 300_000 });
const sline = (smoke.stdout.match(/تست دودی: .*/) || ['اجرا نشد'])[0];
add('تست دودی (دسترسی و جریان‌های اصلی)', smoke.status === 0, sline + (smoke.status ? '\n' + smoke.stdout.split('\n').filter((l) => l.includes('✗')).join('\n') : ''));

// ۵) تست بار
if (!QUICK) {
  const lt = run(process.execPath, ['scripts/loadtest.mjs', '--users', '500', '--minutes', '0.5', '--warm', '--json'], { timeout: 600_000 });
  const m = /JSON:(.*)/.exec(lt.stdout || '');
  if (!m) add('تست بار ۵۰۰ نفر', false, 'اجرا نشد\n' + (lt.stderr || '').slice(0, 400));
  else {
    const j = JSON.parse(m[1]);
    const api = j.rows.filter((r) => !r.name.startsWith('static') && r.name !== 'POST login');
    const worst = api.reduce((a, r) => (r.p95 > a.p95 ? r : a), { p95: 0, name: '-' });
    const login = j.rows.find((r) => r.name === 'POST login');
    add('تست بار: بدون خطا', j.errors === 0, `${j.total} درخواست، خطا ${j.errors}`);
    add('تست بار: p95 مسیرهای API زیر ۵۰۰ms', worst.p95 < 500, `بدترین ${worst.name}: ${worst.p95}ms`);
    add('تست بار: p95 ورود زیر ۲۰۰۰ms', !login || login.p95 < 2000, `${login?.p95}ms`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? 'نتیجه: ردشده' : 'نتیجه: تأییدشده'} — ${results.length - failed.length} از ${results.length} بررسی موفق`);
process.exit(failed.length ? 1 : 0);
