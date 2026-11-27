// ۱۲ کتاب درسی ریاضی و علوم پایه چهارم تا نهم + یادداشت‌برداری صفحه‌ای و نقاشی
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, get, all, run } from '../db.js';
import { fail } from '../util.js';
import { serveFile } from '../http.js';
import { aiStatus } from '../textbook-ai.js';

export { bookFor, root as textbookRoot, allowed as bookAllowed, normalize };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const libCatalogPath = new URL('../textbooks-library.json', import.meta.url);
const fallbackCatalogPath = new URL('../textbooks.json', import.meta.url);
const catalog = JSON.parse(
  fs.readFileSync(fs.existsSync(libCatalogPath) ? libCatalogPath : fallbackCatalogPath, 'utf8')
);

const root = () => {
  if (process.env.ROSHD_TEXTBOOKS_DIR) return path.resolve(process.env.ROSHD_TEXTBOOKS_DIR);
  const dataLib = path.join(DATA_DIR, 'textbooks', 'library');
  if (fs.existsSync(dataLib)) return dataLib;
  const repoLib = path.join(ROOT, 'data', 'textbooks', 'library');
  if (fs.existsSync(repoLib)) return repoLib;
  return path.join(DATA_DIR, 'textbooks', 'pilot');
};

const bookDir = (bookId) => {
  const r = root();
  const direct = path.join(r, bookId);
  if (fs.existsSync(direct)) return direct;
  const repoFallback = path.join(ROOT, 'data', 'textbooks', 'library', bookId);
  if (fs.existsSync(repoFallback)) return repoFallback;
  return path.join(DATA_DIR, 'textbooks', 'pilot', bookId);
};

const normalize = (value) => String(value || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ').trim();

const exists = (b) => {
  const dir = bookDir(b.id);
  return fs.existsSync(path.join(dir, 'source.pdf')) && fs.existsSync(path.join(dir, 'pages', 'page_1.jpg'));
};

function allowed(user, book) {
  if (!user || !book) return false;
  if (['teacher', 'manager', 'admin'].includes(user.role)) return true;
  if (user.role === 'student') {
    const st = get('SELECT grade FROM students WHERE user_id=?', user.id);
    return st?.grade === book.grade;
  }
  return false;
}

export function availableTextbooks(user) {
  return catalog.filter((book) => allowed(user, book) && exists(book));
}

function bookFor(ctx) {
  const book = catalog.find((b) => b.id === ctx.params.id);
  if (!book || !allowed(ctx.user, book)) fail(403, 'این کتاب مربوط به پایه یا درس شما نیست');
  if (!exists(book)) fail(404, 'فایل کتاب هنوز آماده نیست');
  return book;
}

export default function register(r) {
  const roles = { roles: ['teacher', 'student', 'manager', 'admin'] };

  r.get('/api/textbooks', roles, (ctx) => ({
    demo: true,
    generation_enabled: aiStatus().enabled,
    ai: aiStatus(),
    books: availableTextbooks(ctx.user),
  }));

  r.get('/api/textbooks/:id', roles, (ctx) => ({
    ...bookFor(ctx),
    generation_enabled: aiStatus().enabled,
    ai: aiStatus(),
  }));

  r.get('/api/textbooks/:id/cover', roles, async (ctx) => {
    const book = bookFor(ctx);
    const dir = bookDir(book.id);
    const cover = fs.existsSync(path.join(dir, 'cover.jpg'))
      ? path.join(dir, 'cover.jpg')
      : path.join(dir, 'pages', 'page_1.jpg');
    if (!fs.existsSync(cover)) fail(404, 'تصویر جلد موجود نیست');
    ctx.handled = true;
    await serveFile(ctx.req, ctx.res, cover, { priv: true });
  });

  r.get('/api/textbooks/:id/pages/:page', roles, async (ctx) => {
    const book = bookFor(ctx);
    const n = Number(ctx.params.page);
    if (!/^\d+$/.test(ctx.params.page) || !Number.isInteger(n) || n < 1 || n > book.printed_pages) {
      fail(400, 'شمارهٔ صفحه نامعتبر است');
    }
    const file = path.join(bookDir(book.id), 'pages', `page_${n}.jpg`);
    if (!fs.existsSync(file)) fail(404, 'تصویر صفحه موجود نیست');
    ctx.handled = true;
    await serveFile(ctx.req, ctx.res, file, { priv: true });
  });

  r.get('/api/textbooks/:id/file', roles, async (ctx) => {
    const book = bookFor(ctx);
    ctx.handled = true;
    await serveFile(ctx.req, ctx.res, path.join(bookDir(book.id), 'source.pdf'), {
      priv: true,
      download: `${book.title}.pdf`,
    });
  });

  // یادداشت‌ها و نقاشی‌های روی صفحات کتاب
  r.get('/api/textbooks/:id/notes', roles, (ctx) => {
    const book = bookFor(ctx);
    return all(
      'SELECT page, note_text, updated_at FROM textbook_notes WHERE user_id=? AND book_id=? ORDER BY page',
      ctx.user.id, book.id
    );
  });

  r.get('/api/textbooks/:id/notes/:page', roles, (ctx) => {
    const book = bookFor(ctx);
    const n = Number(ctx.params.page);
    if (!Number.isInteger(n) || n < 1 || n > book.printed_pages) fail(400, 'شمارهٔ صفحه نامعتبر است');
    const row = get(
      'SELECT page, note_text, drawing_json, updated_at FROM textbook_notes WHERE user_id=? AND book_id=? AND page=?',
      ctx.user.id, book.id, n
    );
    return row || { page: n, note_text: '', drawing_json: '', updated_at: null };
  });

  r.put('/api/textbooks/:id/notes/:page', roles, (ctx) => {
    const book = bookFor(ctx);
    const n = Number(ctx.params.page);
    if (!Number.isInteger(n) || n < 1 || n > book.printed_pages) fail(400, 'شمارهٔ صفحه نامعتبر است');
    const noteText = String(ctx.body?.note_text ?? '').slice(0, 8000);
    const drawingJson = typeof ctx.body?.drawing_json === 'string'
      ? ctx.body.drawing_json.slice(0, 250000)
      : JSON.stringify(ctx.body?.drawing_json || '');
    run(
      `INSERT INTO textbook_notes (user_id, book_id, page, note_text, drawing_json, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, book_id, page) DO UPDATE SET
         note_text = excluded.note_text,
         drawing_json = excluded.drawing_json,
         updated_at = datetime('now')`,
      ctx.user.id, book.id, n, noteText, drawingJson
    );
    return { ok: true, page: n, note_text: noteText, drawing_json: drawingJson };
  });
}
