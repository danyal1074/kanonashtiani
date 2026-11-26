// Pilot textbooks are private, demo-only assets. Every file request repeats course authorization.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, get, all } from '../db.js';
import { fail } from '../util.js';
import { serveFile } from '../http.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../textbooks.json', import.meta.url), 'utf8'));
const root = () => path.resolve(process.env.ROSHD_TEXTBOOKS_DIR || path.join(DATA_DIR, 'textbooks', 'pilot'));
const normalize = value => String(value || '').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim();
const exists = b => fs.existsSync(path.join(root(), b.id, 'source.pdf')) && fs.existsSync(path.join(root(), b.id, 'pages', 'page_1.jpg'));
function allowed(user, book) {
  if (user.role === 'student') return get('SELECT grade FROM students WHERE user_id=?', user.id)?.grade === book.grade;
  if (user.role === 'teacher') return all('SELECT c.grade, tc.subject FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=?', user.id).some(row => row.grade === book.grade && normalize(row.subject).split(/[،,]/).some(subject => normalize(subject) === book.subject_key || book.subject_key === 'علوم' && normalize(subject) === 'علوم تجربی'));
  return false;
}
export function availableTextbooks(user) {
  if (process.env.ROSHD_DEMO !== '1') return [];
  return catalog.filter(book => allowed(user, book) && exists(book));
}
function bookFor(ctx) {
  if (process.env.ROSHD_DEMO !== '1') fail(404,'این بخش فقط در نسخهٔ دمو فعال است');
  const book = catalog.find(b => b.id === ctx.params.id);
  if (!book || !allowed(ctx.user, book)) fail(403,'این کتاب مربوط به پایه یا درس شما نیست');
  if (!exists(book)) fail(404,'فایل کتاب هنوز آماده نیست');
  return book;
}
export default function register(r) {
  const roles = { roles:['teacher','student'] };
  r.get('/api/textbooks', roles, ctx => {
    if (process.env.ROSHD_DEMO !== '1') fail(404,'این بخش فقط در نسخهٔ دمو فعال است');
    return { demo:true, generation_enabled:false, books:availableTextbooks(ctx.user) };
  });
  r.get('/api/textbooks/:id', roles, ctx => ({ ...bookFor(ctx), generation_enabled:false }));
  r.get('/api/textbooks/:id/pages/:page', roles, async ctx => {
    const book=bookFor(ctx), n=Number(ctx.params.page);
    if (!/^\d+$/.test(ctx.params.page) || !Number.isInteger(n) || n<1 || n>book.printed_pages) fail(400,'شمارهٔ صفحه نامعتبر است');
    const file=path.join(root(), book.id, 'pages', `page_${n}.jpg`);
    if (!fs.existsSync(file)) fail(404,'تصویر صفحه موجود نیست');
    ctx.handled=true;
    await serveFile(ctx.req,ctx.res,file,{priv:true});
  });
  r.get('/api/textbooks/:id/file', roles, async ctx => {
    const book=bookFor(ctx);ctx.handled=true;
    await serveFile(ctx.req,ctx.res,path.join(root(),book.id,'source.pdf'),{priv:true,download:`${book.title}.pdf`});
  });
}
