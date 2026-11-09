// نمودارهای اختصاصی پنل مدیر (SVG خالص، بدون کتابخانه): راست‌به‌چپ، تولتیپ لمسی/ماوس، انیمیشن نرم، حالت خالی و دسترس‌پذیری.
// هر تابع یک المان می‌گیرد و داخلش رسم می‌کند؛ با تغییر اندازه دوباره رسم می‌شود.
import { fa, esc } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
export const palette = PAL;

// عدد کوتاه برای محور: میلیون/میلیارد تومان
export const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${fa((v / 1e9).toFixed(1).replace(/\.0$/, ''))} میلیارد`;
  if (a >= 1e6) return `${fa(Math.round(v / 1e6))} م`;
  if (a >= 1e3) return `${fa(Math.round(v / 1e3))} هزار`;
  return fa(Math.round(v));
};
const nice = (max) => { // سقف زیبای محور
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max)), f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.append(n); return n; };

// تولتیپ مشترک
let tip;
function tooltip() {
  if (tip?.isConnected) return tip;
  tip = document.createElement('div');
  tip.className = 'ch-tip'; tip.setAttribute('role', 'status'); tip.hidden = true;
  document.body.append(tip);
  return tip;
}
function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`;
  t.style.top = `${Math.max(8, y - h - 12)}px`;
}
const hideTip = () => { if (tip) tip.hidden = true; };
document.addEventListener('scroll', hideTip, { passive: true, capture: true });

function mount(host, draw, { empty, emptyText = 'داده‌ای برای نمایش نیست', height = 240, label = '' } = {}) {
  host.classList.add('ch');
  host.replaceChildren();
  if (empty) { host.innerHTML = `<div class="ch-empty">${emptyText}</div>`; return; }
  const run = () => {
    const w = Math.max(240, Math.round(host.clientWidth || 320));
    host.querySelector('svg')?.remove();
    const svg = el('svg', { viewBox: `0 0 ${w} ${height}`, width: '100%', height, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.direction = 'ltr';
    host.prepend(svg);
    draw(svg, w, height);
  };
  run();
  if (host.__ro) host.__ro.disconnect();
  let last = host.clientWidth, timer;
  host.__ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => { if (Math.abs(host.clientWidth - last) > 4) { last = host.clientWidth; run(); } }, 120); });
  host.__ro.observe(host);
}

