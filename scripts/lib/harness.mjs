// Shared in-process route harness for integration tests: real production handlers,
// real SQLite (in a disposable temp directory), signed cookies, role metadata.
// Usage: const h = await createHarness(); ... h.cleanup();
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function createHarness(prefix = 'roshd-test-') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.ROSHD_DATA_DIR = path.join(tmp, 'data');
  process.env.ROSHD_UPLOAD_DIR = path.join(tmp, 'uploads');
  const dbm = await import('../../server/db.js');
  const util = await import('../../server/util.js');
  const { Router, COOKIE, parseCookies } = await import('../../server/http.js');
  const router = new Router();
  for (const name of ['common', 'student', 'teacher', 'manager', 'admin', 'counselor', 'finance', 'bank', 'staff']) {
    const file = new URL(`../../server/routes/${name}.js`, import.meta.url);
    if (fs.existsSync(file)) (await import(file.href)).default(router);
  }
  const { db } = dbm;
  async function request(cookie, method, uri, body) {
    const url = new URL(uri, 'http://local.test');
    const match = router.match(method, url.pathname);
    if (!match) return { status: 404, data: { error: 'Unknown route' } };
    const { route, params } = match;
    const token = util.readToken(parseCookies(cookie || '')[COOKIE]);
    let user = token ? db.prepare('SELECT * FROM users WHERE id=?').get(token.uid) : null;
    if (!user?.active || (token?.pv && token.pv !== user.pass_hash.slice(-8))) user = null;
    if (user?.role === 'parent' && !route.roles?.includes('parent')) user = null;
    const headers = new Map();
    const ctx = {
      user, params, query: Object.fromEntries(url.searchParams), body: body || {}, ip: '127.0.0.1',
      req: { headers: {}, socket: { encrypted: false } },
      res: { setHeader: (name, value) => headers.set(name.toLowerCase(), value) },
      impersonator: null,
    };
    try {
      if (route.auth !== false && !user) throw new util.HttpError(401, 'Authentication required');
      if (route.roles && !route.roles.includes(user?.role)) throw new util.HttpError(403, 'Role denied');
      return { status: 200, data: await route.handler(ctx), cookie: headers.get('set-cookie')?.split(';')[0] };
    } catch (error) {
      if (!(error instanceof util.HttpError)) throw error;
      return { status: error.status, data: { error: error.message } };
    }
  }
  const password = 'PlatformTest#123';
  const passHash = util.hashPassword(password, 1024);
  async function login(role, identifier, pw = password) {
    const r = await request(null, 'POST', '/api/auth/login', { role, identifier, password: pw });
    if (r.status !== 200) throw new Error(`login ${role}/${identifier}: ${JSON.stringify(r.data)}`);
    return r.cookie;
  }
  let checks = 0, failures = 0;
  async function test(name, fn) {
    try { await fn(); checks++; console.log(`✓ ${name}`); }
    catch (e) { failures++; console.log(`✗ ${name}\n  ${e.stack?.split('\n').slice(0, 4).join('\n  ')}`); }
  }
  return {
    db, dbm, util, request, login, password, passHash, test,
    get: (c, u) => request(c, 'GET', u), post: (c, u, b) => request(c, 'POST', u, b), put: (c, u, b) => request(c, 'PUT', u, b), del: (c, u, b) => request(c, 'DELETE', u, b),
    summary(label) { console.log(`\n${label}: ${checks} passed, ${failures} failed`); if (failures) process.exitCode = 1; },
    cleanup() { try { dbm.closeDb(); } catch { /* */ } fs.rmSync(tmp, { recursive: true, force: true }); },
  };
}
