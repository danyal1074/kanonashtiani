// Phase 4: exam from bank → publish → student takes → hidden results → release → visible; AI panel state.
export default async function ({ session, open, shot, check }) {
  const t = await session('teacher', 'teacher');
  const p = t.page;
  await open(p, '/exams');
  await p.click('#newExam');
  const stamp = Date.now() % 100000;
  await p.fill('#exForm [name=title]', `آزمون بانک ${stamp}`);
  await p.selectOption('#exGrade', '7');
  await p.click('#fromBank');
  await p.waitForSelector('#bpList input');
  const boxes = p.locator('#bpList input');
  const n = Math.min(3, await boxes.count());
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await shot(p, 'p4-bank-picker');
  await p.locator('.modal-foot .btn:not(.ghost)').last().click();
  await p.waitForTimeout(400);
  await p.locator('.modal-foot .btn:not(.ghost)').last().click();
  await p.waitForURL(/#\/exams\/\d+/);
  const id = Number(p.url().match(/exams\/(\d+)/)[1]);
  await p.waitForTimeout(500);
  check('Exam created from bank as a draft', await p.locator('text=پیش‌نویس').count() > 0);
  await p.click('[data-to="ready"]');
  await p.waitForSelector('#pubBtn');
  await p.click('#pubBtn');
  await p.locator('#pubR').check();
  await p.click('.modal-foot .btn.green');
  await p.waitForTimeout(700);
  check('Teacher published the exam', await p.locator('text=در حال برگزاری').count() > 0);
  await shot(p, 'p4-exam-published');

  const s = await session('student', 'student');
  await open(s.page, '/exams');
  const startLink = s.page.locator(`a[href="#/exam/${id}"]`);
  check('Student sees the open exam', await startLink.count() === 1);
  await startLink.click();
  await s.page.click('.modal-foot .btn.green, [data-act="1"]').catch(() => {});
  await s.page.waitForSelector('[data-opt]');
  for (let i = 0; i < n; i++) { await s.page.locator('[data-opt="0"]').first().click(); await s.page.waitForTimeout(350); }
  await s.page.click('#finish');
  await s.page.click('.modal-foot .btn.green, [data-act="1"]');
  await s.page.waitForTimeout(800);
  check('After submit the student waits for report release', await s.page.locator('text=منتظر انتشار کارنامه').count() > 0);
  await shot(s.page, 'p4-student-waiting');

  await open(p, `/exams/${id}`);
  await p.click('[data-to="results_released"]');
  await p.click('.modal-foot .btn.green').catch(() => {});
  await p.waitForTimeout(700);
  check('Teacher released results', await p.locator('text=کارنامه منتشر شد').count() > 0);
  await open(s.page, `/results/${id}`);
  check('Student now sees the report card', !(await s.page.locator('text=هنوز منتشر نشده').count()));
  await shot(s.page, 'p4-student-result');

  await open(p, '/bank');
  await p.click('#bkAi');
  await p.waitForSelector('#aiSrc');
  const disabledMsg = await p.locator('text=تولید با هوش مصنوعی روی این سرور فعال نیست').count();
  const enabledMsg = await p.locator('text=سرویس فعال').count();
  check('AI panel reports its real configuration state', disabledMsg + enabledMsg === 1);
  await shot(p, 'p4-ai-panel');
  check('No page errors (teacher)', !t.errors.length, t.errors.join(' | '));
  check('No page errors (student)', !s.errors.length, s.errors.join(' | '));
  for (const x of [t, s]) await x.ctx.close();
}
