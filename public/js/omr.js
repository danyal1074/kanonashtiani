// پاسخ‌برگ قابل چاپ + اسکن با دوربین گوشی و تصحیح خودکار (پردازش تصویر سمت مرورگر)
import { esc, fa, $, on, modal, toast, printOverlay, icon } from './core.js';
import { classifyFills } from './omr-classify.js';

// مختصات برگه در فضای ۱۰۰۰×۱۴۱۴ (نسبت A4)
const W = 1000, H = 1414;
const MARK = 60; // ضلع نشانگر گوشه
const MARKERS = [[70, 70], [930, 70], [70, 1344], [930, 1344]]; // مرکز نشانگرها: بالا‌چپ، بالا‌راست، پایین‌چپ، پایین‌راست
const COLS = 3, PER_COL = 20, ROW_H = 48, TOP = 322, BUBBLE_R = 15;
export const MAX_Q = COLS * PER_COL;

function bubblePos(q, opt) {
  // ستون‌ها از راست به چپ؛ گزینه‌ها از راست به چپ (۱ در راست)
  const col = Math.floor(q / PER_COL), row = q % PER_COL;
  const colRight = 900 - col * 290;
  return [colRight - 70 - opt * 46, TOP + row * ROW_H];
}

export function sheetSvg({ title = '', subtitle = '', count = 20, studentName = '' } = {}) {
  const n = Math.min(MAX_Q, count);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Vazirmatn, Tahoma" direction="rtl"><rect width="${W}" height="${H}" fill="#fff"/>`;
  for (const [x, y] of MARKERS) s += `<rect x="${x - MARK / 2}" y="${y - MARK / 2}" width="${MARK}" height="${MARK}" fill="#000"/>`;
  s += `<text x="500" y="130" font-size="34" font-weight="800" text-anchor="middle">${esc(title || 'پاسخ‌برگ آزمون')}</text>
    <text x="500" y="178" font-size="22" text-anchor="middle" fill="#555">${esc(subtitle)}</text>
    <text x="900" y="245" font-size="22" text-anchor="end">نام و نام خانوادگی: ${esc(studentName) || '................................'}</text>
    <text x="100" y="245" font-size="18" text-anchor="start" fill="#777">دایره گزینه را کاملاً با خودکار مشکی پر کنید ●</text>
    <line x1="60" y1="275" x2="940" y2="275" stroke="#ccc" stroke-width="2"/>`;
  for (let q = 0; q < n; q++) {
    const [x0, y] = bubblePos(q, 0);
    s += `<text x="${x0 + 40}" y="${y + 8}" font-size="22" font-weight="700" text-anchor="middle">${fa(q + 1)}</text>`;
    for (let o = 0; o < 4; o++) {
      const [x] = bubblePos(q, o);
      s += `<circle cx="${x}" cy="${y}" r="${BUBBLE_R}" fill="none" stroke="#0B5F66" stroke-width="2.5"/><text x="${x}" y="${y + 6}" font-size="15" text-anchor="middle" fill="#a78bfa">${fa(o + 1)}</text>`;
    }
  }
  return s + '</svg>';
}

export function printSheet(opts) {
  printOverlay(`<div class="omr-sheet">${sheetSvg(opts)}</div>`, ' پاسخ‌برگ قابل اسکن');
}

// ---------- پردازش تصویر ----------
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('بارگذاری تصویر ممکن نشد')); im.src = src; });
}
function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; th = i; }
  }
  return th;
}
// حل دستگاه ۸×۸ برای ماتریس هموگرافی (برگه → تصویر)
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return (x, y) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
}

