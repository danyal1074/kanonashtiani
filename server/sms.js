// ارسال پیامک با درگاه قابل تعویض. پیش‌فرض «simulated» است (فقط ثبت می‌کند و چیزی نمی‌فرستد).
//   ROSHD_SMS_PROVIDER=smsir       ROSHD_SMS_API_KEY=...   ROSHD_SMS_SENDER=3000xxxx   (sms.ir ایده پردازان)
//   ROSHD_SMS_PROVIDER=kavenegar   ROSHD_SMS_API_KEY=...   ROSHD_SMS_SENDER=10008663   (کاوه‌نگار، سرویس ساده «sms/send»)
//   ROSHD_SMS_PROVIDER=webhook     ROSHD_SMS_WEBHOOK_URL=https://...   (POST JSON: { to, text } برای هر سرویس دیگر با یک واسط کوچک)
import { run } from './db.js';

const TIMEOUT = 10_000;

export const smsProvider = () => (process.env.ROSHD_SMS_PROVIDER || 'simulated').toLowerCase();

async function viaSmsIr(to, text) {
  const key = process.env.ROSHD_SMS_API_KEY;
  if (!key) throw new Error('کلید API پیامک (ROSHD_SMS_API_KEY) تنظیم نشده است');
  const line = process.env.ROSHD_SMS_SENDER;
  if (!line) throw new Error('شماره خط فرستنده پیامک (ROSHD_SMS_SENDER) تنظیم نشده است');

  const mobiles = Array.isArray(to) ? to : String(to).split(/[,،\s]+/).filter(Boolean);
  if (!mobiles.length) throw new Error('شماره گیرنده پیامک نامعتبر است');

  const res = await fetch('https://api.sms.ir/v1/send/bulk', {
    method: 'POST',
    headers: {
      'X-API-KEY': key,
      'Accept': 'text/plain',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lineNumber: Number(line) || line,
      messageText: text,
      mobiles,
      sendDateTime: null,
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j && j.status !== 1)) {
    throw new Error(`درگاه sms.ir: ${j?.message || res.statusText || res.status}`);
  }
}

async function viaKavenegar(to, text) {
  const key = process.env.ROSHD_SMS_API_KEY;
  if (!key) throw new Error('کلید API پیامک (ROSHD_SMS_API_KEY) تنظیم نشده است');
  const q = new URLSearchParams({ receptor: Array.isArray(to) ? to.join(',') : to, message: text });
  if (process.env.ROSHD_SMS_SENDER) q.set('sender', process.env.ROSHD_SMS_SENDER);
  const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json?${q}`, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.return?.status !== 200) throw new Error(`درگاه پیامک: ${j?.return?.message || res.status}`);
}

async function viaWebhook(to, text) {
  const url = process.env.ROSHD_SMS_WEBHOOK_URL;
  if (!url) throw new Error('آدرس وب‌هوک پیامک (ROSHD_SMS_WEBHOOK_URL) تنظیم نشده است');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ROSHD_SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.ROSHD_SMS_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ to, text }), signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`وب‌هوک پیامک: ${res.status}`);
}

// خروجی: { ok, simulated?, error? } ؛ هرگز پرتاب نمی‌کند تا یک پیامک ناموفق بقیه را متوقف نکند
export async function sendSms(to, text, meta = {}) {
  let outboxId = null;
  const toStr = Array.isArray(to) ? to.join(',') : String(to || '');
  try {
    if (meta.center_id) {
      const r = run(`INSERT INTO sms_outbox (center_id, recipient_phone, student_id, message_type, content, status) VALUES (?,?,?,?,?, 'pending')`,
        meta.center_id, toStr, meta.student_id || null, meta.message_type || 'general', text);
      outboxId = r.lastInsertRowid;
    }
  } catch { /* نادیده گرفتن در صورت عدم وجود جدول در برخی تست‌ها */ }

  const provider = smsProvider();
  try {
    if (provider === 'smsir' || provider === 'sms.ir') await viaSmsIr(to, text);
    else if (provider === 'kavenegar') await viaKavenegar(to, text);
    else if (provider === 'webhook') await viaWebhook(to, text);
    else {
      if (outboxId) {
        run(`UPDATE sms_outbox SET status='sent', sent_at=datetime('now') WHERE id=?`, outboxId);
      }
      return { ok: true, simulated: true, outbox_id: outboxId };
    }

    if (outboxId) {
      run(`UPDATE sms_outbox SET status='sent', sent_at=datetime('now') WHERE id=?`, outboxId);
    }
    return { ok: true, outbox_id: outboxId };
  } catch (e) {
    const err = e.name === 'TimeoutError' ? 'مهلت ارسال پیامک تمام شد' : e.message;
    if (outboxId) {
      run(`UPDATE sms_outbox SET status='failed', error_message=? WHERE id=?`, err, outboxId);
    }
    return { ok: false, error: err, outbox_id: outboxId };
  }
}
