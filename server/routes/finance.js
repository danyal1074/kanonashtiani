// حساب یکپارچهٔ مالی دانش‌آموز: اقلام فاکتور، بوفه و خدمات، تخفیف/تعدیل، پرداخت حضوری، ابطال،
// صورتحساب و تطبیق. همه روی جداول موجود fee_invoices / payments / transactions ساخته شده‌اند.
// واحد پول: تومان (عدد صحیح). قفل پنل دانش‌آموز فقط به حق عضویت (fee_settings) وابسته است، نه بدهی بوفه.
import { all, get, run, tx, audit } from '../db.js';
import { fail, clampStr, toEnDigits, ymd, jMonthOf, JMONTHS } from '../util.js';
import { recalcInvoice } from '../logic.js';

const M = { roles: ['manager'] };
const S = { roles: ['student'], allowLocked: true };
export const FEE_LABELS = { tuition: 'شهریه', membership: 'حق عضویت', camp: 'اردو', book: 'کتاب', buffet: 'بوفه', service: 'خدمات آموزشی', other: 'سایر' };
const KIND_LABELS = { tuition: 'شهریه', buffet: 'بوفه', service: 'خدمات', other: 'سایر', discount: 'تخفیف', adjustment: 'تعدیل' };
const MAX_AMOUNT = 10_000_000_000;

// مبلغ صحیح تومان؛ ارقام فارسی/عربی و جداکننده‌ها پذیرفته می‌شوند.
export function toman(value, label = 'مبلغ', { allowNegative = false } = {}) {
  const raw = toEnDigits(String(value ?? '')).replace(/[,،٬\s]/g, '').replace(/^−/, '-');
  if (!/^-?\d+$/.test(raw)) fail(400, `${label} باید عدد صحیح به تومان باشد`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_AMOUNT || (!allowNegative && n <= 0) || n === 0) fail(400, `${label} نامعتبر است`);
  return n;
}
const qty = (v) => {
  const n = Number(toEnDigits(String(v ?? 1)));
  if (!Number.isInteger(n) || n < 1 || n > 1000) fail(400, 'تعداد باید عدد صحیح بین ۱ تا ۱۰۰۰ باشد');
  return n;
};
const monthPeriod = () => { const [y, m] = jMonthOf(ymd()); return `${JMONTHS[m - 1]} ${y}`; };

// پاسخ ذخیره‌شده برای کلید تکراری برگردانده می‌شود؛ ثبت در همان تراکنش انجام می‌شود.
function idempotent(ctx, scope, fn) {
  const key = clampStr(ctx.body.idempotency_key, 80);
  if (!key || !/^[\w-]{8,80}$/.test(key)) fail(400, 'کلید یکتایی درخواست (idempotency_key) لازم است');
  return tx(() => {
    const prev = get('SELECT scope, response_json FROM idempotency_keys WHERE center_id=? AND key=?', ctx.user.center_id, key);
    if (prev) {
      if (prev.scope !== scope) fail(409, 'این کلید یکتایی برای عملیات دیگری استفاده شده است');
      return { ...JSON.parse(prev.response_json), replayed: true };
    }
    const out = fn();
    run('INSERT INTO idempotency_keys(center_id,key,actor_id,scope,response_json) VALUES (?,?,?,?,?)', ctx.user.center_id, key, ctx.user.id, scope, JSON.stringify(out));
    return out;
  });
}

function centerStudent(ctx, id) {
  const s = get(`SELECT u.id, u.full_name, u.active, s.grade, c.name class_name FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
    WHERE u.id=? AND u.center_id=? AND u.role='student'`, Number(id), ctx.user.center_id);
  if (!s) fail(404, 'دانش‌آموز یافت نشد');
  return s;
}
function centerInvoice(ctx, id) {
  const inv = get('SELECT * FROM fee_invoices WHERE id=? AND center_id=?', Number(id), ctx.user.center_id);
  if (!inv) fail(404, 'فاکتور یافت نشد');
  return inv;
}
const lineSum = (invoiceId) => get('SELECT COALESCE(SUM(amount),0) s FROM fee_invoice_lines WHERE invoice_id=?', invoiceId).s;

