// مسیرهای بانک سؤالات، مدیریت کتب درسی و موتور آزمون داخلی (بدون API هوش مصنوعی)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, all, get, run, tx } from '../db.js';
import { fail } from '../util.js';
import { serveFile } from '../http.js';
import { readZip, sanitizeSvg, isAllowedAsset, sanitizeZipPath } from '../qb-zip.js';
import { parseXlsx } from '../qb-xlsx.js';
import {
  QUESTION_TYPES, QUESTION_STATUSES, normalizeText, sanitizeHtmlText,
  contentHash, textSimilarity, validateQuestion, mapXlsxRowsToQuestions,
} from '../qb-validator.js';
import {
  selectQuestionsForExam, toSafeStudentQuestion, gradeQuestionResponse, updateStudentPagePerformance,
} from '../qb-engine.js';

const ASSETS_ROOT = () => path.join(DATA_DIR, 'qb-assets');
const STAGING_ROOT = () => path.join(DATA_DIR, 'qb-staging');

function teacherScopes(user) {
  return all(
    'SELECT DISTINCT c.grade, tc.subject FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=?',
    user.id
  );
}

function canAccessBook(user, book) {
  if (!book) return false;
  if (book.center_id && user.center_id && book.center_id !== user.center_id) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  if (user.role === 'student') {
    const st = get('SELECT grade FROM students WHERE user_id=?', user.id);
    return st?.grade === book.grade;
  }
  if (user.role === 'teacher') {
    const scopes = teacherScopes(user);
    const subj = normalizeText(book.subject_key);
    return scopes.some((s) => s.grade === book.grade && normalizeText(s.subject).split(/[،,]/).some((x) => {
      const nx = normalizeText(x);
      return nx === subj || (subj === 'علوم' && nx === 'علوم تجربی') || (subj.includes('هوش') && nx.includes('هوش'));
    }));
  }
  return false;
}

function defaultEdition(bookId) {
  return get('SELECT * FROM textbook_editions WHERE book_id=? ORDER BY is_default DESC, id DESC LIMIT 1', bookId);
}

function resolvePageMapping(editionId, printedPage) {
  return get('SELECT * FROM textbook_pages WHERE edition_id=? AND printed_page=?', editionId, Number(printedPage));
}

