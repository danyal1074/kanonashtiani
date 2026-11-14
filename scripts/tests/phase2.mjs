// Phase 2: unified student account (itemized invoices, buffet, discounts, payments, void, reconcile).
export default async function ({ db, test, get, post, put, del }, assert) {
  console.log('— Phase 2: finance');
  const { manager, otherManager, student, student2, teacher } = globalThis;
  const key = (s) => `test-${s}-${Math.random().toString(36).slice(2, 10)}`;

  const items = [];
  for (const [category, title, unit_price] of [['buffet', 'ساندویچ', '۴۵٬۰۰۰'], ['buffet', 'آب‌میوه', 15000], ['service', 'کلاس رفع اشکال', 300000]]) {
    const r = await post(manager, '/api/manager/charge-items', { category, title, unit_price });
    items.push(r);
  }
  await test('Manager creates catalog items; Persian digits and separators are accepted', () => {
    for (const r of items) assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(db.prepare("SELECT unit_price FROM charge_items WHERE title='ساندویچ'").get().unit_price, 45000);
  });
  const [sandwich, juice, tutoring] = items.map((r) => r.data.id);
  const bad = await Promise.all([
    post(manager, '/api/manager/charge-items', { category: 'buffet', title: 'منفی', unit_price: -5 }),
    post(manager, '/api/manager/charge-items', { category: 'buffet', title: 'اعشار', unit_price: '12.5' }),
    post(manager, '/api/manager/charge-items', { category: 'hack', title: 'x', unit_price: 1 }),
    post(teacher, '/api/manager/charge-items', { category: 'buffet', title: 'x', unit_price: 1 }),
  ]);
  await test('Invalid prices, categories and non-manager roles are rejected', () => {
    assert.deepEqual(bad.map((r) => r.status), [400, 400, 400, 403]);
  });

  const k1 = key('buy');
  const buy = { idempotency_key: k1, items: [{ item_id: sandwich, quantity: 2, unit_price: 1 }, { item_id: juice, quantity: '۳' }, { item_id: tutoring, quantity: 1 }] };
  const [first, retry] = await Promise.all([post(manager, '/api/manager/students/40/charges', buy), post(manager, '/api/manager/students/40/charges', buy)]);
  const again = await post(manager, '/api/manager/students/40/charges', buy);
  await test('Buffet/service charge uses server catalog prices and is idempotent on retries/double-clicks', () => {
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.total, 2 * 45000 + 3 * 15000 + 300000);
    assert.ok(retry.status === 200 && again.data.replayed);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM fee_invoice_lines WHERE invoice_id IN (SELECT id FROM fee_invoices WHERE student_id=40)').get().n, 3);
    const invs = db.prepare("SELECT fee_type, amount FROM fee_invoices WHERE student_id=40 ORDER BY fee_type").all().map((r) => ({ ...r }));
    assert.deepEqual(invs, [{ fee_type: 'buffet', amount: 135000 }, { fee_type: 'service', amount: 300000 }]);
  });
  const more = await post(manager, '/api/manager/students/40/charges', { idempotency_key: key('buy2'), items: [{ item_id: juice, quantity: 1 }] });
  const buffetInv = db.prepare("SELECT * FROM fee_invoices WHERE student_id=40 AND fee_type='buffet'").get();
  await test('Later purchases in the same month append to the monthly buffet invoice', () => {
    assert.equal(more.status, 200);
    assert.equal(buffetInv.amount, 150000);
  });
  const reuse = await post(manager, '/api/manager/invoices/' + buffetInv.id + '/payments', { idempotency_key: k1, amount: 1000, method: 'cash' });
  const foreign = await Promise.all([
    post(otherManager, '/api/manager/students/40/charges', { idempotency_key: key('x'), items: [{ item_id: sandwich, quantity: 1 }] }),
    post(otherManager, `/api/manager/invoices/${buffetInv.id}/payments`, { idempotency_key: key('x'), amount: 1000, method: 'cash' }),
    get(otherManager, '/api/manager/students/40/statement'),
    post(manager, '/api/manager/students/42/charges', { idempotency_key: key('x'), items: [{ item_id: sandwich, quantity: 1 }] }),
    post(manager, '/api/manager/students/40/charges', { items: [{ item_id: sandwich, quantity: 1 }] }),
  ]);
  await test('Cross-center access, key reuse across operations and missing idempotency keys are rejected', () => {
    assert.equal(reuse.status, 409);
    assert.deepEqual(foreign.map((r) => r.status), [404, 404, 404, 404, 400]);
  });

  const disc = await post(manager, `/api/manager/invoices/${buffetInv.id}/lines`, { idempotency_key: key('d'), kind: 'discount', amount: '۲۰٬۰۰۰', reason: 'تخفیف خانواده' });
  const tooBig = await post(manager, `/api/manager/invoices/${buffetInv.id}/lines`, { idempotency_key: key('d'), kind: 'discount', amount: 999999, reason: 'x' });
  const noReason = await post(manager, `/api/manager/invoices/${buffetInv.id}/lines`, { idempotency_key: key('d'), kind: 'adjustment', amount: 5000 });
  await test('Discount reduces the invoice; discounts cannot zero the invoice; reason is required', () => {
    assert.equal(disc.status, 200, JSON.stringify(disc.data));
    assert.equal(db.prepare('SELECT amount FROM fee_invoices WHERE id=?').get(buffetInv.id).amount, 130000);
    assert.equal(tooBig.status, 400); assert.equal(noReason.status, 400);
  });
  const pay1 = await post(manager, `/api/manager/invoices/${buffetInv.id}/payments`, { idempotency_key: key('p'), amount: 100000, method: 'cash' });
  const over = await post(manager, `/api/manager/invoices/${buffetInv.id}/payments`, { idempotency_key: key('p'), amount: 50000, method: 'pos' });
  const pay2 = await post(manager, `/api/manager/invoices/${buffetInv.id}/payments`, { idempotency_key: key('p'), amount: 30000, method: 'pos' });
  await test('Partial payments settle the invoice and overpayment is refused', () => {
    assert.equal(pay1.status, 200); assert.equal(pay1.data.invoice.status, 'partial');
    assert.equal(over.status, 400);
    assert.equal(pay2.data.invoice.status, 'paid'); assert.equal(pay2.data.invoice.remaining, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions WHERE ref IN (?,?) AND type='income'").get(`pay:${pay1.data.payment_id}`, `pay:${pay2.data.payment_id}`).n, 2);
  });
  const voidPaid = await post(manager, `/api/manager/invoices/${buffetInv.id}/void`, { reason: 'اشتباه' });
  const serviceInv = db.prepare("SELECT id FROM fee_invoices WHERE student_id=40 AND fee_type='service'").get().id;
  const voidOk = await post(manager, `/api/manager/invoices/${serviceInv}/void`, { reason: 'کلاس برگزار نشد' });
  const payVoid = await post(manager, `/api/manager/invoices/${serviceInv}/payments`, { idempotency_key: key('p'), amount: 1000, method: 'cash' });
  await test('Settled invoices cannot be voided; unpaid invoices are voided (not deleted) and frozen', () => {
    assert.equal(voidPaid.status, 400);
    assert.equal(voidOk.status, 200);
    const row = db.prepare('SELECT status, void_reason FROM fee_invoices WHERE id=?').get(serviceInv);
    assert.equal(row.status, 'void'); assert.equal(row.void_reason, 'کلاس برگزار نشد');
    assert.equal(payVoid.status, 400);
  });

  // Reversal of an approved payment (existing endpoint) re-opens the invoice and keeps the audit trail.
  const reversed = await post(manager, `/api/manager/receipts/${pay2.data.payment_id}/reverse`, { reason: 'برگشت وجه' });
  const st = await get(student, '/api/student/statement');
  await test('Reversal reopens the balance; student statement shows lines, payments and balance', () => {
    assert.equal(reversed.status, 200);
    assert.equal(st.status, 200);
    assert.equal(st.data.currency, 'تومان');
    assert.equal(st.data.totals.charged, 130000); // void service invoice excluded
    assert.equal(st.data.totals.paid, 100000);
    assert.equal(st.data.totals.balance, 30000);
    assert.equal(st.data.totals.buffet_debt, 30000);
    const inv = st.data.invoices.find((i) => i.fee_type === 'buffet');
    assert.deepEqual(inv.lines.map((l) => l.kind), ['buffet', 'buffet', 'buffet', 'discount']);
    assert.equal(inv.payments.find((p) => p.id === pay2.data.payment_id).status, 'reversed');
  });
  const other = await get(student2, '/api/student/statement');
  await test('A student sees only their own statement', () => {
    assert.equal(other.data.invoices.length, 0);
  });
  const fee = await get(student, '/api/student/payment');
  await test('Buffet debt does not lock the student panel (tuition lock stays independent)', () => {
    assert.equal(fee.status, 200); assert.equal(fee.data.locked, false);
  });

  const recon = await get(manager, '/api/manager/finance/reconcile');
  await test('Reconciliation passes after all operations', () => {
    assert.equal(recon.status, 200);
    assert.deepEqual(recon.data.issues, []);
    assert.equal(recon.data.totals.outstanding, 30000);
  });
  db.prepare("UPDATE fee_invoices SET amount=amount+1 WHERE id=?").run(buffetInv.id);
  const broken = await get(manager, '/api/manager/finance/reconcile');
  db.prepare("UPDATE fee_invoices SET amount=amount-1 WHERE id=?").run(buffetInv.id);
  await test('Reconciliation detects tampered invoice totals', () => {
    assert.equal(broken.data.ok, false);
    assert.ok(broken.data.issues.some((i) => i.type === 'lines_mismatch' && i.invoice_id === buffetInv.id));
  });

  const reissue = await post(manager, '/api/manager/invoices', { student_id: 41, fee_type: 'camp', period: 'اردو', amount: 200000 });
  const reissue2 = await post(manager, '/api/manager/invoices', { student_id: 41, fee_type: 'camp', period: 'اردو', amount: 999 });
  await test('Re-issuing a periodic invoice never overwrites an existing amount', () => {
    assert.equal(reissue.data.count, 1); assert.equal(reissue2.data.skipped, 1);
    assert.equal(db.prepare("SELECT amount FROM fee_invoices WHERE student_id=41 AND fee_type='camp'").get().amount, 200000);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM fee_invoice_lines l JOIN fee_invoices i ON i.id=l.invoice_id WHERE i.student_id=41").get().n, 1);
  });
  const delPaid = await del(manager, '/api/manager/students/40');
  await test('Students with settled payments cannot be hard-deleted (financial history preserved)', () => {
    assert.equal(delPaid.status, 409);
    assert.ok(db.prepare('SELECT id FROM users WHERE id=40').get());
  });
  const auditCount = db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action LIKE 'finance.%'").get().n;
  await test('Every financial write is in the audit log', () => assert.ok(auditCount >= 6, String(auditCount)));

}
