// رندر سبک و امن فرمول‌های ریاضی LaTeX ($...$ و $$...$$) بدون نیاز به کتابخانه خارجی
import { esc } from './core.js';

function texToHtml(tex) {
  let s = esc(String(tex || '').trim());
  s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="qb-frac"><span class="qb-num">$1</span><span class="qb-den">$2</span></span>');
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, '<span class="qb-sqrt">√<span class="qb-rad">$1</span></span>');
  s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>').replace(/\^([0-9a-zA-Z+-])/g, '<sup>$1</sup>');
  s = s.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>').replace(/_([0-9a-zA-Z])/g, '<sub>$1</sub>');
  const map = {
    '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±',
    '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
    '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\theta': 'θ',
    '\\degree': '°', '\\infty': '∞', '\\rightarrow': '→', '\\leftarrow': '←',
    '\\angle': '∠', '\\triangle': '△', '\\perp': '⊥', '\\parallel': '∥',
    '\\%': '%',
  };
  for (const [k, v] of Object.entries(map)) s = s.replaceAll(k, v);
  return s;
}

export function renderMathHtml(raw) {
  const txt = String(raw ?? '');
  if (!txt.includes('$')) return esc(txt).replace(/\n/g, '<br>');
  // جداسازی $$...$$ و $...$
  const parts = [];
  let i = 0;
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let m;
  while ((m = re.exec(txt))) {
    if (m.index > i) parts.push(esc(txt.slice(i, m.index)).replace(/\n/g, '<br>'));
    if (m[1] != null) parts.push(`<div class="qb-math-block" dir="ltr">${texToHtml(m[1])}</div>`);
    else parts.push(`<span class="qb-math" dir="ltr">${texToHtml(m[2])}</span>`);
    i = m.index + m[0].length;
  }
  if (i < txt.length) parts.push(esc(txt.slice(i)).replace(/\n/g, '<br>'));
  return parts.join('');
}