function saveQuestionRecord(q, { centerId, ownerId, bookId, editionId, status = 'draft', batchId = null, assetsPrefix = null }) {
  const pageRow = resolvePageMapping(editionId, q.source?.primary_page || q.primary_page);
  const chapterId = q.chapter_id || pageRow?.chapter_id || (q.chapter ? get('SELECT id FROM textbook_chapters WHERE edition_id=? AND number=?', editionId, Number(q.chapter))?.id : null);
  const lessonId = q.lesson_id || pageRow?.lesson_id || (q.lesson && chapterId ? get('SELECT id FROM textbook_lessons WHERE chapter_id=? AND title=?', chapterId, String(q.lesson).trim())?.id : null);
  const primaryPage = Number(q.source?.primary_page ?? q.primary_page);
  const pages = Array.isArray(q.source?.pages) && q.source.pages.length ? [...new Set(q.source.pages.map(Number))] : [primaryPage];
  const hash = contentHash(q);

  const assets = (Array.isArray(q.assets) ? q.assets : []).map((a) => ({
    ...a,
    path: assetsPrefix && a.path && !a.path.startsWith('/api/') ? `${assetsPrefix}/${encodeURIComponent(path.basename(a.path))}` : a.path,
  }));
  const options = (Array.isArray(q.options) ? q.options : []).map((o) => ({
    ...o,
    asset_path: assetsPrefix && o.asset_path && !o.asset_path.startsWith('/api/') ? `${assetsPrefix}/${encodeURIComponent(path.basename(o.asset_path))}` : (o.asset_path || null),
  }));

  const flags = q.content_flags && typeof q.content_flags === 'object' ? q.content_flags : {
    has_image: assets.length > 0 || options.some((o) => o.asset_path),
    has_formula: /\$[^$]+\$/.test(q.stem || ''),
  };

  const res = run(
    `INSERT INTO questions (
      center_id, external_id, book_id, edition_id, chapter_id, lesson_id, primary_page, topic,
      type, difficulty, stem, table_json, content_flags_json, options_json, answer_json,
      explanation, score, estimated_time_seconds, tags_json, assets_json, status,
      content_hash, version, owner_id, batch_id, review_note
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
    centerId || null, q.external_id || null, bookId, editionId, chapterId || null, lessonId || null, primaryPage, q.topic || '',
    q.type, q.difficulty || 2, q.stem, q.table ? JSON.stringify(q.table) : null, JSON.stringify(flags),
    JSON.stringify(options), JSON.stringify(q.answer || {}), sanitizeHtmlText(q.explanation || ''),
    Number(q.score || 1), Number(q.estimated_time_seconds || 60), JSON.stringify(q.tags || []),
    JSON.stringify(assets), status, hash, ownerId, batchId, q.review_note || null
  );
  const qid = Number(res.lastInsertRowid);
  for (const p of pages) {
    run('INSERT INTO question_sources (question_id, edition_id, chapter_id, lesson_id, page_number, is_primary) VALUES (?,?,?,?,?,?)',
      qid, editionId, chapterId || null, lessonId || null, p, p === primaryPage ? 1 : 0);
  }
  run('INSERT INTO question_versions (question_id, version, snapshot_json, changed_by, change_note) VALUES (?,1,?,?,?)',
    qid, JSON.stringify({ ...q, assets, options }), ownerId, batchId ? 'ورود گروهی' : 'ثبت اولیه');
  run('INSERT INTO question_review_logs (question_id, from_status, to_status, actor_id, note) VALUES (?,?,?,?,?)',
    qid, null, status, ownerId, q.review_note || 'ثبت سؤال');
  return qid;
}

export default function registerQuestionBank(r) {
  const staff = { roles: ['teacher', 'manager', 'admin'] };
  const mgr = { roles: ['manager', 'admin'] };
  const allRoles = { roles: ['student', 'teacher', 'manager', 'admin'] };

  // ---------- قالب‌های استاندارد ----------
  r.get('/api/qb/templates/:name', staff, async (ctx) => {
    const allowed = new Set([
      'question-bank-template.xlsx',
      'question-bank-template.json',
      'question-package-example.zip',
      'question-package.schema.json',
    ]);
    if (!allowed.has(ctx.params.name)) fail(404, 'قالب درخواستی یافت نشد');
    const file = path.join(ROOT, 'templates', ctx.params.name);
    if (!fs.existsSync(file)) fail(404, 'فایل قالب آماده نیست');
    ctx.handled = true;
    await serveFile(ctx.req, ctx.res, file, { priv: true, download: ctx.params.name });
  });

  // ---------- سرو تصاویر سؤالات ----------
  r.get('/api/qb/assets/:batchId/:filename', allRoles, async (ctx) => {
    const safeBatch = String(ctx.params.batchId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFile = path.basename(String(ctx.params.filename || ''));
    if (!safeBatch || !safeFile || !isAllowedAsset(safeFile)) fail(400, 'نام فایل نامعتبر است');
    const file = path.join(ASSETS_ROOT(), safeBatch, safeFile);
    if (!fs.existsSync(file)) fail(404, 'تصویر یافت نشد');
    ctx.handled = true;
    await serveFile(ctx.req, ctx.res, file, { priv: true });
  });

  // ---------- مدیریت کتب درسی و ساختار سلسله‌مراتبی ----------
  r.get('/api/qb/books', allRoles, (ctx) => {
    const books = all('SELECT * FROM textbooks WHERE (center_id IS NULL OR center_id=?) ORDER BY grade, title', ctx.user.center_id || 0)
      .filter((b) => canAccessBook(ctx.user, b) && (b.published || ['manager', 'admin', 'teacher'].includes(ctx.user.role)));

    return books.map((b) => {
      const ed = defaultEdition(b.id);
      const qStats = ed ? get(
        `SELECT COUNT(*) total,
                SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published_count,
                COUNT(DISTINCT CASE WHEN status='published' THEN primary_page END) covered_pages
         FROM questions WHERE book_id=? AND edition_id=? AND (center_id IS NULL OR center_id=?)`,
        b.id, ed.id, ctx.user.center_id || 0
      ) : { total: 0, published_count: 0, covered_pages: 0 };
      const eduPages = ed ? (get('SELECT COUNT(*) c FROM textbook_pages WHERE edition_id=? AND excluded=0', ed.id)?.c || ed.printed_pages) : 0;
      const chaptersCount = ed ? (get('SELECT COUNT(*) c FROM textbook_chapters WHERE edition_id=?', ed.id)?.c || 0) : 0;
      return {
        ...b,
        edition: ed,
        chapters_count: chaptersCount,
        question_count: qStats?.total || 0,
        published_count: qStats?.published_count || 0,
        covered_pages: qStats?.covered_pages || 0,
        educational_pages: eduPages,
        coverage_percent: eduPages ? Math.round(((qStats?.covered_pages || 0) / eduPages) * 100) : 0,
      };
    });
  });

  r.get('/api/qb/books/:id', allRoles, (ctx) => {
    const book = get('SELECT * FROM textbooks WHERE id=?', ctx.params.id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی به این کتاب مجاز نیست');
    const editions = all('SELECT * FROM textbook_editions WHERE book_id=? ORDER BY is_default DESC, id DESC', book.id);
    const edId = Number(ctx.query.edition_id) || editions[0]?.id;
    const edition = editions.find((e) => e.id === edId) || editions[0];
    const chapters = edition ? all('SELECT * FROM textbook_chapters WHERE edition_id=? ORDER BY number', edition.id) : [];
    const lessons = edition ? all(
      `SELECT l.* FROM textbook_lessons l JOIN textbook_chapters c ON c.id=l.chapter_id WHERE c.edition_id=? ORDER BY c.number, l.number`,
      edition.id
    ) : [];
    const pages = edition ? all('SELECT * FROM textbook_pages WHERE edition_id=? ORDER BY printed_page', edition.id) : [];

    // آمار سؤالات به تفکیک صفحه
    const pageStats = new Map();
    if (edition) {
      const rows = all(
        `SELECT primary_page, type, difficulty, status, content_flags_json FROM questions
         WHERE book_id=? AND edition_id=? AND (center_id IS NULL OR center_id=?)`,
        book.id, edition.id, ctx.user.center_id || 0
      );
      for (const q of rows) {
        if (ctx.user.role === 'student' && q.status !== 'published') continue;
        let st = pageStats.get(q.primary_page);
        if (!st) {
          st = { total: 0, test: 0, descriptive: 0, visual: 0, published: 0, by_difficulty: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
          pageStats.set(q.primary_page, st);
        }
        st.total++;
        if (q.type === 'descriptive') st.descriptive++;
        else st.test++;
        const flags = JSON.parse(q.content_flags_json || '{}');
        if (flags.has_image || flags.is_geometric || flags.is_chart) st.visual++;
        if (q.status === 'published' || q.status === 'approved') st.published++;
        st.by_difficulty[q.difficulty] = (st.by_difficulty[q.difficulty] || 0) + 1;
      }
    }

    const enrichedPages = pages.map((p) => ({
      ...p,
      stats: pageStats.get(p.printed_page) || { total: 0, test: 0, descriptive: 0, visual: 0, published: 0, by_difficulty: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
    }));

    return { book, editions, edition, chapters, lessons, pages: enrichedPages };
  });

  r.post('/api/qb/books', mgr, (ctx) => {
    const b = ctx.body || {};
    const title = String(b.title || '').trim();
    const subjectKey = String(b.subject_key || '').trim();
    const grade = Number(b.grade);
    const printedPages = Math.max(1, Math.min(800, Number(b.printed_pages || 100)));
    const pdfOffset = Number(b.pdf_offset || 0);
    const editionLabel = String(b.edition_label || '1405').trim();
    const bookCode = String(b.book_code || '').trim() || `BK-${grade}-${Date.now().toString(36).toUpperCase()}`;
    const id = String(b.id || '').trim() || `${bookCode.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${Date.now().toString(36)}`;
    if (!title || !subjectKey || !(grade >= 4 && grade <= 9)) fail(400, 'عنوان، درس و پایه (۴ تا ۹) الزامی است');

    return tx(() => {
      run('INSERT INTO textbooks (id, center_id, book_code, title, subject_key, grade, published, created_by) VALUES (?,?,?,?,?,?,1,?)',
        id, ctx.user.role === 'admin' ? null : ctx.user.center_id, bookCode, title, subjectKey, grade, ctx.user.id);
      const edId = Number(run(
        'INSERT INTO textbook_editions (book_id, edition_label, pub_year, printed_pages, pdf_offset, is_default, published) VALUES (?,?,?,?,?,1,1)',
        id, editionLabel, Number(b.pub_year || 1405), printedPages, pdfOffset
      ).lastInsertRowid);
      const insPg = 'INSERT INTO textbook_pages (edition_id, printed_page, pdf_page) VALUES (?,?,?)';
      for (let p = 1; p <= printedPages; p++) run(insPg, edId, p, Math.max(1, p + pdfOffset));
      return { id, edition_id: edId };
    });
  });

  r.post('/api/qb/books/:id/chapters', staff, (ctx) => {
    const book = get('SELECT * FROM textbooks WHERE id=?', ctx.params.id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی مجاز نیست');
    const ed = Number(ctx.body.edition_id) ? get('SELECT * FROM textbook_editions WHERE id=? AND book_id=?', Number(ctx.body.edition_id), book.id) : defaultEdition(book.id);
    if (!ed) fail(404, 'نسخه کتاب یافت نشد');
    const number = Number(ctx.body.number);
    const title = String(ctx.body.title || '').trim();
    const ps = Number(ctx.body.printed_start), pe = Number(ctx.body.printed_end);
    if (!number || !title || !ps || !pe || ps > pe) fail(400, 'شماره فصل، عنوان و بازه صفحات معتبر وارد کنید');

    return tx(() => {
      run(
        `INSERT INTO textbook_chapters (edition_id, number, title, printed_start, printed_end, pdf_start) VALUES (?,?,?,?,?,?)
         ON CONFLICT(edition_id, number) DO UPDATE SET title=excluded.title, printed_start=excluded.printed_start, printed_end=excluded.printed_end, pdf_start=excluded.pdf_start`,
        ed.id, number, title, ps, pe, ctx.body.pdf_start ? Number(ctx.body.pdf_start) : null
      );
      const ch = get('SELECT * FROM textbook_chapters WHERE edition_id=? AND number=?', ed.id, number);
      run('UPDATE textbook_pages SET chapter_id=? WHERE edition_id=? AND printed_page BETWEEN ? AND ?', ch.id, ed.id, ps, pe);
      return ch;
    });
  });

  r.post('/api/qb/books/:id/lessons', staff, (ctx) => {
    const book = get('SELECT * FROM textbooks WHERE id=?', ctx.params.id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی مجاز نیست');
    const chapterId = Number(ctx.body.chapter_id);
    const number = Number(ctx.body.number);
    const title = String(ctx.body.title || '').trim();
    const ps = Number(ctx.body.printed_start), pe = Number(ctx.body.printed_end);
    const ch = get('SELECT * FROM textbook_chapters WHERE id=?', chapterId);
    if (!ch || !number || !title || !ps || !pe || ps > pe) fail(400, 'فصل، شماره درس و بازه صفحات معتبر وارد کنید');

    return tx(() => {
      run(
        `INSERT INTO textbook_lessons (chapter_id, number, title, printed_start, printed_end) VALUES (?,?,?,?,?)
         ON CONFLICT(chapter_id, number) DO UPDATE SET title=excluded.title, printed_start=excluded.printed_start, printed_end=excluded.printed_end`,
        chapterId, number, title, ps, pe
      );
      const ls = get('SELECT * FROM textbook_lessons WHERE chapter_id=? AND number=?', chapterId, number);
      run('UPDATE textbook_pages SET lesson_id=?, chapter_id=? WHERE edition_id=? AND printed_page BETWEEN ? AND ?', ls.id, chapterId, ch.edition_id, ps, pe);
      return ls;
    });
  });

  r.put('/api/qb/books/:id/pages', staff, (ctx) => {
    const book = get('SELECT * FROM textbooks WHERE id=?', ctx.params.id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی مجاز نیست');
    const ed = Number(ctx.body.edition_id) ? get('SELECT * FROM textbook_editions WHERE id=? AND book_id=?', Number(ctx.body.edition_id), book.id) : defaultEdition(book.id);
    if (!ed) fail(404, 'نسخه کتاب یافت نشد');

    if (ctx.body.pdf_offset != null) {
      const off = Number(ctx.body.pdf_offset);
      run('UPDATE textbook_editions SET pdf_offset=? WHERE id=?', off, ed.id);
      run('UPDATE textbook_pages SET pdf_page = MAX(1, printed_page + ?) WHERE edition_id=?', off, ed.id);
    }
    if (Array.isArray(ctx.body.pages)) {
      tx(() => {
        for (const p of ctx.body.pages) {
          run(
            `UPDATE textbook_pages SET pdf_page=COALESCE(?, pdf_page), excluded=COALESCE(?, excluded), exclude_reason=COALESCE(?, exclude_reason),
             chapter_id=COALESCE(?, chapter_id), lesson_id=COALESCE(?, lesson_id)
             WHERE edition_id=? AND printed_page=?`,
            p.pdf_page != null ? Number(p.pdf_page) : null,
            p.excluded != null ? (p.excluded ? 1 : 0) : null,
            p.exclude_reason !== undefined ? p.exclude_reason : null,
            p.chapter_id != null ? Number(p.chapter_id) : null,
            p.lesson_id != null ? Number(p.lesson_id) : null,
            ed.id, Number(p.printed_page)
          );
        }
      });
    }
    return { ok: true };
  });

  r.get('/api/qb/books/:id/coverage', staff, (ctx) => {
    const book = get('SELECT * FROM textbooks WHERE id=?', ctx.params.id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی مجاز نیست');
    const ed = Number(ctx.query.edition_id) ? get('SELECT * FROM textbook_editions WHERE id=? AND book_id=?', Number(ctx.query.edition_id), book.id) : defaultEdition(book.id);
    if (!ed) fail(404, 'نسخه کتاب یافت نشد');
    const pages = all('SELECT * FROM textbook_pages WHERE edition_id=? ORDER BY printed_page', ed.id);
    const qs = all('SELECT primary_page, type, difficulty, status, content_flags_json FROM questions WHERE book_id=? AND edition_id=? AND (center_id IS NULL OR center_id=?)',
      book.id, ed.id, ctx.user.center_id || 0);
    const byPage = new Map();
    for (const q of qs) {
      let st = byPage.get(q.primary_page);
      if (!st) { st = { total: 0, published: 0, test: 0, descriptive: 0, visual: 0 }; byPage.set(q.primary_page, st); }
      st.total++;
      if (q.status === 'published') st.published++;
      if (q.type === 'descriptive') st.descriptive++; else st.test++;
      const f = JSON.parse(q.content_flags_json || '{}');
      if (f.has_image || f.is_geometric || f.is_chart) st.visual++;
    }
    const items = pages.map((p) => ({ ...p, ...(byPage.get(p.printed_page) || { total: 0, published: 0, test: 0, descriptive: 0, visual: 0 }) }));
    const educational = items.filter((p) => !p.excluded);
    const covered = educational.filter((p) => p.total > 0).length;
    return {
      book, edition: ed,
      summary: {
        total_pages: pages.length,
        educational_pages: educational.length,
        excluded_pages: pages.length - educational.length,
        covered_pages: covered,
        uncovered_pages: educational.length - covered,
        coverage_percent: educational.length ? Math.round((covered / educational.length) * 100) : 0,
      },
      pages: items,
    };
  });

  // ---------- داشبورد بانک سؤالات ----------
  r.get('/api/qb/dashboard', staff, (ctx) => {
    const cid = ctx.user.center_id || 0;
    const accessibleBooks = all('SELECT * FROM textbooks WHERE (center_id IS NULL OR center_id=?)', cid).filter((b) => canAccessBook(ctx.user, b));
    const bookIds = accessibleBooks.map((b) => b.id);
    if (!bookIds.length) {
      return { kpis: { total: 0, published: 0, pending_review: 0, books_with_questions: 0, covered_pages: 0, uncovered_pages: 0, visual_questions: 0, exams_held: 0 }, charts: {} };
    }
    const ph = bookIds.map(() => '?').join(',');
    const rows = all(`SELECT q.*, t.grade, t.title book_title FROM questions q JOIN textbooks t ON t.id=q.book_id WHERE q.book_id IN (${ph}) AND (q.center_id IS NULL OR q.center_id=?)`, ...bookIds, cid);

    const byGrade = new Map(), byBook = new Map(), byType = new Map(), byDiff = new Map();
    let published = 0, pending = 0, visual = 0;
    const coveredSet = new Set();
    const booksWithQ = new Set();

    for (const q of rows) {
      if (q.status === 'published') published++;
      if (q.status === 'pending_review' || q.status === 'draft') pending++;
      const f = JSON.parse(q.content_flags_json || '{}');
      if (f.has_image || f.is_geometric || f.is_chart) visual++;
      coveredSet.add(`${q.edition_id}:${q.primary_page}`);
      booksWithQ.add(q.book_id);
      byGrade.set(q.grade, (byGrade.get(q.grade) || 0) + 1);
      byBook.set(q.book_title, (byBook.get(q.book_title) || 0) + 1);
      byType.set(q.type, (byType.get(q.type) || 0) + 1);
      byDiff.set(q.difficulty, (byDiff.get(q.difficulty) || 0) + 1);
    }

    const totalEduPages = get(`SELECT COUNT(*) c FROM textbook_pages tp JOIN textbook_editions te ON te.id=tp.edition_id WHERE te.book_id IN (${ph}) AND te.is_default=1 AND tp.excluded=0`, ...bookIds)?.c || 0;
    const examsHeld = get('SELECT COUNT(*) c FROM qb_exam_attempts WHERE status IN (\'submitted\',\'graded\')')?.c || 0;

    const bookCoverage = accessibleBooks.map((b) => {
      const ed = defaultEdition(b.id);
      const edu = ed ? (get('SELECT COUNT(*) c FROM textbook_pages WHERE edition_id=? AND excluded=0', ed.id)?.c || 0) : 0;
      const cov = ed ? (get('SELECT COUNT(DISTINCT primary_page) c FROM questions WHERE edition_id=? AND (center_id IS NULL OR center_id=?)', ed.id, cid)?.c || 0) : 0;
      return { book_id: b.id, title: b.title, percent: edu ? Math.round((cov / edu) * 100) : 0, covered: cov, total: edu };
    });

    const usageTop = all(
      `SELECT q.id, q.topic, q.type, t.title book_title, COUNT(quh.id) uses
       FROM question_usage_history quh JOIN questions q ON q.id=quh.question_id JOIN textbooks t ON t.id=q.book_id
       WHERE q.book_id IN (${ph}) GROUP BY q.id ORDER BY uses DESC LIMIT 8`, ...bookIds
    );

    return {
      kpis: {
        total: rows.length,
        published,
        pending_review: pending,
        books_with_questions: booksWithQ.size,
        covered_pages: coveredSet.size,
        uncovered_pages: Math.max(0, totalEduPages - coveredSet.size),
        visual_questions: visual,
        exams_held: examsHeld,
      },
      charts: {
        by_grade: [...byGrade.entries()].map(([grade, count]) => ({ grade, count })),
        by_book: [...byBook.entries()].map(([title, count]) => ({ title, count })),
        by_type: [...byType.entries()].map(([type, count]) => ({ type, count })),
        by_difficulty: [1, 2, 3, 4, 5].map((d) => ({ difficulty: d, count: byDiff.get(d) || 0 })),
        book_coverage: bookCoverage,
        usage_top: usageTop,
      },
    };
  });

  // ---------- فهرست، فیلتر و CRUD سؤالات ----------
  r.get('/api/qb/questions', staff, (ctx) => {
    const cid = ctx.user.center_id || 0;
    const where = ['(q.center_id IS NULL OR q.center_id=?)'];
    const params = [cid];
    if (ctx.query.book_id) { where.push('q.book_id=?'); params.push(ctx.query.book_id); }
    if (ctx.query.edition_id) { where.push('q.edition_id=?'); params.push(Number(ctx.query.edition_id)); }
    if (ctx.query.grade) { where.push('t.grade=?'); params.push(Number(ctx.query.grade)); }
    if (ctx.query.chapter_id) { where.push('q.chapter_id=?'); params.push(Number(ctx.query.chapter_id)); }
    if (ctx.query.lesson_id) { where.push('q.lesson_id=?'); params.push(Number(ctx.query.lesson_id)); }
    if (ctx.query.page) { where.push('q.primary_page=?'); params.push(Number(ctx.query.page)); }
    if (ctx.query.type) { where.push('q.type=?'); params.push(ctx.query.type); }
    if (ctx.query.difficulty) { where.push('q.difficulty=?'); params.push(Number(ctx.query.difficulty)); }
    if (ctx.query.status) { where.push('q.status=?'); params.push(ctx.query.status); }
    if (ctx.query.has_image === '1') { where.push("(json_extract(q.content_flags_json, '$.has_image') = 1 OR json_array_length(q.assets_json) > 0)"); }
    if (ctx.query.q) {
      where.push('(q.stem LIKE ? OR q.topic LIKE ? OR q.external_id LIKE ?)');
      const pat = `%${ctx.query.q.trim()}%`;
      params.push(pat, pat, pat);
    }

    const rows = all(
      `SELECT q.*, t.title book_title, t.grade, t.subject_key, tc.title chapter_title, tl.title lesson_title
       FROM questions q
       JOIN textbooks t ON t.id=q.book_id
       LEFT JOIN textbook_chapters tc ON tc.id=q.chapter_id
       LEFT JOIN textbook_lessons tl ON tl.id=q.lesson_id
       WHERE ${where.join(' AND ')}
       ORDER BY q.id DESC LIMIT 200`,
      ...params
    ).filter((row) => canAccessBook(ctx.user, { id: row.book_id, grade: row.grade, subject_key: row.subject_key, center_id: row.center_id }));

    return { rows };
  });

  r.post('/api/qb/questions', staff, (ctx) => {
    const b = ctx.body || {};
    const book = get('SELECT * FROM textbooks WHERE id=?', b.book_id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی به این کتاب مجاز نیست');
    const ed = b.edition_id ? get('SELECT * FROM textbook_editions WHERE id=? AND book_id=?', Number(b.edition_id), book.id) : defaultEdition(book.id);
    if (!ed) fail(404, 'نسخه کتاب یافت نشد');

    const v = validateQuestion(b, { printedPages: ed.printed_pages });
    if (!v.valid) fail(400, v.errors.map((e) => e.message).join(' | '));

    const status = QUESTION_STATUSES.includes(b.status) ? b.status : 'draft';
    const id = tx(() => saveQuestionRecord(v.normalized, {
      centerId: ctx.user.center_id, ownerId: ctx.user.id, bookId: book.id, editionId: ed.id, status,
    }));
    return { id, status };
  });

  r.put('/api/qb/questions/:id', staff, (ctx) => {
    const existing = get('SELECT q.*, t.grade, t.subject_key FROM questions q JOIN textbooks t ON t.id=q.book_id WHERE q.id=?', Number(ctx.params.id));
    if (!existing) fail(404, 'سؤال یافت نشد');
    if (!canAccessBook(ctx.user, { id: existing.book_id, grade: existing.grade, subject_key: existing.subject_key, center_id: existing.center_id })) fail(403, 'دسترسی مجاز نیست');
    const ed = get('SELECT * FROM textbook_editions WHERE id=?', existing.edition_id);
    const v = validateQuestion(ctx.body || {}, { printedPages: ed?.printed_pages || 999 });
    if (!v.valid) fail(400, v.errors.map((e) => e.message).join(' | '));
    const q = v.normalized;
    const nextVer = (existing.version || 1) + 1;
    const primaryPage = Number(q.source?.primary_page ?? q.primary_page);
    const status = QUESTION_STATUSES.includes(ctx.body.status) ? ctx.body.status : existing.status;

    tx(() => {
      run(
        `UPDATE questions SET chapter_id=?, lesson_id=?, primary_page=?, topic=?, type=?, difficulty=?, stem=?, table_json=?,
         content_flags_json=?, options_json=?, answer_json=?, explanation=?, score=?, estimated_time_seconds=?, tags_json=?,
         assets_json=?, status=?, content_hash=?, version=?, updated_at=datetime('now') WHERE id=?`,
        ctx.body.chapter_id || existing.chapter_id, ctx.body.lesson_id || existing.lesson_id, primaryPage, q.topic || '',
        q.type, q.difficulty, q.stem, q.table ? JSON.stringify(q.table) : null, JSON.stringify(q.content_flags || {}),
        JSON.stringify(q.options || []), JSON.stringify(q.answer || {}), sanitizeHtmlText(q.explanation || ''),
        q.score, Number(q.estimated_time_seconds || 60), JSON.stringify(q.tags || []),
        JSON.stringify(q.assets || []), status, v.hash, nextVer, existing.id
      );
      run('INSERT INTO question_versions (question_id, version, snapshot_json, changed_by, change_note) VALUES (?,?,?,?,?)',
        existing.id, nextVer, JSON.stringify(q), ctx.user.id, ctx.body.change_note || 'ویرایش سؤال');
    });
    return { id: existing.id, version: nextVer, status };
  });

  r.post('/api/qb/questions/:id/clone', staff, (ctx) => {
    const existing = get('SELECT q.*, t.grade, t.subject_key FROM questions q JOIN textbooks t ON t.id=q.book_id WHERE q.id=?', Number(ctx.params.id));
    if (!existing) fail(404, 'سؤال یافت نشد');
    if (!canAccessBook(ctx.user, { id: existing.book_id, grade: existing.grade, subject_key: existing.subject_key, center_id: existing.center_id })) fail(403, 'دسترسی مجاز نیست');
    const q = {
      type: existing.type,
      chapter_id: existing.chapter_id,
      lesson_id: existing.lesson_id,
      source: { primary_page: existing.primary_page, pages: [existing.primary_page] },
      topic: existing.topic,
      difficulty: existing.difficulty,
      stem: `${existing.stem} (نسخه کپی)`,
      options: JSON.parse(existing.options_json || '[]'),
      answer: JSON.parse(existing.answer_json || '{}'),
      explanation: existing.explanation,
      score: existing.score,
      estimated_time_seconds: existing.estimated_time_seconds,
      tags: JSON.parse(existing.tags_json || '[]'),
      assets: JSON.parse(existing.assets_json || '[]'),
    };
    const id = tx(() => saveQuestionRecord(q, {
      centerId: ctx.user.center_id, ownerId: ctx.user.id, bookId: existing.book_id, editionId: existing.edition_id, status: 'draft',
    }));
    return { id };
  });

  r.post('/api/qb/questions/:id/status', staff, (ctx) => {
    const st = String(ctx.body.status || '');
    if (!QUESTION_STATUSES.includes(st)) fail(400, 'وضعیت نامعتبر است');
    const existing = get('SELECT q.*, t.grade, t.subject_key FROM questions q JOIN textbooks t ON t.id=q.book_id WHERE q.id=?', Number(ctx.params.id));
    if (!existing) fail(404, 'سؤال یافت نشد');
    if (!canAccessBook(ctx.user, { id: existing.book_id, grade: existing.grade, subject_key: existing.subject_key, center_id: existing.center_id })) fail(403, 'دسترسی مجاز نیست');
    run("UPDATE questions SET status=?, reviewed_by=?, reviewed_at=datetime('now'), review_note=?, updated_at=datetime('now') WHERE id=?",
      st, ctx.user.id, ctx.body.note || null, existing.id);
    run('INSERT INTO question_review_logs (question_id, from_status, to_status, actor_id, note) VALUES (?,?,?,?,?)',
      existing.id, existing.status, st, ctx.user.id, ctx.body.note || null);
    return { id: existing.id, status: st };
  });

  r.post('/api/qb/questions/bulk', staff, (ctx) => {
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(Number).filter(Boolean) : [];
    const action = String(ctx.body.action || '');
    if (!ids.length) fail(400, 'هیچ سؤالی انتخاب نشده است');
    const statusMap = { publish: 'published', archive: 'archived', approve: 'approved', draft: 'draft' };
    if (statusMap[action]) {
      const toStatus = statusMap[action];
      tx(() => {
        for (const id of ids) {
          const q = get('SELECT id, status FROM questions WHERE id=?', id);
          if (!q) continue;
          run("UPDATE questions SET status=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=?", toStatus, ctx.user.id, id);
          run('INSERT INTO question_review_logs (question_id, from_status, to_status, actor_id, note) VALUES (?,?,?,?,?)', id, q.status, toStatus, ctx.user.id, 'تغییر گروهی');
        }
      });
      return { updated: ids.length, status: toStatus };
    }
    if (action === 'edit') {
      tx(() => {
        for (const id of ids) {
          if (ctx.body.difficulty) run('UPDATE questions SET difficulty=? WHERE id=?', Number(ctx.body.difficulty), id);
          if (ctx.body.chapter_id) run('UPDATE questions SET chapter_id=? WHERE id=?', Number(ctx.body.chapter_id), id);
        }
      });
      return { updated: ids.length };
    }
    fail(400, 'عملیات گروهی نامعتبر است');
  });

  r.get('/api/qb/export', staff, (ctx) => {
    const cid = ctx.user.center_id || 0;
    const where = ['(q.center_id IS NULL OR q.center_id=?)'];
    const params = [cid];
    if (ctx.query.book_id) { where.push('q.book_id=?'); params.push(ctx.query.book_id); }
    if (ctx.query.status) { where.push('q.status=?'); params.push(ctx.query.status); }
    const rows = all(`SELECT q.* FROM questions q WHERE ${where.join(' AND ')} ORDER BY q.id`, ...params);
    return {
      manifest: { schema_version: '1.0', exported_at: new Date().toISOString(), question_count: rows.length },
      questions: rows.map((q) => ({
        external_id: q.external_id,
        type: q.type,
        source: { primary_page: q.primary_page, pages: [q.primary_page] },
        topic: q.topic,
        difficulty: q.difficulty,
        stem: q.stem,
        options: JSON.parse(q.options_json || '[]'),
        answer: JSON.parse(q.answer_json || '{}'),
        explanation: q.explanation,
        score: q.score,
        estimated_time_seconds: q.estimated_time_seconds,
        tags: JSON.parse(q.tags_json || '[]'),
        status: q.status,
      })),
    };
  });

  // ---------- بارگذاری گروهی (Wizard 9-مرحله‌ای) ----------
  r.post('/api/qb/import/validate', staff, (ctx) => {
    const b = ctx.body || {};
    const book = get('SELECT * FROM textbooks WHERE id=?', b.book_id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی به این کتاب مجاز نیست');
    const ed = b.edition_id ? get('SELECT * FROM textbook_editions WHERE id=? AND book_id=?', Number(b.edition_id), book.id) : defaultEdition(book.id);
    if (!ed) fail(404, 'نسخه کتاب یافت نشد');

    const format = String(b.format || '').toLowerCase();
    if (!['zip', 'json', 'xlsx'].includes(format)) fail(400, 'فرمت فایل باید zip، json یا xlsx باشد');
    const buf = Buffer.from(String(b.content_base64 || ''), 'base64');
    if (!buf.length) fail(400, 'محتوای فایل خالی است');

    let rawQuestions = [];
    let manifest = null;
    const availableAssets = new Set();
    const assetBuffers = new Map();

    if (format === 'zip') {
      const files = readZip(buf);
      const manifestEntry = files.get('manifest.json');
      if (!manifestEntry) fail(400, 'فایل manifest.json در بسته ZIP یافت نشد');
      try { manifest = JSON.parse(manifestEntry.toString('utf8').replace(/^\uFEFF/, '')); } catch { fail(400, 'ساختار manifest.json معتبر نیست'); }
      const qFile = sanitizeZipPath(manifest.questions_file || 'questions.json');
      const qEntry = files.get(qFile);
      if (!qEntry) fail(400, `فایل سؤالات (${qFile}) در بسته ZIP یافت نشد`);
      try { rawQuestions = JSON.parse(qEntry.toString('utf8').replace(/^\uFEFF/, '')); } catch { fail(400, 'ساختار questions.json معتبر نیست'); }
      for (const [k, v] of files.entries()) {
        if (k.startsWith('assets/') && isAllowedAsset(k)) {
          availableAssets.add(k);
          const ext = path.extname(k).toLowerCase();
          assetBuffers.set(k, ext === '.svg' ? Buffer.from(sanitizeSvg(v.toString('utf8')), 'utf8') : v);
        }
      }
    } else if (format === 'json') {
      let parsed;
      try { parsed = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')); } catch { fail(400, 'ساختار فایل JSON معتبر نیست'); }
      if (Array.isArray(parsed)) rawQuestions = parsed;
      else { manifest = parsed.manifest || null; rawQuestions = parsed.questions || []; }
    } else if (format === 'xlsx') {
      const rows = parseXlsx(buf);
      rawQuestions = mapXlsxRowsToQuestions(rows);
    }

    if (!Array.isArray(rawQuestions)) fail(400, 'آرایه سؤالات در فایل یافت نشد');

    const existingQs = all('SELECT id, external_id, content_hash, stem FROM questions WHERE book_id=? AND edition_id=? AND (center_id IS NULL OR center_id=?)',
      book.id, ed.id, ctx.user.center_id || 0);
    const existingExt = new Set(existingQs.map((x) => x.external_id).filter(Boolean));
    const existingHash = new Set(existingQs.map((x) => x.content_hash));

    const results = [];
    const errorRows = [];
    let validCount = 0, invalidCount = 0, dupCount = 0, missingAssets = 0, invalidPages = 0, invalidAnswers = 0;

    rawQuestions.forEach((rq, idx) => {
      const v = validateQuestion(rq, { printedPages: ed.printed_pages, availableAssets: format === 'zip' ? availableAssets : null });
      const isDupExt = rq.external_id && existingExt.has(String(rq.external_id));
      const isDupHash = existingHash.has(v.hash);
      let similarTo = null;
      if (!isDupExt && !isDupHash && v.normalized.stem) {
        for (const eq of existingQs) {
          if (textSimilarity(v.normalized.stem, eq.stem) >= 0.82) { similarTo = { id: eq.id, stem: eq.stem.slice(0, 80) }; break; }
        }
      }
      const isDuplicate = Boolean(isDupExt || isDupHash);
      if (isDuplicate) dupCount++;
      if (v.valid) validCount++;
      else {
        invalidCount++;
        for (const e of v.errors) {
          if (e.field === 'assets') missingAssets++;
          if (e.field === 'primary_page' || e.field === 'pages') invalidPages++;
          if (e.field === 'answer' || e.field === 'options') invalidAnswers++;
          errorRows.push({ row_index: rq.row_index || idx + 1, external_id: rq.external_id || '', field: e.field, message: e.message });
        }
      }
      results.push({ index: idx, row_index: rq.row_index || idx + 1, valid: v.valid, duplicate: isDuplicate, similar: similarTo, errors: v.errors, question: v.normalized });
    });

    const batchId = Number(run(
      `INSERT INTO question_import_batches (center_id, owner_id, book_id, edition_id, format, filename, total_count, valid_count, invalid_count, duplicate_count, missing_assets_count, invalid_pages_count, invalid_answers_count, status, report_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'validated',?)`,
      ctx.user.center_id || null, ctx.user.id, book.id, ed.id, format, String(b.filename || `import.${format}`),
      rawQuestions.length, validCount, invalidCount, dupCount, missingAssets, invalidPages, invalidAnswers,
      JSON.stringify({ manifest })
    ).lastInsertRowid);

    for (const er of errorRows) {
      run('INSERT INTO question_import_errors (batch_id, row_index, external_id, field, message) VALUES (?,?,?,?,?)',
        batchId, er.row_index, er.external_id, er.field, er.message);
    }

    // ذخیره موقت فایل‌های استخراج‌شده و سؤالات در فضای staging
    const batchKey = `batch-${batchId}`;
    fs.mkdirSync(path.join(STAGING_ROOT()), { recursive: true });
    fs.writeFileSync(path.join(STAGING_ROOT(), `${batchKey}.json`), JSON.stringify(results));
    if (assetBuffers.size) {
      const aDir = path.join(ASSETS_ROOT(), batchKey);
      fs.mkdirSync(aDir, { recursive: true });
      for (const [k, data] of assetBuffers.entries()) fs.writeFileSync(path.join(aDir, path.basename(k)), data);
    }

    return {
      batch_id: batchId,
      book, edition: ed, manifest,
      summary: {
        total_count: rawQuestions.length, valid_count: validCount, invalid_count: invalidCount,
        duplicate_count: dupCount, missing_assets_count: missingAssets, invalid_pages_count: invalidPages, invalid_answers_count: invalidAnswers,
      },
      items: results,
      errors: errorRows,
    };
  });

  r.post('/api/qb/import/:batchId/commit', staff, (ctx) => {
    const batch = get('SELECT * FROM question_import_batches WHERE id=?', Number(ctx.params.batchId));
    if (!batch) fail(404, 'بسته بارگذاری یافت نشد');
    const ed = get('SELECT * FROM textbook_editions WHERE id=?', batch.edition_id);
    const batchKey = `batch-${batch.id}`;
    const stageFile = path.join(STAGING_ROOT(), `${batchKey}.json`);
    const staged = Array.isArray(ctx.body.questions)
      ? ctx.body.questions.map((q, i) => ({ index: i, valid: true, duplicate: false, question: q }))
      : (fs.existsSync(stageFile) ? JSON.parse(fs.readFileSync(stageFile, 'utf8')) : []);

    const skipDups = ctx.body.skip_duplicates !== false;
    const targetStatus = ctx.body.auto_publish ? 'published' : 'draft';
    const existingHash = new Set(all('SELECT content_hash FROM questions WHERE book_id=? AND edition_id=?', batch.book_id, batch.edition_id).map((x) => x.content_hash));
    const existingExt = new Set(all('SELECT external_id FROM questions WHERE book_id=? AND edition_id=? AND external_id IS NOT NULL', batch.book_id, batch.edition_id).map((x) => x.external_id));

    let imported = 0;
    const createdIds = [];
    tx(() => {
      for (const item of staged) {
        const q = item.question || item;
        const v = validateQuestion(q, { printedPages: ed?.printed_pages || 999 });
        if (!v.valid) continue;
        if (skipDups && (existingHash.has(v.hash) || (q.external_id && existingExt.has(String(q.external_id))))) continue;
        const qid = saveQuestionRecord(v.normalized, {
          centerId: ctx.user.center_id, ownerId: ctx.user.id, bookId: batch.book_id, editionId: batch.edition_id,
          status: targetStatus, batchId: batch.id, assetsPrefix: `/api/qb/assets/${batchKey}`,
        });
        existingHash.add(v.hash);
        if (q.external_id) existingExt.add(String(q.external_id));
        createdIds.push(qid);
        imported++;
      }
      run('UPDATE question_import_batches SET imported_count=?, status=? WHERE id=?', imported, targetStatus === 'published' ? 'published' : 'imported', batch.id);
    });

    return { batch_id: batch.id, imported_count: imported, status: targetStatus, question_ids: createdIds };
  });

  r.get('/api/qb/import/batches', staff, (ctx) => {
    return all(
      `SELECT b.*, t.title book_title, u.full_name owner_name
       FROM question_import_batches b
       JOIN textbooks t ON t.id=b.book_id
       LEFT JOIN users u ON u.id=b.owner_id
       WHERE (b.center_id IS NULL OR b.center_id=?)
       ORDER BY b.id DESC LIMIT 50`,
      ctx.user.center_id || 0
    );
  });

  r.get('/api/qb/import/:batchId/errors.csv', staff, (ctx) => {
    const rows = all('SELECT row_index, external_id, field, message FROM question_import_errors WHERE batch_id=? ORDER BY id', Number(ctx.params.batchId));
    const csv = '\uFEFF' + [['ردیف', 'شناسه', 'فیلد', 'خطا'], ...rows.map((e) => [e.row_index, e.external_id, e.field, e.message])]
      .map((line) => line.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    ctx.handled = true;
    ctx.res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import-errors-${ctx.params.batchId}.csv"`,
    });
    ctx.res.end(csv);
  });

  // ---------- ساخت آزمون و موتور انتخاب بدون AI ----------
  r.post('/api/qb/exams/build', allRoles, (ctx) => {
    const b = ctx.body || {};
    const book = get('SELECT * FROM textbooks WHERE id=?', b.book_id);
    if (!canAccessBook(ctx.user, book)) fail(403, 'دسترسی به این کتاب مجاز نیست');
    const ed = b.edition_id ? get('SELECT * FROM textbook_editions WHERE id=? AND book_id=?', Number(b.edition_id), book.id) : defaultEdition(book.id);
    if (!ed) fail(404, 'نسخه کتاب یافت نشد');

    const isStaff = ['teacher', 'manager', 'admin'].includes(ctx.user.role);
    const mode = isStaff && b.mode === 'official' ? 'official' : 'practice';
    const center = get('SELECT qb_mix_easy, qb_mix_medium, qb_mix_hard FROM centers WHERE id=?', ctx.user.center_id || 1);
    const mixRatio = { easy: center?.qb_mix_easy ?? 30, medium: center?.qb_mix_medium ?? 50, hard: center?.qb_mix_hard ?? 20 };

    let picked = [];
    let shortage = 0;

    if (isStaff && Array.isArray(b.question_ids) && b.question_ids.length) {
      const qs = all(`SELECT * FROM questions WHERE id IN (${b.question_ids.map(() => '?').join(',')}) AND status='published'`, ...b.question_ids.map(Number));
      picked = qs.map((q, idx) => ({ question: q, orderIndex: idx, optionOrder: JSON.parse(q.options_json || '[]').map((o) => o.id) }));
    } else if (b.special_mode === 'mistakes' && b.source_attempt_id) {
      const att = get('SELECT * FROM qb_exam_attempts WHERE id=? AND student_id=?', Number(b.source_attempt_id), ctx.user.id);
      if (!att) fail(404, 'آزمون مرجع یافت نشد');
      const g = JSON.parse(att.grading_json || '{}');
      const wrongIds = Object.entries(g).filter(([, v]) => v.status === 'wrong').map(([k]) => Number(k));
      if (!wrongIds.length) fail(400, 'سؤال غلطی برای تمرین مجدد وجود ندارد');
      const qs = all(`SELECT * FROM questions WHERE id IN (${wrongIds.map(() => '?').join(',')}) AND status='published'`, ...wrongIds);
      picked = qs.map((q, idx) => ({ question: q, orderIndex: idx, optionOrder: JSON.parse(q.options_json || '[]').map((o) => o.id) }));
    } else {
      const sel = selectQuestionsForExam({
        centerId: ctx.user.center_id || 0,
        bookId: book.id,
        editionId: ed.id,
        studentId: ctx.user.role === 'student' ? ctx.user.id : null,
        scopeType: b.scope_type || 'book',
        chapterIds: Array.isArray(b.chapter_ids) ? b.chapter_ids.map(Number) : (b.chapter_id ? [Number(b.chapter_id)] : []),
        lessonIds: Array.isArray(b.lesson_ids) ? b.lesson_ids.map(Number) : (b.lesson_id ? [Number(b.lesson_id)] : []),
        fromPage: b.from_page ? Number(b.from_page) : null,
        toPage: b.to_page ? Number(b.to_page) : null,
        types: Array.isArray(b.types) ? b.types : [],
        difficultyMode: b.difficulty_mode || 'mixed',
        count: Number(b.question_count || 15),
        includeDescriptive: Boolean(b.include_descriptive),
        mixRatio,
        shuffleQuestions: b.shuffle_questions !== false,
        shuffleOptions: b.shuffle_options !== false,
      });
      picked = sel.selected;
      shortage = sel.shortage;
    }

    if (!picked.length) fail(400, 'هیچ سؤال منتشرشده‌ای در این محدوده یافت نشد');

    const title = String(b.title || '').trim() || (mode === 'official' ? `آزمون رسمی ${book.title}` : `آزمون ${book.title}`);
    return tx(() => {
      const examId = Number(run(
        `INSERT INTO qb_exams (center_id, creator_id, mode, title, book_id, edition_id, class_id, scope_type, scope_json, difficulty_mode, question_count, duration_minutes, shuffle_questions, shuffle_options, include_descriptive, starts_at, ends_at, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published')`,
        ctx.user.center_id || 1, ctx.user.id, mode, title, book.id, ed.id, b.class_id ? Number(b.class_id) : null,
        b.scope_type || 'book', JSON.stringify({ chapter_id: b.chapter_id, lesson_id: b.lesson_id, from_page: b.from_page, to_page: b.to_page }),
        b.difficulty_mode || 'mixed', picked.length, Number(b.duration_minutes || 0),
        b.shuffle_questions === false ? 0 : 1, b.shuffle_options === false ? 0 : 1, b.include_descriptive ? 1 : 0,
        b.starts_at || null, b.ends_at || null
      ).lastInsertRowid);

      let maxScore = 0;
      for (const item of picked) {
        const q = item.question;
        maxScore += Number(q.score || 1);
        run(
          `INSERT INTO qb_exam_questions (exam_id, question_id, question_version, order_index, option_order_json, score, snapshot_json)
           VALUES (?,?,?,?,?,?,?)`,
          examId, q.id, q.version || 1, item.orderIndex, JSON.stringify(item.optionOrder), Number(q.score || 1),
          JSON.stringify({ id: q.id, type: q.type, difficulty: q.difficulty, stem: q.stem, options_json: q.options_json, answer_json: q.answer_json, explanation: q.explanation, assets_json: q.assets_json, table_json: q.table_json, content_flags_json: q.content_flags_json, primary_page: q.primary_page, chapter_id: q.chapter_id, lesson_id: q.lesson_id, topic: q.topic, score: q.score })
        );
      }

      let attemptId = null;
      if (ctx.user.role === 'student') {
        attemptId = Number(run('INSERT INTO qb_exam_attempts (exam_id, student_id, max_score) VALUES (?,?,?)', examId, ctx.user.id, maxScore).lastInsertRowid);
      }

      return {
        exam_id: examId,
        attempt_id: attemptId,
        question_count: picked.length,
        shortage,
        questions: picked.map((p) => toSafeStudentQuestion(p.question, p.optionOrder)),
      };
    });
  });

  r.get('/api/qb/exams', allRoles, (ctx) => {
    if (ctx.user.role === 'student') {
      const st = get('SELECT class_id FROM students WHERE user_id=?', ctx.user.id);
      const rows = all(
        `SELECT e.*, t.title book_title,
                (SELECT id FROM qb_exam_attempts a WHERE a.exam_id=e.id AND a.student_id=? ORDER BY a.id DESC LIMIT 1) attempt_id,
                (SELECT status FROM qb_exam_attempts a WHERE a.exam_id=e.id AND a.student_id=? ORDER BY a.id DESC LIMIT 1) attempt_status,
                (SELECT percent FROM qb_exam_attempts a WHERE a.exam_id=e.id AND a.student_id=? ORDER BY a.id DESC LIMIT 1) percent
         FROM qb_exams e JOIN textbooks t ON t.id=e.book_id
         WHERE e.center_id=? AND ((e.mode='practice' AND e.creator_id=?) OR (e.mode='official' AND (e.class_id IS NULL OR e.class_id=?)))
         ORDER BY e.id DESC LIMIT 100`,
        ctx.user.id, ctx.user.id, ctx.user.id, ctx.user.center_id || 1, ctx.user.id, st?.class_id || -1
      );
      return rows;
    }
    return all(
      `SELECT e.*, t.title book_title, c.name class_name,
              (SELECT COUNT(*) FROM qb_exam_attempts a WHERE a.exam_id=e.id AND a.status IN ('submitted','graded')) submitted_count
       FROM qb_exams e JOIN textbooks t ON t.id=e.book_id LEFT JOIN classes c ON c.id=e.class_id
       WHERE e.center_id=? ${ctx.user.role === 'teacher' ? 'AND e.creator_id=?' : ''}
       ORDER BY e.id DESC LIMIT 100`,
      ...(ctx.user.role === 'teacher' ? [ctx.user.center_id || 1, ctx.user.id] : [ctx.user.center_id || 1])
    );
  });

  r.get('/api/qb/exams/:id', allRoles, (ctx) => {
    const exam = get('SELECT e.*, t.title book_title FROM qb_exams e JOIN textbooks t ON t.id=e.book_id WHERE e.id=?', Number(ctx.params.id));
    if (!exam || exam.center_id !== (ctx.user.center_id || 1)) fail(404, 'آزمون یافت نشد');
    const qRows = all('SELECT * FROM qb_exam_questions WHERE exam_id=? ORDER BY order_index', exam.id);
    let attempt = null;
    if (ctx.user.role === 'student') {
      attempt = get('SELECT * FROM qb_exam_attempts WHERE exam_id=? AND student_id=? ORDER BY id DESC LIMIT 1', exam.id, ctx.user.id);
      if (!attempt) {
        const maxScore = qRows.reduce((s, r) => s + Number(r.score || 1), 0);
        const aid = Number(run('INSERT INTO qb_exam_attempts (exam_id, student_id, max_score) VALUES (?,?,?)', exam.id, ctx.user.id, maxScore).lastInsertRowid);
        attempt = get('SELECT * FROM qb_exam_attempts WHERE id=?', aid);
      }
    }
    // امنیت مطلق: پاسخ صحیح و توضیح در هنگام آزمون هرگز ارسال نمی‌شود!
    const safeQuestions = qRows.map((qr) => {
      const snap = JSON.parse(qr.snapshot_json);
      const optOrder = JSON.parse(qr.option_order_json || '[]');
      return toSafeStudentQuestion(snap, optOrder);
    });
    return { exam, attempt, questions: safeQuestions };
  });

  r.post('/api/qb/attempts/:id/autosave', { roles: ['student'] }, (ctx) => {
    const att = get('SELECT * FROM qb_exam_attempts WHERE id=? AND student_id=?', Number(ctx.params.id), ctx.user.id);
    if (!att) fail(404, 'آزمون یافت نشد');
    if (att.status !== 'started') fail(409, 'این آزمون قبلاً ثبت نهایی شده است');
    run('UPDATE qb_exam_attempts SET answers_json=?, flagged_json=? WHERE id=?',
      JSON.stringify(ctx.body.answers || {}), JSON.stringify(ctx.body.flagged || []), att.id);
    return { ok: true };
  });

  r.post('/api/qb/attempts/:id/submit', { roles: ['student'] }, (ctx) => {
    const att = get('SELECT * FROM qb_exam_attempts WHERE id=? AND student_id=?', Number(ctx.params.id), ctx.user.id);
    if (!att) fail(404, 'آزمون یافت نشد');
    if (att.status !== 'started') fail(409, 'این آزمون قبلاً ثبت نهایی شده است');
    const exam = get('SELECT * FROM qb_exams WHERE id=?', att.exam_id);
    const qRows = all('SELECT * FROM qb_exam_questions WHERE exam_id=? ORDER BY order_index', exam.id);
    const answers = ctx.body.answers || JSON.parse(att.answers_json || '{}');

    let autoScore = 0, maxScore = 0, correct = 0, wrong = 0, blank = 0, pending = 0;
    const grading = {};

    tx(() => {
      for (const qr of qRows) {
        const snap = JSON.parse(qr.snapshot_json);
        const given = answers[String(qr.question_id)] ?? answers[qr.question_id];
        const res = gradeQuestionResponse(snap, given);
        grading[qr.question_id] = res;
        maxScore += res.max_score;
        autoScore += res.score;
        if (res.status === 'correct') correct++;
        else if (res.status === 'wrong') wrong++;
        else if (res.status === 'blank') blank++;
        else if (res.status === 'pending_review') pending++;

        run('INSERT INTO question_usage_history (student_id, question_id, exam_id, is_correct) VALUES (?,?,?,?)',
          ctx.user.id, qr.question_id, exam.id, res.is_correct == null ? null : (res.is_correct ? 1 : 0));
        if (res.is_correct != null) {
          updateStudentPagePerformance(ctx.user.id, exam.book_id, exam.edition_id, snap.primary_page, res.is_correct);
        }
      }
      const autoMax = qRows.filter((qr) => JSON.parse(qr.snapshot_json).type !== 'descriptive').reduce((s, r) => s + Number(r.score || 1), 0);
      const pctVal = autoMax > 0 ? Math.round((autoScore / autoMax) * 1000) / 10 : 0;
      const finalStatus = pending > 0 && exam.mode === 'official' ? 'submitted' : 'graded';
      run(
        `UPDATE qb_exam_attempts SET answers_json=?, grading_json=?, auto_score=?, total_score=?, max_score=?, percent=?,
         correct_count=?, wrong_count=?, blank_count=?, pending_count=?, status=?, submitted_at=datetime('now'),
         graded_at=CASE WHEN ?='graded' THEN datetime('now') ELSE NULL END WHERE id=?`,
        JSON.stringify(answers), JSON.stringify(grading), autoScore, autoScore, maxScore, pctVal,
        correct, wrong, blank, pending, finalStatus, finalStatus, att.id
      );
    });

    return { attempt_id: att.id };
  });

  r.post('/api/qb/attempts/:id/self-eval', { roles: ['student'] }, (ctx) => {
    const att = get('SELECT * FROM qb_exam_attempts WHERE id=? AND student_id=?', Number(ctx.params.id), ctx.user.id);
    if (!att) fail(404, 'آزمون یافت نشد');
    const exam = get('SELECT mode FROM qb_exams WHERE id=?', att.exam_id);
    if (exam.mode !== 'practice') fail(403, 'خودارزیابی فقط در تمرین آزاد فعال است');
    run('UPDATE qb_exam_attempts SET self_eval_json=? WHERE id=?', JSON.stringify(ctx.body.scores || {}), att.id);
    return { ok: true };
  });

  r.get('/api/qb/attempts/:id/report', allRoles, (ctx) => {
    const att = get('SELECT * FROM qb_exam_attempts WHERE id=?', Number(ctx.params.id));
    if (!att) fail(404, 'کارنامه یافت نشد');
    if (ctx.user.role === 'student' && att.student_id !== ctx.user.id) fail(403, 'دسترسی مجاز نیست');
    if (att.status === 'started') fail(403, 'تا پیش از ثبت نهایی آزمون، کارنامه قابل مشاهده نیست');
    const exam = get('SELECT e.*, t.title book_title, t.grade FROM qb_exams e JOIN textbooks t ON t.id=e.book_id WHERE e.id=?', att.exam_id);
    const qRows = all('SELECT * FROM qb_exam_questions WHERE exam_id=? ORDER BY order_index', exam.id);
    const answers = JSON.parse(att.answers_json || '{}');
    const grading = JSON.parse(att.grading_json || '{}');

    const byChapter = new Map(), byTopic = new Map(), byPage = new Map();
    const items = qRows.map((qr) => {
      const snap = JSON.parse(qr.snapshot_json);
      const gr = grading[qr.question_id] || { status: 'blank', score: 0, max_score: snap.score };
      const ch = snap.chapter_id ? get('SELECT number, title FROM textbook_chapters WHERE id=?', snap.chapter_id) : null;
      const ls = snap.lesson_id ? get('SELECT number, title FROM textbook_lessons WHERE id=?', snap.lesson_id) : null;

      const addAgg = (map, key, label) => {
        if (!key) return;
        const x = map.get(key) || { label, total: 0, correct: 0 };
        x.total++;
        if (gr.status === 'correct') x.correct++;
        map.set(key, x);
      };
      addAgg(byChapter, ch ? String(ch.number) : 'other', ch ? `فصل ${ch.number}: ${ch.title}` : 'سایر');
      addAgg(byTopic, snap.topic || 'عمومی', snap.topic || 'عمومی');
      addAgg(byPage, String(snap.primary_page), `صفحه ${snap.primary_page}`);

      return {
        question_id: qr.question_id,
        type: snap.type,
        stem: snap.stem,
        options: JSON.parse(snap.options_json || '[]'),
        assets: JSON.parse(snap.assets_json || '[]'),
        student_answer: answers[String(qr.question_id)] ?? null,
        correct_answer: JSON.parse(snap.answer_json || '{}'),
        explanation: snap.explanation,
        grading: gr,
        primary_page: snap.primary_page,
        chapter_title: ch ? `فصل ${ch.number}: ${ch.title}` : null,
        lesson_title: ls ? ls.title : null,
        topic: snap.topic,
      };
    });

    return {
      attempt: att,
      exam,
      self_eval: att.self_eval_json ? JSON.parse(att.self_eval_json) : null,
      items,
      breakdown: {
        chapters: [...byChapter.values()],
        topics: [...byTopic.values()],
        pages: [...byPage.entries()].map(([p, v]) => ({ page: Number(p), ...v })),
      },
    };
  });

  r.get('/api/qb/exams/:id/submissions', staff, (ctx) => {
    return all(
      `SELECT a.*, u.full_name student_name, u.national_code
       FROM qb_exam_attempts a JOIN users u ON u.id=a.student_id
       WHERE a.exam_id=? AND a.status IN ('submitted','graded') ORDER BY a.submitted_at DESC`,
      Number(ctx.params.id)
    );
  });

  r.post('/api/qb/attempts/:id/grade', staff, (ctx) => {
    const att = get('SELECT * FROM qb_exam_attempts WHERE id=?', Number(ctx.params.id));
    if (!att) fail(404, 'برگه یافت نشد');
    const grading = JSON.parse(att.grading_json || '{}');
    const manualScores = ctx.body.manual_scores || {};
    let manualTotal = 0;
    for (const [qid, gr] of Object.entries(grading)) {
      if (gr.status === 'pending_review' || manualScores[qid] != null) {
        const sc = Math.max(0, Math.min(gr.max_score, Number(manualScores[qid] ?? gr.score ?? 0)));
        gr.score = sc;
        gr.status = sc >= gr.max_score * 0.5 ? 'correct' : 'wrong';
        gr.teacher_note = ctx.body.notes?.[qid] || '';
        manualTotal += sc;
      }
    }
    const total = Number(att.auto_score || 0) + manualTotal;
    const pctVal = att.max_score > 0 ? Math.round((total / att.max_score) * 1000) / 10 : 0;
    run("UPDATE qb_exam_attempts SET grading_json=?, manual_score=?, total_score=?, percent=?, pending_count=0, status='graded', graded_at=datetime('now'), graded_by=? WHERE id=?",
      JSON.stringify(grading), manualTotal, total, pctVal, ctx.user.id, att.id);
    return { ok: true, total_score: total, percent: pctVal };
  });

  r.get('/api/qb/performance/pages', allRoles, (ctx) => {
    const studentId = ctx.user.role === 'student' ? ctx.user.id : Number(ctx.query.student_id || 0);
    if (studentId) {
      return all(
        `SELECT spp.*, t.title book_title FROM student_page_performance spp JOIN textbooks t ON t.id=spp.book_id
         WHERE spp.student_id=? ${ctx.query.book_id ? 'AND spp.book_id=?' : ''} ORDER BY spp.page_number`,
        ...(ctx.query.book_id ? [studentId, ctx.query.book_id] : [studentId])
      );
    }
    if (ctx.query.class_id && ctx.query.book_id) {
      return all(
        `SELECT spp.page_number, COUNT(*) students_count, AVG(CAST(spp.correct_count AS REAL)/NULLIF(spp.attempts_count,0))*100 avg_pct
         FROM student_page_performance spp JOIN students s ON s.user_id=spp.student_id
         WHERE s.class_id=? AND spp.book_id=? GROUP BY spp.page_number ORDER BY spp.page_number`,
        Number(ctx.query.class_id), ctx.query.book_id
      );
    }
    return [];
  });

  // ---------- تنظیمات نسبت دشواری مدیر ----------
  r.get('/api/qb/settings', mgr, (ctx) => {
    const c = get('SELECT qb_mix_easy, qb_mix_medium, qb_mix_hard FROM centers WHERE id=?', ctx.user.center_id || 1);
    return { easy: c?.qb_mix_easy ?? 30, medium: c?.qb_mix_medium ?? 50, hard: c?.qb_mix_hard ?? 20 };
  });

  r.put('/api/qb/settings', mgr, (ctx) => {
    const easy = Number(ctx.body.easy), medium = Number(ctx.body.medium), hard = Number(ctx.body.hard);
    if (easy < 0 || medium < 0 || hard < 0 || easy + medium + hard !== 100) {
      fail(400, 'جمع درصدهای آسان، متوسط و سخت باید دقیقاً ۱۰۰ باشد');
    }
    run('UPDATE centers SET qb_mix_easy=?, qb_mix_medium=?, qb_mix_hard=? WHERE id=?', easy, medium, hard, ctx.user.center_id || 1);
    return { easy, medium, hard };
  });
}