function legend(host, items) {
  const lg = document.createElement('div');
  lg.className = 'ch-legend';
  lg.innerHTML = items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.name)}</span>`).join('');
  host.append(lg);
}

// محورهای مشترک: خطوط افقی ظریف، برچسب عمودی سمت راست (آغاز خط در فارسی)، برچسب افقی از راست به چپ (قدیم → جدید)
function axes(svg, w, h, { labels, max, min = 0, fmt = compact, ticks = 4, padL = 8, padR = 46, padT = 12, padB = 30 }) {
  const iw = w - padL - padR, ih = h - padT - padB, n = labels.length;
  for (let i = 0; i <= ticks; i++) {
    const y = padT + ih - (ih * i) / ticks;
    el('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: 'ch-grid' }, svg);
    const t = el('text', { x: w - padR + 8, y: y + 4, class: 'ch-tick' }, svg); t.textContent = fmt(min + ((max - min) * i) / ticks);
  }
  const step = iw / n, x = (i) => padL + iw - step * (i + 0.5); // قدیمی‌ترین در راست
  const every = n > 8 ? Math.ceil(n / 7) : 1;
  labels.forEach((l, i) => { if (i % every) return; const t = el('text', { x: x(i), y: h - 8, class: 'ch-xl', 'text-anchor': 'middle' }, svg); t.textContent = l; });
  return { x, step, iw, ih, padL, padR, padT, padB, y: (v) => padT + ih - (ih * (Math.max(v, min) - min)) / (max - min) };
}

// ترکیب ستونی + خطی (مثلاً درآمد/هزینه و مانده)
export function comboChart(host, { labels, bars = [], line = null, fmt = compact, tipFmt = fmt, height = 260, label = '', emptyText }) {
  const all = [...bars.flatMap((b) => b.values), ...(line ? line.values : [])];
  mount(host, (svg, w, h) => {
    const max = nice(Math.max(...all, 1)), min = Math.min(0, ...(line ? line.values : [0]));
    const ax = axes(svg, w, h, { labels, max, fmt });
    const groupW = Math.min(46, ax.step * 0.72), bw = groupW / bars.length;
    const hit = [];
    labels.forEach((_, i) => {
      bars.forEach((b, j) => {
        const v = b.values[i] || 0, bh = Math.max(v ? 2 : 0, (ax.ih * v) / max);
        const r = el('rect', { x: ax.x(i) - groupW / 2 + j * bw + 1, y: ax.padT + ax.ih - bh, width: Math.max(2, bw - 2), height: bh, rx: Math.min(4, bw / 3), class: 'ch-bar', style: `fill:${b.color};animation-delay:${i * 40 + j * 20}ms` }, svg);
        r.style.transformOrigin = `0 ${ax.padT + ax.ih}px`;
      });
      hit.push(el('rect', { x: ax.x(i) - ax.step / 2, y: ax.padT, width: ax.step, height: ax.ih, class: 'ch-hit' }, svg));
    });
    if (line) {
      const pts = line.values.map((v, i) => [ax.x(i), ax.padT + ax.ih - (ax.ih * Math.max(v, 0)) / max]);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      const p = el('path', { d, class: 'ch-line', style: `stroke:${line.color}` }, svg);
      const len = p.getTotalLength?.() || 600; p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      pts.forEach((q) => el('circle', { cx: q[0], cy: q[1], r: 3.2, class: 'ch-dot', style: `stroke:${line.color}` }, svg));
    }
    const move = (e, i) => {
      const rows = [...bars.map((b) => `<div><i style="background:${b.color}"></i>${esc(b.name)}<b>${tipFmt(b.values[i] || 0)}</b></div>`), ...(line ? [`<div><i style="background:${line.color}"></i>${esc(line.name)}<b>${tipFmt(line.values[i] || 0)}</b></div>`] : [])].join('');
      showTip(`<strong>${esc(labels[i])}</strong>${rows}`, e.clientX, e.clientY);
    };
    hit.forEach((r, i) => { r.addEventListener('pointermove', (e) => move(e, i)); r.addEventListener('pointerdown', (e) => move(e, i)); r.addEventListener('pointerleave', hideTip); });
  }, { empty: !all.some(Boolean), height, label, emptyText });
  if (all.some(Boolean)) legend(host, [...bars.map((b) => ({ name: b.name, color: b.color })), ...(line ? [{ name: line.name, color: line.color }] : [])]);
}

// ستونی انباشته (پرداخت‌شده/در انتظار/پرداخت‌نشده به‌تفکیک پایه)
export function stackedBars(host, { labels, series, fmt = (v) => fa(Math.round(v)), height = 250, label = '', emptyText }) {
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  mount(host, (svg, w, h) => {
    const max = nice(Math.max(...totals, 1));
    const ax = axes(svg, w, h, { labels, max, fmt: (v) => fa(Math.round(v)), ticks: 4 });
    const bw = Math.min(40, ax.step * 0.62), hit = [];
    labels.forEach((_, i) => {
      let acc = 0;
      series.forEach((s) => {
        const v = s.values[i] || 0; if (!v) return;
        const bh = (ax.ih * v) / max, y = ax.padT + ax.ih - ((acc + v) * ax.ih) / max;
        el('rect', { x: ax.x(i) - bw / 2, y, width: bw, height: Math.max(1, bh - 1), rx: 3, class: 'ch-bar', style: `fill:${s.color};animation-delay:${i * 35}ms` }, svg).style.transformOrigin = `0 ${ax.padT + ax.ih}px`;
        acc += v;
      });
      hit.push(el('rect', { x: ax.x(i) - ax.step / 2, y: ax.padT, width: ax.step, height: ax.ih, class: 'ch-hit' }, svg));
    });
    hit.forEach((r, i) => {
      const f = (e) => showTip(`<strong>${esc(labels[i])}</strong>${series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}<b>${fmt(s.values[i] || 0)}</b></div>`).join('')}<div class="sum">جمع<b>${fmt(totals[i])}</b></div>`, e.clientX, e.clientY);
      r.addEventListener('pointermove', f); r.addEventListener('pointerdown', f); r.addEventListener('pointerleave', hideTip);
    });
  }, { empty: !totals.some(Boolean), height, label, emptyText });
  if (totals.some(Boolean)) legend(host, series.map((s) => ({ name: s.name, color: s.color })));
}