// افزودن قلم به فاکتور و هم‌ترازی مبلغ فاکتور با جمع اقلام (مبلغ فاکتور همیشه مثبت می‌ماند).
function addLine(ctx, inv, { kind, title, quantity = 1, unit_price, item_id = null, note = null }) {
  if (inv.status === 'void') fail(400, 'فاکتور باطل‌شده قابل تغییر نیست');
  const amount = quantity * unit_price;
  const total = lineSum(inv.id) + amount;
  if (total <= 0) fail(400, 'جمع فاکتور پس از این قلم باید بیشتر از صفر بماند');
  const id = Number(run(`INSERT INTO fee_invoice_lines(invoice_id,center_id,kind,title,quantity,unit_price,amount,item_id,note,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, inv.id, inv.center_id, kind, title, quantity, unit_price, amount, item_id, note, ctx.user.id).lastInsertRowid);
  run('UPDATE fee_invoices SET amount=? WHERE id=?', total, inv.id);
  recalcInvoice(inv.id);
  return id;
}

function invoiceRows(where, ...params) {
  const invoices = all(`SELECT i.*, u.full_name FROM fee_invoices i JOIN users u ON u.id=i.student_id WHERE ${where} ORDER BY i.id DESC`, ...params);
  if (!invoices.length) return [];
  const ids = invoices.map((i) => i.id), marks = ids.map(() => '?').join(',');
  const lines = all(`SELECT id, invoice_id, kind, title, quantity, unit_price, amount, note, created_at FROM fee_invoice_lines WHERE invoice_id IN (${marks}) ORDER BY id`, ...ids);
  const pays = all(`SELECT id, invoice_id, amount, status, method, created_at, reviewed_at, reverse_reason FROM payments WHERE invoice_id IN (${marks}) ORDER BY id`, ...ids);
  return invoices.map((i) => {
    const paid = pays.filter((p) => p.invoice_id === i.id && p.status === 'approved').reduce((n, p) => n + p.amount, 0);
    return { ...i, type_label: FEE_LABELS[i.fee_type] || i.fee_type, paid, remaining: i.status === 'void' ? 0 : i.amount - paid,
      lines: lines.filter((l) => l.invoice_id === i.id).map((l) => ({ ...l, kind_label: KIND_LABELS[l.kind] })), payments: pays.filter((p) => p.invoice_id === i.id) };
  });
}

// صورتحساب: فاکتورها (با اقلام)، پرداخت‌ها، مانده؛ حق عضویت (قفل پنل) جداگانه گزارش می‌شود.
export function statement(studentId) {
  const invoices = invoiceRows('i.student_id=?', studentId);
  const active = invoices.filter((i) => i.status !== 'void');
  const charged = active.reduce((n, i) => n + i.amount, 0);
  const paid = active.reduce((n, i) => n + i.paid, 0);
  const tuitionPayments = all(`SELECT id, amount, status, period, method, created_at, reviewed_at, reverse_reason FROM payments WHERE student_id=? AND invoice_id IS NULL ORDER BY id DESC`, studentId);
  const byKind = {};
  for (const i of active) for (const l of i.lines) byKind[l.kind] = (byKind[l.kind] || 0) + l.amount;
  return {
    currency: 'تومان', invoices, tuition_payments: tuitionPayments,
    totals: { charged, paid, balance: charged - paid, buffet_debt: active.filter((i) => i.fee_type === 'buffet').reduce((n, i) => n + i.amount - i.paid, 0), by_kind: byKind },
  };
}

export default function register(r) {
  // ---------- کاتالوگ بوفه و خدمات ----------
  r.get('/api/manager/charge-items', M, (ctx) => all('SELECT * FROM charge_items WHERE center_id=? ORDER BY category, active DESC, title', ctx.user.center_id));
  r.post('/api/manager/charge-items', M, (ctx) => {
    const b = ctx.body, category = ['buffet', 'service', 'other'].includes(b.category) ? b.category : fail(400, 'دسته نامعتبر است');
    const title = clampStr(b.title, 80) || fail(400, 'عنوان قلم را وارد کنید');
    const price = toman(b.unit_price, 'قیمت');
    if (get('SELECT id FROM charge_items WHERE center_id=? AND category=? AND title=?', ctx.user.center_id, category, title)) fail(400, 'این قلم قبلاً ثبت شده است');
    const id = Number(run('INSERT INTO charge_items(center_id,category,title,unit_price) VALUES (?,?,?,?)', ctx.user.center_id, category, title, price).lastInsertRowid);
    return { ok: true, id };
  });
  r.put('/api/manager/charge-items/:id', M, (ctx) => {
    const item = get('SELECT * FROM charge_items WHERE id=? AND center_id=?', Number(ctx.params.id), ctx.user.center_id) || fail(404, 'قلم یافت نشد');
    const b = ctx.body, title = b.title == null ? item.title : clampStr(b.title, 80), price = b.unit_price == null ? item.unit_price : toman(b.unit_price, 'قیمت');
    if (!title) fail(400, 'عنوان قلم را وارد کنید');
    if (get('SELECT id FROM charge_items WHERE center_id=? AND category=? AND title=? AND id<>?', ctx.user.center_id, item.category, title, item.id)) fail(400, 'عنوان تکراری است');
    // قیمت جدید فقط روی خریدهای بعدی اثر دارد؛ اقلام ثبت‌شده قیمت خودشان را نگه می‌دارند.
    run('UPDATE charge_items SET title=?, unit_price=?, active=? WHERE id=?', title, price, b.active == null ? item.active : (b.active ? 1 : 0), item.id);
    return { ok: true };
  });

  // ---------- ثبت خرید بوفه / خدمات (هم‌توان با کلید یکتایی) ----------
  // اقلام به فاکتور ماهانهٔ همان دسته (بوفه یا خدمات) اضافه می‌شوند؛ قیمت از کاتالوگ سرور خوانده می‌شود، نه از مرورگر.
  r.post('/api/manager/students/:id/charges', M, (ctx) => idempotent(ctx, 'charge', () => {
    const st = centerStudent(ctx, ctx.params.id);
    if (!st.active) fail(400, 'حساب این دانش‌آموز غیرفعال است');
    const items = ctx.body.items;
    if (!Array.isArray(items) || !items.length || items.length > 50) fail(400, 'حداقل یک قلم انتخاب کنید');
    const rows = items.map((x) => {
      const item = get('SELECT * FROM charge_items WHERE id=? AND center_id=? AND active=1', Number(x?.item_id), ctx.user.center_id);
      if (!item) fail(400, 'قلم انتخاب‌شده یافت نشد یا غیرفعال است');
      return { item, quantity: qty(x.quantity) };
    });
    const categories = [...new Set(rows.map((x) => x.item.category))];
    const touched = [];
    for (const category of categories) {
      const feeType = category === 'buffet' ? 'buffet' : 'service';
      let period = monthPeriod();
      let inv = get("SELECT * FROM fee_invoices WHERE student_id=? AND fee_type=? AND period=?", st.id, feeType, period);
      if (inv?.status === 'void') { period = `${period} (ادامه)`; inv = get('SELECT * FROM fee_invoices WHERE student_id=? AND fee_type=? AND period=?', st.id, feeType, period); }
      if (inv?.status === 'void') fail(400, 'فاکتور این ماه باطل شده است؛ با مدیر مالی هماهنگ کنید');
      const mine = rows.filter((x) => x.item.category === category);
      const kind = category === 'buffet' ? 'buffet' : category === 'service' ? 'service' : 'other';
      if (!inv) {
        // فاکتور جدید با جمع اقلام ساخته می‌شود (قید CHECK(amount>0) جدول)
        const total = mine.reduce((n, x) => n + x.quantity * x.item.unit_price, 0);
        const id = Number(run('INSERT INTO fee_invoices (center_id, student_id, fee_type, period, amount) VALUES (?,?,?,?,?)', ctx.user.center_id, st.id, feeType, period, total).lastInsertRowid);
        for (const { item, quantity } of mine) run(`INSERT INTO fee_invoice_lines(invoice_id,center_id,kind,title,quantity,unit_price,amount,item_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
          id, ctx.user.center_id, kind, item.title, quantity, item.unit_price, quantity * item.unit_price, item.id, ctx.user.id);
        recalcInvoice(id);
        touched.push(id);
        continue;
      }
      for (const { item, quantity } of mine) {
        addLine(ctx, inv, { kind, title: item.title, quantity, unit_price: item.unit_price, item_id: item.id });
        inv = get('SELECT * FROM fee_invoices WHERE id=?', inv.id);
      }
      touched.push(inv.id);
    }
    const total = rows.reduce((n, x) => n + x.quantity * x.item.unit_price, 0);
    audit(ctx.user.center_id, ctx.user.id, 'finance.charge', 'student', st.id, { invoices: touched, total, items: rows.map((x) => ({ id: x.item.id, q: x.quantity, p: x.item.unit_price })) });
    return { ok: true, invoice_ids: touched, total };
  }));

  // ---------- تخفیف / تعدیل روی فاکتور ----------
  r.post('/api/manager/invoices/:id/lines', M, (ctx) => idempotent(ctx, 'line', () => {
    const inv = centerInvoice(ctx, ctx.params.id), b = ctx.body;
    const kind = ['discount', 'adjustment'].includes(b.kind) ? b.kind : fail(400, 'فقط تخفیف یا تعدیل قابل افزودن است');
    const note = clampStr(b.reason, 200) || fail(400, 'علت تخفیف/تعدیل را بنویسید');
    let amount = toman(b.amount, 'مبلغ', { allowNegative: kind === 'adjustment' });
    if (kind === 'discount') amount = -Math.abs(amount);
    const id = addLine(ctx, inv, { kind, title: kind === 'discount' ? 'تخفیف' : 'تعدیل', unit_price: amount, note });
    audit(ctx.user.center_id, ctx.user.id, `finance.${kind}`, 'invoice', inv.id, { amount, reason: note });
    return { ok: true, id, invoice: recalcInvoice(inv.id) };
  }));

  // ---------- ثبت پرداخت حضوری (نقدی/کارتخوان) ----------
  r.post('/api/manager/invoices/:id/payments', M, (ctx) => idempotent(ctx, 'payment', () => {
    const inv = centerInvoice(ctx, ctx.params.id);
    if (inv.status === 'void') fail(400, 'فاکتور باطل شده است');
    const method = ['cash', 'pos', 'transfer'].includes(ctx.body.method) ? ctx.body.method : fail(400, 'روش پرداخت نامعتبر است');
    const remaining = inv.amount - get("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE invoice_id=? AND status='approved'", inv.id).s;
    const amount = toman(ctx.body.amount);
    if (amount > remaining) fail(400, `مبلغ بیشتر از ماندهٔ فاکتور (${remaining.toLocaleString('fa-IR')} تومان) است`);
    const name = get('SELECT full_name FROM users WHERE id=?', inv.student_id).full_name;
    const pid = Number(run(`INSERT INTO payments (student_id, amount, invoice_id, fee_type, status, reviewed_at, period, manual, method)
      VALUES (?,?,?,?, 'approved', datetime('now'), ?, 1, ?)`, inv.student_id, amount, inv.id, 'invoice', inv.period, method).lastInsertRowid);
    run('INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)', ctx.user.center_id, 'income', amount,
      `${FEE_LABELS[inv.fee_type] || inv.fee_type} ${inv.period} - ${name}`, 'فاکتور', ymd(), `pay:${pid}`);
    audit(ctx.user.center_id, ctx.user.id, 'finance.payment', 'invoice', inv.id, { payment_id: pid, amount, method });
    return { ok: true, payment_id: pid, invoice: recalcInvoice(inv.id) };
  }));

  // ---------- ابطال فاکتور (فقط بدون پرداخت تأییدشده؛ حذف فیزیکی نمی‌شود) ----------
  r.post('/api/manager/invoices/:id/void', M, (ctx) => {
    const inv = centerInvoice(ctx, ctx.params.id), reason = clampStr(ctx.body.reason, 200) || fail(400, 'علت ابطال را بنویسید');
    if (inv.status === 'void') fail(400, 'فاکتور قبلاً باطل شده است');
    return tx(() => {
      if (get("SELECT 1 x FROM payments WHERE invoice_id=? AND status IN ('approved','pending')", inv.id)) fail(400, 'فاکتور پرداخت تأییدشده یا در انتظار دارد؛ ابتدا پرداخت را برگشت/رد کنید');
      run("UPDATE fee_invoices SET status='void', voided_at=datetime('now'), voided_by=?, void_reason=? WHERE id=?", ctx.user.id, reason, inv.id);
      audit(ctx.user.center_id, ctx.user.id, 'finance.void', 'invoice', inv.id, { amount: inv.amount, reason });
      return { ok: true };
    });
  });

  // ---------- صورتحساب ----------
  r.get('/api/manager/students/:id/statement', M, (ctx) => ({ student: centerStudent(ctx, ctx.params.id), ...statement(Number(ctx.params.id)) }));
  r.get('/api/student/statement', S, (ctx) => statement(ctx.user.id));
  r.get('/api/manager/finance/students', M, (ctx) => {
    const q = clampStr(ctx.query.q, 60);
    return all(`SELECT u.id, u.full_name, s.grade, c.name class_name, u.active,
        COALESCE((SELECT SUM(i.amount - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id AND p.status='approved'),0)) FROM fee_invoices i WHERE i.student_id=u.id AND i.status<>'void'),0) balance
      FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
      WHERE u.center_id=? AND u.role='student' ${q ? 'AND (u.full_name LIKE ? OR u.national_code LIKE ?)' : ''} ORDER BY balance DESC, u.full_name LIMIT 200`,
    ctx.user.center_id, ...(q ? [`%${q}%`, `%${toEnDigits(q)}%`] : []));
  });

  // ---------- تطبیق: ناسازگاری اقلام، پرداخت‌ها و اسناد حسابداری ----------
  r.get('/api/manager/finance/reconcile', M, (ctx) => {
    const cid = ctx.user.center_id;
    const issues = [];
    for (const i of all(`SELECT i.id, i.amount, i.paid, i.status, (SELECT COALESCE(SUM(amount),0) FROM fee_invoice_lines l WHERE l.invoice_id=i.id) lines,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id AND p.status='approved') approved FROM fee_invoices i WHERE i.center_id=?`, cid)) {
      if (i.lines !== i.amount) issues.push({ type: 'lines_mismatch', invoice_id: i.id, expected: i.amount, actual: i.lines });
      if (i.approved !== i.paid) issues.push({ type: 'paid_mismatch', invoice_id: i.id, expected: i.approved, actual: i.paid });
      if (i.approved > i.amount && i.status !== 'void') issues.push({ type: 'overpaid', invoice_id: i.id, expected: i.amount, actual: i.approved });
    }
    for (const p of all(`SELECT p.id, p.amount, p.status FROM payments p JOIN users u ON u.id=p.student_id WHERE u.center_id=? AND p.status IN ('approved','reversed') AND p.amount>0
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.center_id=? AND t.ref='pay:' || p.id AND t.type='income')`, cid, cid)) issues.push({ type: 'missing_income_entry', payment_id: p.id, expected: p.amount, actual: 0 });
    for (const p of all(`SELECT p.id, p.amount FROM payments p JOIN users u ON u.id=p.student_id WHERE u.center_id=? AND p.status='reversed' AND p.amount>0
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.center_id=? AND t.ref='reversal:' || p.id AND t.type='expense')`, cid, cid)) issues.push({ type: 'missing_reversal_entry', payment_id: p.id, expected: p.amount, actual: 0 });
    const totals = get(`SELECT COALESCE(SUM(CASE WHEN status<>'void' THEN amount END),0) charged, COALESCE(SUM(CASE WHEN status<>'void' THEN paid END),0) paid FROM fee_invoices WHERE center_id=?`, cid);
    return { ok: !issues.length, checked_at: new Date().toISOString(), totals: { ...totals, outstanding: totals.charged - totals.paid }, issues };
  });
}
