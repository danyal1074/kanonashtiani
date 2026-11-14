// Phase 2: catalog → buffet purchase (double click) → discount → cash payment → statement → reconcile; student view.
export default async function ({ session, open, shot, check }) {
  const m = await session('manager', 'manager');
  const p = m.page;
  await open(p, '/finance?tab=catalog');
  const title = `ساندویچ ${Date.now() % 100000}`;
  await p.selectOption('#itemForm [name=category]', 'buffet');
  await p.fill('#itemForm [name=title]', title);
  await p.fill('#itemForm [name=unit_price]', '۴۵۰۰۰');
  await p.click('#itemForm button');
  await p.waitForSelector(`text=${title}`);
  check('Catalog item created with Persian digits', await p.locator(`td:has-text("${title}")`).count() === 1);
  await shot(p, 'p2-catalog');

  await open(p, '/finance?tab=charge');
  await p.waitForSelector('[data-pick]');
  const pick = p.locator('[data-pick]').first();
  const sid = Number(await pick.getAttribute('data-pick'));
  const before = await (await p.request.get(`/api/manager/students/${sid}/statement`)).json();
  await pick.click();
  await p.locator(`[data-add]:has-text("${title}")`).click();
  await p.locator(`[data-add]:has-text("${title}")`).click();
  await shot(p, 'p2-cart');
  // Double click on submit must create only one charge.
  await p.locator('#finSubmit').dblclick();
  await p.waitForTimeout(800);
  const after = await (await p.request.get(`/api/manager/students/${sid}/statement`)).json();
  check('Double-click submit charges the cart exactly once', after.totals.charged - before.totals.charged === 90000, `${after.totals.charged - before.totals.charged}`);

  await open(p, `/finance?tab=accounts&student=${sid}`);
  const inv = after.invoices.find((i) => i.fee_type === 'buffet');
  await p.locator(`[data-line="${inv.id}"][data-kind=discount]`).click();
  await p.fill('#lineForm [name=amount]', '۱۰٬۰۰۰');
  await p.fill('#lineForm [name=reason]', 'تخفیف آزمایشی');
  await p.click('.modal-foot .btn:not(.ghost)');
  await p.waitForTimeout(600);
  await p.locator(`[data-pay="${inv.id}"]`).click();
  await p.click('.modal-foot .btn.green');
  await p.waitForTimeout(700);
  const final = await (await p.request.get(`/api/manager/students/${sid}/statement`)).json();
  const fi = final.invoices.find((i) => i.id === inv.id);
  check('Discount line and full cash payment settle the buffet invoice', fi.status === 'paid' && fi.lines.some((l) => l.kind === 'discount'), fi.status);
  await shot(p, 'p2-statement');

  await open(p, '/finance?tab=reconcile');
  check('Reconciliation reports no issues', await p.locator('text=همهٔ فاکتورها، پرداخت‌ها و اسناد حسابداری با یکدیگر سازگارند').count() === 1);
  await shot(p, 'p2-reconcile');
  check('No page errors in manager finance pages', !m.errors.length, m.errors.join(' | '));

  const s = await session('student', 'student');
  await open(s.page, '/records');
  check('Student sees own account statement', await s.page.locator('#myStatement').count() === 1);
  await shot(s.page, 'p2-student-statement');
  check('No page errors in student records', !s.errors.length, s.errors.join(' | '));
  const mm = await session('manager', 'manager', '123456', { width: 390, height: 844 });
  await open(mm.page, `/finance?tab=accounts&student=${sid}`);
  const overflow = await mm.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Statement page has no horizontal page scroll on phone', overflow <= 1, `overflow=${overflow}px`);
  await shot(mm.page, 'p2-statement-mobile');
  for (const x of [m, s, mm]) await x.ctx.close();
}
