// ارسال پیامک با درگاه قابل تعویض. پیش‌فرض «simulated» است (فقط ثبت می‌کند و چیزی نمی‌فرستد).
//   ROSHD_SMS_PROVIDER=kavenegar   ROSHD_SMS_API_KEY=...   ROSHD_SMS_SENDER=10008663   (کاوه‌نگار، سرویس ساده «sms/send»)
//   ROSHD_SMS_PROVIDER=webhook     ROSHD_SMS_WEBHOOK_URL=https://...   (POST JSON: { to, text } برای هر سرویس دیگر با یک واسط کوچک)
import { run } from './db.js';

const PROVIDER = (process.env.ROSHD_SMS_PROVIDER || 'simulated').toLowerCase();
const TIMEOUT = 10_000;

export const smsProvider = () => PROVIDER;

async function viaKavenegar(to, text) {
  const key = process.env.ROSHD_SMS_API_KEY;
  if (!key) throw new Error('کلید API پیامک (ROSHD_SMS_API_KEY) تنظیم نشده است');
  const q = new URLSearchParams({ receptor: to, message: text });
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
  try {
    if (meta.center_id) {
      const r = run(`INSERT INTO sms_outbox (center_id, recipient_phone, student_id, message_type, content, status) VALUES (?,?,?,?,?, 'pending')`,
        meta.center_id, to, meta.student_id || null, meta.message_type || 'general', text);
      outboxId = r.lastInsertRowid;
    }
  } catch { /* نادیده گرفتن در صورت عدم وجود جدول در برخی تست‌ها */ }

  try {
    if (PROVIDER === 'kavenegar') await viaKavenegar(to, text);
    else if (PROVIDER === 'webhook') await viaWebhook(to, text);
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
