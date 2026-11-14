// طبقه‌بندی خالص (بدون DOM) میزان پرشدگی چهار حباب یک سؤال پاسخ‌برگ.
// خروجی: answer (اندیس گزینه یا null)، status و confidence بین ۰ و ۱.
//   ok    : یک گزینهٔ کاملاً پر و بقیه خالی
//   blank : هیچ گزینه‌ای پر نشده
//   multi : بیش از یک گزینه پر شده (پاسخ ثبت نمی‌شود تا مصحح بررسی کند)
//   weak  : علامت کم‌رنگ یا پاک‌شده؛ بهترین حدس پیشنهاد می‌شود ولی بازبینی لازم است
export const FILL_ON = 0.45, FILL_WEAK = 0.22;

export function classifyFills(fills) {
  const f = fills.map((x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0));
  const order = f.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const [top, second] = [order[0], order[1] || [0, -1]];
  const marked = f.filter((v) => v >= FILL_ON).length;
  if (marked >= 2 && second[0] >= top[0] * 0.6) return { answer: null, status: 'multi', confidence: Math.round((1 - second[0] / Math.max(top[0], 1e-6)) * 100) / 100 };
  if (top[0] >= FILL_ON && second[0] < top[0] * 0.6) {
    const confidence = Math.min(1, (top[0] - second[0]) / 0.6);
    return { answer: top[1], status: second[0] >= FILL_WEAK ? 'weak' : 'ok', confidence: Math.round(confidence * 100) / 100 };
  }
  if (top[0] >= FILL_WEAK) return { answer: top[1], status: 'weak', confidence: Math.round(Math.min(1, (top[0] - second[0]) / 0.6) * 100) / 100 };
  return { answer: null, status: 'blank', confidence: Math.round((1 - top[0] / FILL_WEAK) * 100) / 100 };
}
