// نصب وب‌اپ «رشد نخبه»: دیالوگ مرورگر در کرومیوم، و راهنمای کوتاه در بقیه.
import { esc, modal, toast } from './core.js';

let deferred = null;
let announced = false;

export function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

function markInstalled() {
  if (isInstalledApp()) document.documentElement.classList.add('pwa-standalone');
}

function installHelp() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const lines = [];
  if (/Instagram|FBAN|FBAV|Line\//i.test(ua)) {
    lines.push('این صفحه داخل برنامهٔ دیگری باز شده. آن را در Safari یا Chrome باز کنید و دوباره «نصب در موبایل» را بزنید.');
  }
  if (ios) {
    if (/CriOS/i.test(ua)) lines.push('در Chrome دکمهٔ اشتراک‌گذاری را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید.');
    else if (/FxiOS/i.test(ua)) lines.push('در Firefox منو را باز کنید، اشتراک‌گذاری را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید.');
    else if (/EdgiOS/i.test(ua)) lines.push('در Edge دکمهٔ اشتراک‌گذاری را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید.');
    else lines.push('در Safari دکمهٔ اشتراک‌گذاری را بزنید (مربع با پیکان رو به بالا) و سپس «افزودن به صفحهٔ اصلی» را انتخاب کنید.');
  } else if (/Firefox/i.test(ua)) {
    lines.push('در Firefox منوی مرورگر را باز کنید و «نصب» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید.');
  } else if (/SamsungBrowser/i.test(ua)) {
    lines.push('در Samsung Internet منوی مرورگر را باز کنید و «افزودن صفحه به صفحهٔ اصلی» را بزنید.');
  } else {
    lines.push('از منوی مرورگر گزینهٔ «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید.');
  }
  lines.push('اگر برنامه را قبلاً نصب کرده‌اید، آیکون «رشد نخبه» را از صفحهٔ اصلی باز کنید.');
  return lines;
}

function announceInstalled() {
  if (announced) return;
  announced = true;
  toast('«رشد نخبه» نصب شد. آیکون را از صفحهٔ اصلی باز کنید.', 'ok');
}

async function onInstallClick(event) {
  const button = event.target.closest?.('[data-pwa-install]');
  if (!button || button.hidden || isInstalledApp()) return;
  event.preventDefault();
  document.querySelector('.scrim')?.click();
  if (deferred) {
    deferred.prompt();
    try {
      const choice = await deferred.userChoice;
      deferred = null;
      if (choice?.outcome === 'accepted') announceInstalled();
    } catch { /* کاربر پنجره را بست */ }
    return;
  }
  await modal({
    title: 'نصب در موبایل',
    body: installHelp().map((line) => `<p style="margin:0 0 10px;line-height:1.9">${esc(line)}</p>`).join('')
      + '<p class="tiny muted" style="margin:0;line-height:1.8">بعد از نصب، پنل بدون نوار آدرس مرورگر و مثل یک برنامه باز می‌شود.</p>',
    actions: [{ label: 'متوجه شدم', value: true }],
  });
}

export function startPwa() {
  if (startPwa.started) return;
  startPwa.started = true;
  markInstalled();
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    announceInstalled();
  });
  for (const query of ['(display-mode: standalone)', '(display-mode: fullscreen)']) {
    window.matchMedia(query).addEventListener('change', markInstalled);
  }
  document.addEventListener('click', onInstallClick);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }
}
