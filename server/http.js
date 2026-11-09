// چارچوب HTTP سبک: مسیریابی، بدنه JSON، کوکی، فایل ایستا با کش حافظه، فشرده‌سازی و ETag
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { HttpError } from './util.js';

const gzipAsync = promisify(zlib.gzip);
const brotliAsync = promisify(zlib.brotliCompress);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.zip': 'application/zip', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest', '.ico']);
// فایل‌هایی که تغییرشان نادر است و بدون بررسی دوباره چند روز کش می‌شوند
const LONG_CACHE = new Set(['.woff2', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.mp3', '.mp4']);

export class Router {
  routes = [];
  add(method, pattern, opts, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler, ...opts });
  }
  get(p, o, h) { this.add('GET', p, o, h); }
  post(p, o, h) { this.add('POST', p, o, h); }
  put(p, o, h) { this.add('PUT', p, o, h); }
  del(p, o, h) { this.add('DELETE', p, o, h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

export const COOKIE = 'roshd_session';

// پشت پروکسی معتبر (Nginx) آدرس واقعی کاربر از X-Forwarded-For خوانده می‌شود؛ در غیر این صورت قابل جعل است.
export const TRUST_PROXY = process.env.ROSHD_TRUST_PROXY === '1';
// آخرین آدرس هدر را پروکسی خودمان افزوده است (ابتدای هدر را کاربر می‌تواند جعل کند)
export const clientIp = (req) => (TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',').pop().trim() : req.socket.remoteAddress) || 'unknown';
export const isHttps = (req) => !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || process.env.ROSHD_COOKIE_SECURE === '1';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* کوکی خراب */ }
  }
  return out;
}

// ورودی‌های فقط‌عددیِ دارای ارقام فارسی/عربی (کد ملی، موبایل، مبلغ، نمره، تاریخ…) به ارقام انگلیسی تبدیل می‌شوند.
// متن آزاد (نام، نشانی، پاسخ) و رمزها دست نمی‌خورند.
const NUMLIKE = /^[\s\d۰-۹٠-٩.,\-+/:]+$/, HAS_FA_DIGIT = /[۰-۹٠-٩]/, KEEP_KEYS = new Set(['password', 'current', 'next', 'pw']);
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const digitsReviver = (k, v) => (typeof v === 'string' && !KEEP_KEYS.has(k) && HAS_FA_DIGIT.test(v) && NUMLIKE.test(v)
  ? v.replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d)) : v);

export function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { req.resume(); return reject(new HttpError(413, 'حجم درخواست بیش از حد مجاز است')); }
    let size = 0;
    const chunks = [];
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; chunks.length = 0; reject(new HttpError(413, 'حجم درخواست بیش از حد مجاز است')); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'), digitsReviver)); } catch { reject(new HttpError(400, 'بدنه درخواست نامعتبر است')); }
    });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    req.on('aborted', () => { if (!done) { done = true; reject(new HttpError(400, 'ارتباط قطع شد')); } });
  });
}

const acceptsEnc = (req, enc) => (String(req?.headers?.['accept-encoding'] || '').includes(enc));

export function sendJson(res, status, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data));
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  if (body.length > 1400 && acceptsEnc(res.req, 'gzip')) {
    // JSON‌های بزرگ (فهرست دانش‌آموزان، دفتر کل) فشرده ارسال می‌شوند
    const z = body.length < 262144 ? zlib.gzipSync(body, { level: 3 }) : null;
    const send = (buf) => { res.writeHead(status, { ...h, 'Content-Encoding': 'gzip', 'Content-Length': buf.length, Vary: 'Accept-Encoding' }); res.end(buf); };
    if (z) return send(z);
    return gzipAsync(body, { level: 3 }).then(send, () => { res.writeHead(status, { ...h, 'Content-Length': body.length }); res.end(body); });
  }
  res.writeHead(status, { ...h, 'Content-Length': body.length });
  res.end(body);
}

// ---------- فایل ایستا: کش حافظه + ETag + Brotli/gzip ----------
const cache = new Map();            // مسیر فایل → ورودی کش
const CACHE_MAX_FILE = 3 * 1024 * 1024;
const CACHE_MAX_TOTAL = 96 * 1024 * 1024;
const RECHECK_MS = Number(process.env.ROSHD_STATIC_RECHECK_MS || 2000); // هر چند میلی‌ثانیه یک بار تغییر فایل بررسی شود
let cacheBytes = 0;

function dropEntry(file) { const e = cache.get(file); if (e) { cacheBytes -= e.bytes || 0; cache.delete(file); } }

async function loadEntry(file, ext) {
  let e = cache.get(file);
  const now = Date.now();
  if (e && now - e.checked < RECHECK_MS) return e;
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st || !st.isFile()) { dropEntry(file); return null; }
  if (e && e.mtimeMs === st.mtimeMs && e.size === st.size) { e.checked = now; return e; }
  dropEntry(file);
  e = { file, ext, mtimeMs: st.mtimeMs, size: st.size, checked: now, etag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`, raw: null, gz: null, br: null, bytes: 0 };
  if (st.size <= CACHE_MAX_FILE && cacheBytes + st.size * 2 < CACHE_MAX_TOTAL) {
    e.raw = await fs.promises.readFile(file);
    e.bytes = e.raw.length;
    if (COMPRESSIBLE.has(ext) && e.raw.length > 512) {
      [e.br, e.gz] = await Promise.all([
        brotliAsync(e.raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: e.raw.length } }),
        gzipAsync(e.raw, { level: 6 }),
      ]);
      e.bytes += e.br.length + e.gz.length;
    }
    cacheBytes += e.bytes;
  }
  cache.set(file, e);
  return e;
}

// خدمت‌دهی فایل. گزینه‌ها: download (نام دانلود)، sandbox (برای فایل‌های بارگذاری‌شده کاربر)، priv (کش خصوصی)
export async function serveFile(req, res, file, { download = null, sandbox = false, priv = false } = {}) {
  const ext = path.extname(file).toLowerCase();
  let e;
  try { e = await loadEntry(file, ext); } catch { e = null; }
  if (!e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('یافت نشد'); }

  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ETag: e.etag,
    'Last-Modified': new Date(e.mtimeMs).toUTCString(),
    'Cache-Control': priv ? 'private, no-cache' : LONG_CACHE.has(ext) ? 'public, max-age=604800' : 'no-cache',
    'Accept-Ranges': 'bytes',
  };
  if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  if (sandbox) headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";

  if (req.headers['if-none-match'] === e.etag) { delete headers['Content-Type']; res.writeHead(304, headers); return res.end(); }

  let body = e.raw, enc = null;
  if (e.br && acceptsEnc(req, 'br')) { body = e.br; enc = 'br'; } else if (e.gz && acceptsEnc(req, 'gzip')) { body = e.gz; enc = 'gzip'; }
  if (enc) headers['Content-Encoding'] = enc;

  if (body) {
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    return req.method === 'HEAD' ? res.end() : res.end(body);
  }

  // فایل بزرگ (مثلاً ویدیو): جریان‌خوانی با پشتیبانی از Range برای پیش‌روی ویدیو
  let start = 0, end = e.size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    if (m[1] === '') { start = Math.max(0, e.size - Number(m[2])); } else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
    if (start > end || start >= e.size) { res.writeHead(416, { 'Content-Range': `bytes */${e.size}` }); return res.end(); }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${e.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

export function safeJoin(base, rel) {
  if (rel.includes('\0')) return null;
  const p = path.normalize(path.join(base, rel));
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

export const staticCacheStats = () => ({ files: cache.size, bytes: cacheBytes });
