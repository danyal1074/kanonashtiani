// Phase 1: counselor class assignment (manager UI) and counselor visibility.
export default async function ({ session, open, shot, check }) {
  const m = await session('manager', 'manager');
  await open(m.page, '/counselors');
  check('Manager counselors page renders', await m.page.locator('table').count() > 0);
  // Create a counselor through the real UI form if none exists yet.
  if (!(await m.page.locator('[data-assign-counselor]').count())) {
    await m.page.click('#newCounselor');
    await m.page.fill('#counselorForm [name=full_name]', 'مشاور آزمایشی');
    await m.page.fill('#counselorForm [name=username]', 'e2e_counselor');
    await m.page.fill('#counselorForm [name=password]', '123456');
    await m.page.click('.modal-foot .btn:not(.ghost)');
    await m.page.waitForSelector('[data-assign-counselor]');
  }
  check('Counselor row offers class assignment', await m.page.locator('[data-assign-counselor]').count() > 0);
  await m.page.locator('[data-assign-counselor]').first().click();
  await m.page.waitForSelector('#ccForm input[name=cls]');
  const boxes = m.page.locator('#ccForm input[name=cls]');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).uncheck();
  await boxes.first().check();
  await shot(m.page, 'p1-assign-modal');
  await m.page.click('.modal-foot .btn:not(.ghost)');
  await m.page.waitForTimeout(600);
  const chips = await m.page.locator('table tbody tr').first().locator('.badge.blue').count();
  check('Saved assignment shows exactly one class chip', chips === 1, `chips=${chips}`);
  await shot(m.page, 'p1-counselors');
  check('No page errors on manager counselors page', !m.errors.length, m.errors.join(' | '));

  const res = await m.page.request.get('/api/manager/counselors');
  const list = await res.json();
  const c = list[0];
  // Log in as that counselor via its username (seeded or e2e) and verify scoped list.
  if (c.username === 'e2e_counselor') {
    const co = await session('counselor', 'e2e_counselor');
    const students = await (await co.page.request.get('/api/counselor/students')).json();
    const expected = c.classes.reduce((n, x) => n + x.students, 0);
    check('Counselor sees only students of the assigned class', students.length === expected, `${students.length} vs ${expected}`);
    await open(co.page, '/students');
    await shot(co.page, 'p1-counselor-students');
    check('No page errors in counselor panel', !co.errors.length, co.errors.join(' | '));
    await co.ctx.close();
  }
  // Mobile layout of the same page.
  const mm = await session('manager', 'manager', '123456', { width: 390, height: 844 });
  await open(mm.page, '/counselors');
  const overflow = await mm.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Counselors page has no horizontal page scroll on phone width', overflow <= 1, `overflow=${overflow}px`);
  await shot(mm.page, 'p1-counselors-mobile');
  await mm.ctx.close();
  await m.ctx.close();
}