export async function scanImage(src, count) {
  const im = await loadImage(src);
  const scale = Math.min(1, 1400 / Math.max(im.width, im.height));
  const w = Math.round(im.width * scale), h = Math.round(im.height * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0;
  const th = Math.min(otsu(gray), 140);
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = gray[i] < th ? 1 : 0;

  // یافتن لکه‌های تیره مربعی و توپر (نشانگرها) با برچسب‌گذاری مؤلفه‌های همبند
  const label = new Int32Array(w * h);
  const blobs = [];
  const stack = [];
  let id = 0;
  for (let i = 0; i < w * h; i++) {
    if (!dark[i] || label[i]) continue;
    id++;
    let n = 0, minx = w, miny = h, maxx = 0, maxy = 0, sx = 0, sy = 0;
    stack.push(i); label[i] = id;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      n++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || label[q] || !dark[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        label[q] = id; stack.push(q);
      }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (n < (w * h) / 6000) continue;
    const ratio = bw / bh, fill = n / (bw * bh);
    if (ratio > 0.6 && ratio < 1.6 && fill > 0.82) blobs.push({ n, cx: sx / n, cy: sy / n });
  }
  if (blobs.length < 4) throw new Error('چهار نشانگر گوشه پاسخ‌برگ پیدا نشد؛ برگه را کامل و با نور کافی در کادر قرار دهید');
  const maxN = Math.max(...blobs.map((b) => b.n));
  const big = blobs.filter((b) => b.n > maxN * 0.35);
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => big.reduce((best, b) => (Math.hypot(b.cx - x, b.cy - y) < Math.hypot(best.cx - x, best.cy - y) ? b : best)));
  if (new Set(corners).size < 4) throw new Error('نشانگرهای گوشه به‌درستی تشخیص داده نشد؛ دوباره عکس بگیرید');
  const map = homography(MARKERS, corners.map((b) => [b.cx, b.cy]));

  // سنجش میزان پر بودن هر حباب
  const n = Math.min(count, MAX_Q);
  const answers = [], fills = [], status = [], confidence = [];
  for (let q = 0; q < n; q++) {
    const f = [];
    for (let o = 0; o < 4; o++) {
      const [bx, by] = bubblePos(q, o);
      let tot = 0, dk = 0;
      for (let dy = -BUBBLE_R * 0.55; dy <= BUBBLE_R * 0.55; dy += 2) for (let dx = -BUBBLE_R * 0.55; dx <= BUBBLE_R * 0.55; dx += 2) {
        if (dx * dx + dy * dy > (BUBBLE_R * 0.55) ** 2) continue;
        const [ix, iy] = map(bx + dx, by + dy);
        const xi = Math.round(ix), yi = Math.round(iy);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
        tot++; dk += dark[yi * w + xi];
      }
      f.push(tot ? dk / tot : 0);
    }
    const c = classifyFills(f);
    answers.push(c.answer); status.push(c.status); confidence.push(c.confidence);
    fills.push(f);
  }
  // پیش‌نمایش با هم‌پوشانی نتیجه
  ctx.lineWidth = 3;
  for (const b of corners) { ctx.strokeStyle = '#22A867'; ctx.strokeRect(b.cx - 14, b.cy - 14, 28, 28); }
  for (let q = 0; q < n; q++) for (let o = 0; o < 4; o++) {
    const [bx, by] = bubblePos(q, o);
    const [ix, iy] = map(bx, by);
    ctx.beginPath(); ctx.arc(ix, iy, 8 * (w / 1000) + 3, 0, Math.PI * 2);
    ctx.strokeStyle = status[q] === 'multi' || status[q] === 'weak' ? '#E8590C' : answers[q] === o ? '#22A867' : '#a78bfa55';
    ctx.stroke();
  }
  return { answers, fills, status, confidence, preview: cv.toDataURL('image/jpeg', 0.75) };
}

