// Browser acceptance checks against a running demo server (never production).
// Usage: BASE=http://localhost:3100 OUT=/tmp/shots node scripts/e2e/browser.mjs [phase...]
// The server must use a disposable, seeded database (npm run seed with ROSHD_DATA_DIR).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3100';
const OUT = process.env.OUT || '.';
fs.mkdirSync(OUT, { recursive: true });
const phases = process.argv.slice(2);
const want = (p) => !phases.length || phases.includes(p);
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
async function session(role, identifier, password = '123456', viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport, locale: 'fa-IR', baseURL: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  const res = await page.request.post(`${BASE}/api/auth/login`, { data: { role, identifier, password } });
  if (!res.ok()) throw new Error(`login ${role}: ${res.status()} ${await res.text()}`);
  return { page, ctx, errors };
}
async function open(page, hash) {
  await page.goto(`${BASE}/#${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
const mod = {};
for (const file of fs.readdirSync(new URL('.', import.meta.url))) {
  const m = file.match(/^phase-(\w+)\.mjs$/);
  if (m) mod[m[1]] = (await import(new URL(file, import.meta.url).href)).default;
}
try {
  for (const [name, fn] of Object.entries(mod)) if (want(name)) await fn({ session, open, shot, check, BASE });
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nBrowser checks: ${results.length - failed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