// خطی (با ناحیهٔ ملایم): روند حضور، رشد، میانگین نمره
export function lineChart(host, { labels, series, fmt = (v) => fa(Math.round(v * 10) / 10), max = null, min = 0, ticks = 4, height = 230, label = '', emptyText, area = true }) {
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  mount(host, (svg, w, h) => {
    const top = max ?? nice(Math.max(...all, 1));
    const ax = axes(svg, w, h, { labels, max: top, min, fmt: (v) => fa(Math.round(v)), ticks });
    const hit = [];
    series.forEach((s) => {
      const pts = s.values.map((v, i) => (v == null ? null : [ax.x(i), ax.y(v)]));
      const seg = pts.filter(Boolean); if (!seg.length) return;
      const d = seg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      if (area && seg.length > 1) el('path', { d: `${d}L${seg[seg.length - 1][0]} ${ax.padT + ax.ih}L${seg[0][0]} ${ax.padT + ax.ih}Z`, class: 'ch-area', style: `fill:${s.color}` }, svg);
      const p = el('path', { d, class: 'ch-line', style: `stroke:${s.color}` }, svg);
      const len = p.getTotalLength?.() || 600; p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      seg.forEach((q) => el('circle', { cx: q[0], cy: q[1], r: 3.2, class: 'ch-dot', style: `stroke:${s.color}` }, svg));
    });
    labels.forEach((_, i) => hit.push(el('rect', { x: ax.x(i) - ax.step / 2, y: ax.padT, width: ax.step, height: ax.ih, class: 'ch-hit' }, svg)));
    hit.forEach((r, i) => {
      const f = (e) => showTip(`<strong>${esc(labels[i])}</strong>${series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}<b>${s.values[i] == null ? '—' : fmt(s.values[i])}</b></div>`).join('')}`, e.clientX, e.clientY);
      r.addEventListener('pointermove', f); r.addEventListener('pointerdown', f); r.addEventListener('pointerleave', hideTip);
    });
  }, { empty: !all.length, height, label, emptyText });
  if (all.length && series.length > 1) legend(host, series.map((s) => ({ name: s.name, color: s.color })));
}

// حلقه (نسبت): وصول، حضور
export function donut(host, { segments, center, size = 168, label = '', emptyText }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  host.classList.add('ch', 'ch-donut'); host.replaceChildren();
  if (!total) { host.innerHTML = `<div class="ch-empty">${emptyText || 'داده‌ای برای نمایش نیست'}</div>`; return; }
  const svg = el('svg', { viewBox: '0 0 100 100', width: size, height: size, role: 'img', 'aria-label': label });
  const R = 40, C = 2 * Math.PI * R; let off = 0;
  el('circle', { cx: 50, cy: 50, r: R, class: 'ch-ring-bg' }, svg);
  segments.forEach((s) => {
    if (!s.value) return;
    const len = (s.value / total) * C;
    const c = el('circle', { cx: 50, cy: 50, r: R, class: 'ch-ring', style: `stroke:${s.color};stroke-dasharray:${Math.max(0, len - 1.5)} ${C};stroke-dashoffset:${-off};` }, svg);
    c.setAttribute('transform', 'rotate(-90 50 50)');
    const f = (e) => showTip(`<strong>${esc(s.name)}</strong><div>${fa(s.value)} (${fa(Math.round((s.value / total) * 100))}٪)</div>`, e.clientX, e.clientY);
    c.addEventListener('pointermove', f); c.addEventListener('pointerdown', f); c.addEventListener('pointerleave', hideTip);
    off += len;
  });
  const wrap = document.createElement('div'); wrap.className = 'ch-ring-wrap'; wrap.append(svg);
  if (center) wrap.insertAdjacentHTML('beforeend', `<div class="ch-center"><b>${center.value}</b><small>${esc(center.label)}</small></div>`);
  host.append(wrap);
  legend(host, segments.map((s) => ({ name: `${s.name} (${fa(s.value)})`, color: s.color })));
}

// نوار افقی ساده برای مقایسه (کلاس‌ها، پایه‌ها)
export function hbars(host, { rows, max = 100, fmt = (v) => `${fa(Math.round(v))}٪`, emptyText, color = 'var(--c1)' }) {
  host.classList.add('ch', 'ch-hbars'); host.replaceChildren();
  if (!rows.length) { host.innerHTML = `<div class="ch-empty">${emptyText || 'داده‌ای برای نمایش نیست'}</div>`; return; }
  host.innerHTML = rows.map((r, i) => `<div class="hb"><span class="hl">${esc(r.label)}</span><span class="ht"><i style="width:${Math.max(2, Math.min(100, (r.value / max) * 100))}%;background:${r.color || color};animation-delay:${i * 40}ms"></i></span><b class="hv">${fmt(r.value)}</b></div>`).join('');
}

// نمودار کوچک (اسپارک‌لاین) برای کارت‌های شاخص
export function spark(values, { color = 'var(--c1)', w = 84, h = 28 } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 2 || Math.max(...v) === Math.min(...v)) return '';
  const mx = Math.max(...v), mn = Math.min(...v), st = (w - 4) / (v.length - 1);
  const pts = v.map((x, i) => `${(w - 2 - i * st).toFixed(1)},${(h - 3 - ((x - mn) / (mx - mn)) * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" style="stroke:${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