// برگه پرشده آزمایشی برای نمایش (بدون دوربین)
export async function demoFilledSheet(count, answers) {
  const svg = sheetSvg({ title: 'پاسخ‌برگ نمونه', count });
  const im = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const cv = document.createElement('canvas'); cv.width = 1100; cv.height = 1500;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#9ca3af'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.save(); ctx.translate(60, 40); ctx.rotate(0.03); ctx.drawImage(im, 0, 0, 960, 960 * H / W);
  ctx.fillStyle = '#111';
  const sc = 960 / W;
  answers.forEach((a, q) => { if (a == null) return; const [x, y] = bubblePos(q, a); ctx.beginPath(); ctx.arc(x * sc, y * sc, BUBBLE_R * sc * 0.95, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
  return cv.toDataURL('image/jpeg', 0.9);
}

// ---------- رابط اسکن ----------
// گزینه‌ها: exam (questions با answer)، students، onSave(studentId, answers, omr)
// omr = { blank, multi, weak, corrected } (اندیس سؤال‌ها) برای ثبت در لاگ ممیزی سرور
const STATUS_FA = { blank: 'سفید', multi: 'چند علامت', weak: 'کم‌رنگ' };
export function openScanner({ exam, students, onSave, preselect }) {
  const n = exam.questions.length;
  const key = exam.questions.map((q) => q.answer);
  let answers, status, corrected, demo, scanned;
  const reset = () => { answers = Array(n).fill(null); status = Array(n).fill(null); corrected = new Set(); demo = false; scanned = false; };
  reset();
  const saved = new Set(students.filter((s) => s.done).map((s) => s.id));
  const score = () => answers.filter((a, i) => a != null && a === key[i]).length;
  const pending = () => status.reduce((list, st, q) => (st && st !== 'blank' && st !== 'ok' && !corrected.has(q) ? [...list, q] : list), []);
  const label = (s) => `${esc(s.full_name)}${s.class_name ? ` (کلاس ${esc(s.class_name)})` : ''}${saved.has(s.id) ? ' — ثبت‌شده' : ''}`;
  return modal({
    title: 'اسکن پاسخ‌برگ و تصحیح خودکار', wide: true,
    body: `<div class="grid c2"><div class="stack">
      <div class="field"><label for="omrStudent">داوطلب</label><select class="input" id="omrStudent">${students.map((s) => `<option value="${s.id}" ${s.id === preselect ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></div>
      <label class="btn block">${icon('camera', { size: 16 })} گرفتن عکس با دوربین گوشی<input type="file" accept="image/*" capture="environment" id="omrFile" hidden></label>
      <div class="row"><button type="button" class="btn soft sm grow" id="omrDemo">${icon('file-check', { size: 16 })} آزمایش اسکنر با برگهٔ نمونه</button><button type="button" class="btn ghost sm grow" id="omrPrint">${icon('printer', { size: 16 })} چاپ پاسخ‌برگ خام</button></div>
      <div class="omr-preview" id="omrPrev"><div class="empty" style="color:#bbb">${icon('receipt', { size: 16 })} عکس پاسخ‌برگ اینجا نمایش داده می‌شود</div></div></div>
      <div class="stack"><div class="row between"><b>پاسخ‌های تشخیص‌داده‌شده</b><span class="badge" id="omrScore"></span></div>
      <div class="tiny muted">ردیف‌های نارنجی (چند علامت یا کم‌رنگ) باید بازبینی شوند: گزینهٔ درست را لمس کنید یا با «تأیید سفید» آن را بی‌پاسخ بگذارید. حلقهٔ سبز کلید آزمون است.</div>
      <div id="omrWarn" role="status"></div><div class="omr-ans" id="omrAns"></div></div></div>`,
    actions: [{ label: 'بستن', cls: 'ghost', value: null }, {
      label: 'ثبت نمره', cls: 'green', onClick: async (m) => {
        if (demo) { toast('برگهٔ نمونه فقط برای آزمایش اسکنر است و نمره‌ای از آن ثبت نمی‌شود', 'err'); return false; }
        const left = pending();
        if (left.length) { toast(`${fa(left.length)} سؤال نیاز به بازبینی دارد (سؤال ${left.slice(0, 5).map((q) => fa(q + 1)).join('، ')})`, 'err'); return false; }
        const sid = Number($('#omrStudent', m).value);
        const pick = (st) => status.map((x, q) => (x === st ? q : -1)).filter((q) => q >= 0);
        const omr = scanned ? { blank: pick('blank'), multi: pick('multi'), weak: pick('weak'), corrected: [...corrected] } : { corrected: [...corrected] };
        const r = await onSave(sid, answers, omr);
        toast(`نمره ثبت شد: ${fa(r.percent)}٪ — رتبه ${fa(r.rank)} از ${fa(r.of)}`, 'ok');
        saved.add(sid);
        const sel = $('#omrStudent', m), opt = sel.querySelector(`option[value="${sid}"]`);
        if (opt) opt.textContent = opt.textContent.replace(/ — ثبت‌شده$/, '') + ' — ثبت‌شده';
        let next = opt?.nextElementSibling;
        while (next && saved.has(Number(next.value))) next = next.nextElementSibling;
        if (next) sel.value = next.value;
        reset(); drawAns(m);
        $('#omrPrev', m).innerHTML = '<div class="empty" style="color:#bbb">ثبت شد؛ پاسخ‌برگ بعدی را اسکن کنید</div>';
        return false;
      },
    }],
    onOpen: (m) => {
      drawAns(m);
      const run = async (src, isDemo = false) => {
        $('#omrPrev', m).innerHTML = '<div class="empty" style="color:#999">در حال پردازش تصویر…</div>';
        try {
          const r = await scanImage(src, n);
          reset(); answers = r.answers; status = r.status; demo = isDemo; scanned = true;
          $('#omrPrev', m).innerHTML = `<img src="${r.preview}" alt="پیش‌نمایش اسکن" style="width:100%;display:block">`;
          drawAns(m);
          const review = pending().length;
          toast(`اسکن انجام شد: ${fa(answers.filter((a) => a != null).length)} پاسخ${review ? ` — ${fa(review)} مورد نیاز به بازبینی` : ''}`, review ? '' : 'ok');
        } catch (e) {
          $('#omrPrev', m).innerHTML = `<div class="empty" style="color:#c2410c">${icon('alert', { size: 16 })} ${esc(e.message)}</div>`;
        }
      };
      $('#omrFile', m).onchange = (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 15 * 1024 * 1024) { toast('حجم تصویر بیش از ۱۵ مگابایت است', 'err'); return; } const rd = new FileReader(); rd.onload = () => run(rd.result); rd.readAsDataURL(f); e.target.value = ''; };
      $('#omrDemo', m).onclick = async () => run(await demoFilledSheet(n, key.map((k) => (Math.random() < 0.75 ? k : Math.random() < 0.5 ? (k + 1) % 4 : null))), true);
      $('#omrPrint', m).onclick = () => printSheet({ title: exam.title, subtitle: `${fa(n)} سؤال`, count: n });
      on(m, 'click', '[data-a]', (e, b) => {
        const [q, o] = b.dataset.a.split(',').map(Number);
        answers[q] = answers[q] === o ? null : o;
        corrected.add(q);
        drawAns(m);
      });
      on(m, 'click', '[data-blank]', (e, b) => { const q = Number(b.dataset.blank); answers[q] = null; corrected.add(q); drawAns(m); });
    },
  });
  function drawAns(m) {
    $('#omrAns', m).innerHTML = answers.map((a, q) => {
      const flag = status[q] && status[q] !== 'ok' && status[q] !== 'blank' && !corrected.has(q);
      return `<div class="ans-row" ${flag ? 'style="background:#fff4e6;border-radius:8px"' : ''}><span class="qn">${fa(q + 1)}</span>${[0, 1, 2, 3].map((o) => `<button type="button" class="${a === o ? 'on' : ''} ${key[q] === o ? 'key' : ''}" data-a="${q},${o}" aria-pressed="${a === o}" aria-label="سؤال ${fa(q + 1)} گزینه ${fa(o + 1)}">${fa(o + 1)}</button>`).join('')}${flag ? `<span class="tiny" style="color:#c2410c">${STATUS_FA[status[q]]}</span> <button type="button" class="btn ghost sm" data-blank="${q}">تأیید سفید</button>` : corrected.has(q) ? '<span class="tiny muted">اصلاح دستی</span>' : ''}</div>`;
    }).join('');
    const left = pending().length;
    $('#omrWarn', m).innerHTML = demo ? '<div class="badge orange">برگهٔ نمونه — قابل ثبت نیست</div>' : left ? `<div class="badge orange">${fa(left)} سؤال نیاز به بازبینی</div>` : '';
    $('#omrScore', m).textContent = `${fa(score())} از ${fa(n)} درست (${fa(Math.round((score() / n) * 100))}٪)`;
  }
}
