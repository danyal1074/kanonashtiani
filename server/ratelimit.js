// محدودکننده نرخ (سطل توکن) در حافظه. کلید برای کاربر واردشده شناسه خودش است، نه آی‌پی؛
// چون تمام دانش‌آموزان یک مدرسه یا کانون ممکن است پشت یک آی‌پی عمومی باشند.
const buckets = new Map();

export function allow(key, { burst, perSecond }) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: burst, at: now }; buckets.set(key, b); }
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSecond);
  b.at = now;
  if (b.tokens < 1) return { ok: false, retryAfter: Math.ceil((1 - b.tokens) / perSecond) };
  b.tokens -= 1;
  return { ok: true };
}

export function purge(idleMs = 5 * 60e3) {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.at > idleMs) buckets.delete(k);
}
export const size = () => buckets.size;
