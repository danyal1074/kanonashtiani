// Phase 5: manager staff evaluation page, weights, drill-down + feedback, CSV export, role guard.
export default async function ({ session, open, shot, check }) {
  const m = await session('manager', 'manager');
  const p = m.page;
  await open(p, '/staff-eval?preset=90');
  check('Teacher evaluation table renders', await p.locator('table tbody tr').count() > 0);
  await shot(p, 'p5-teachers');
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('#seCsv')]);
  check('CSV export downloads', /\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
  await p.locator('[data-drill]').first().click();
  await p.waitForSelector('#fbF');
  await p.selectOption('#fbF [name=rating]', '4');
  await p.fill('#fbF [name=comment]', 'آزمون‌های منظم');
  await p.click('#fbF button');
  await p.waitForTimeout(800);
  await p.locator('[data-drill]').first().click();
  await p.waitForSelector('#fbF');
  check('Feedback is saved and shown in the drill-down', await p.locator('.modal >> text=آزمون‌های منظم').count() > 0);
  await shot(p, 'p5-drill');
  await p.click('.modal [data-close]');
  await p.click('#seW');
  await p.fill('#w-student_trend', '۱۰');
  await p.click('.modal-foot .btn:not(.ghost)');
  await p.waitForTimeout(700);
  check('Weights are saved through the UI', await p.locator('th:has-text("وزن ۱۰")').count() >= 1);
  await p.click('[data-role="counselor"]');
  await p.waitForTimeout(800);
  await shot(p, 'p5-counselors');
  check('No page errors on staff evaluation', !m.errors.length, m.errors.join(' | '));
  const t = await session('teacher', 'teacher');
  const r = await t.page.request.get('/api/manager/staff-eval');
  check('Teachers cannot read staff evaluations', r.status() === 403, String(r.status()));
  const mm = await session('manager', 'manager', '123456', { width: 390, height: 844 });
  await open(mm.page, '/staff-eval');
  const overflow = await mm.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Staff evaluation has no horizontal page scroll on phone', overflow <= 1, `overflow=${overflow}px`);
  for (const x of [m, t, mm]) await x.ctx.close();
}
