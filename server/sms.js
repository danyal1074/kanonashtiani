// ارسال پیامک با درگاه قابل تعویض. پیش‌فرض «simulated» است (فقط ثبت می‌کند و چیزی نمی‌فرستد).
//   ROSHD_SMS_PROVIDER=kavenegar   ROSHD_SMS_API_KEY=...   ROSHD_SMS_SENDER=10008663   (کاوه‌نگار، سرویس ساده «sms/send»)
//   ROSHD_SMS_PROVIDER=webhook     ROSHD_SMS_WEBHOOK_URL=https://...   (POST JSON: { to, text } برای هر سرویس دیگر با یک واسط کوچک)
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
export async function sendSms(to, text) {
  try {
    if (PROVIDER === 'kavenegar') await viaKavenegar(to, text);
    else if (PROVIDER === 'webhook') await viaWebhook(to, text);
    else return { ok: true, simulated: true };
    return { ok: true };
  } catch (e) { return { ok: false, error: e.name === 'TimeoutError' ? 'مهلت ارسال پیامک تمام شد' : e.message }; }
}
