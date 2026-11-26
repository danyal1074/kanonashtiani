// ظاهر شخصی مدیر و معلم: مینیمال (new) یا فانتزی (classic)، ذخیره در حساب کاربر.
// پیش‌فرض مدیر مینیمال و معلم فانتزی است؛ پوسته و CSS اضافهٔ مینیمال فقط هنگام انتخاب آن بارگذاری می‌شوند.
import { put } from './core.js';

export const lookModules = { look: null, role: null, ui: null };
const CSS = { new: '/css/admin.css', classic: '/css/manager-classic.css' };

function loadCss(href) {
  return new Promise((resolve) => {
    if (document.querySelector(`link[data-look="${href}"]`)) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.look = href;
    l.onload = resolve; l.onerror = resolve; // حتی اگر بارگذاری نشد، پنل بالا بیاید
    document.head.append(l);
  });
}

export async function applyLook(me) {
  const role = me.user.role;
  const look = me.ui_look === 'new' ? 'new' : me.ui_look === 'classic' ? 'classic' : role === 'teacher' ? 'classic' : 'new';
  document.body.classList.remove('look-new', 'look-classic');
  document.body.classList.add(`look-${look}`);
  document.body.classList.toggle('teacher-minimal', role === 'teacher' && look === 'new');
  if (lookModules.look === look && lookModules.role === role && lookModules.ui) return look;
  if (role === 'teacher') {
    if (look === 'new') {
      const [ui, icons] = await Promise.all([import('./teacher-minimal.js'), import('./outline-icons.js'), loadCss(CSS.new)]);
      (await import('./manager-icons.js')).setOutline(icons.OUTLINE);
      await loadCss('/css/teacher-minimal.css');
      lookModules.ui = ui;
    } else {
      lookModules.ui = await import('./teacher-ui.js');
    }
  } else if (look === 'new') {
    const [ui, icons] = await Promise.all([import('./manager-ui.js'), import('./outline-icons.js'), loadCss(CSS.new)]);
    (await import('./manager-icons.js')).setOutline(icons.OUTLINE);
    lookModules.ui = ui;
  } else {
    const [ui] = await Promise.all([import('./manager-ui-classic.js'), loadCss(CSS.classic)]);
    lookModules.ui = ui;
  }
  lookModules.look = look;
  lookModules.role = role;
  return look;
}

export const lookToggleHtml = (cur) => `<div class="look-toggle" role="group" aria-label="ظاهر پنل"><span>ظاهر پنل</span><button type="button" data-look-set="new" aria-pressed="${cur === 'new'}">مینیمال</button><button type="button" data-look-set="classic" aria-pressed="${cur === 'classic'}">فانتزی</button></div>`;

export async function switchLook(look) {
  await put('/api/me/look', { look });
  location.reload();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-look-set]');
  if (!b || b.getAttribute('aria-pressed') === 'true') return;
  b.disabled = true;
  switchLook(b.dataset.lookSet).catch(() => { b.disabled = false; });
});
