// «کلاس‌های آنلاین من» — کارت زندهٔ کلاس‌ها در صفحهٔ «کلاس آنلاین» دانش‌آموز.
// فقط به مسیرهای سرور پنل وصل است (شناسهٔ دانش‌آموز از نشست سرور می‌آید)؛ راز و بلیت هرگز در مرورگر نمی‌ماند.
import { api, post, esc, fa, jdate, jtime, toast, busy, empty } from './core.js';

const row = (c) => {
  const when = c.scheduledAt ? `${jdate(c.scheduledAt)} - ساعت ${jtime(c.scheduledAt)}` : 'زمان مشخص نشده';
  const meta = [c.subject, c.topic, c.grade ? `پایه ${fa(c.grade)}` : '', c.teacherName ? `معلم: ${c.teacherName}` : '', c.durationMinutes ? `${fa(c.durationMinutes)} دقیقه` : ''].filter(Boolean).map(esc).join(' · ');
  return `<div class="student-list-row" data-online-class="${esc(c.classId)}">
    <div style="flex:1;min-width:0"><b>${esc(c.title)}</b> ${c.live ? '<span class="badge green">زنده</span>' : '<span class="badge">پیش‌رو</span>'}<small>${meta}</small><small>${when}</small></div>
    <button type="button" class="btn ${c.live ? 'primary' : 'ghost'}" data-join="${esc(c.classId)}" ${c.live ? '' : 'disabled aria-disabled="true" title="این کلاس هنوز شروع نشده است"'}>${c.live ? 'ورود به کلاس' : 'هنوز شروع نشده'}</button>
  </div>`;
};

export async function mountOnlineClasses(el) {
  const box = document.createElement('section');
  box.className = 'student-panel card';
  box.style.marginTop = '16px';
  box.innerHTML = '<h2>کلاس‌های آنلاین من</h2><div class="muted small" data-body>در حال دریافت…</div>';
  el.append(box);
  const body = box.querySelector('[data-body]');
  const draw = async () => {
    try {
      const d = await api('/api/student/online-classes');
      if (!d.enabled) { box.remove(); return; } // قابلیت در این کانون فعال نیست
      const live = d.classes.filter((c) => c.live), soon = d.classes.filter((c) => !c.live);
      body.className = '';
      body.innerHTML = d.classes.length ? [...live, ...soon].map(row).join('') : empty('calendar', 'فعلاً کلاس آنلاینی برای تو تعریف نشده است');
    } catch (e) {
      body.className = 'muted small';
      body.innerHTML = `${esc(e.message || 'خطا در دریافت کلاس‌ها')} <button type="button" class="btn ghost" data-retry>تلاش دوباره</button>`;
    }
  };
  box.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-retry]')) { body.textContent = 'در حال دریافت…'; return draw(); }
    const b = ev.target.closest('[data-join]');
    if (!b || b.disabled) return;
    busy(b, async () => {
      try {
        const { url } = await post(`/api/student/online-classes/${encodeURIComponent(b.dataset.join)}/join`);
        location.assign(url); // بلیت ۹۰ ثانیه اعتبار دارد؛ همان لحظه می‌رویم
      } catch (e) { toast(e.message, 'err'); if (/شروع نشده/.test(e.message)) draw(); }
    });
  });
  await draw();
}
