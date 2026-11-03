// بازی درسی «ذهن سریع» و داستان تعاملی «راز رصدخانه»
import { post, esc, fa, $, on, setHead, confetti, beep, state, toast, icon, sgn } from './core.js';

export function gamesHub(el) {
  setHead('بازی و داستان', 'یادگیری با بازی؛ هر روز با بازی امتیاز فعالیت بگیر');
  el.innerHTML = `<div class="grid c2">
    <div class="feature-tile ft-game" style="min-height:220px" onclick="location.hash='#/games/math'"><span class="fi">${icon('zap', { size: 56 })}</span><h3 style="font-size:22px">مسابقه «ذهن سریع»</h3><p>۶۰ ثانیه وقت داری تا بیشترین محاسبه ذهنی را درست جواب بدهی. پاسخ‌های پشت‌سرهم ضریب امتیاز دارد! (روزانه با ۵۰ امتیاز: ۳+ امتیاز فعالیت)</p></div>
    <div class="feature-tile ft-story" style="min-height:220px" onclick="location.hash='#/games/story'"><span class="fi">${icon('compass', { size: 56 })}</span><h3 style="font-size:22px">داستان تعاملی «راز رصدخانه»</h3><p>با انتخاب‌هایت داستان را پیش ببر و با حل معماهای علمی، رصدخانه را نجات بده. (پایان داستان: ۵+ امتیاز)</p></div>
  </div>`;
}

// ================= ذهن سریع =================
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function makeQ(grade, level) {
  const hard = grade >= 7, mid = grade >= 6;
  const kinds = ['+', '-', '×'];
  if (mid) kinds.push('÷');
  if (hard) kinds.push('±', '²');
  const k = kinds[ri(0, kinds.length - 1)];
  const L = 1 + Math.min(level, 6) * 0.25;
  let a, b, ans, text;
  if (k === '+') { a = ri(5, Math.round(40 * L)); b = ri(5, Math.round(40 * L)); ans = a + b; text = `${a} + ${b}`; }
  else if (k === '-') { a = ri(20, Math.round(80 * L)); b = ri(1, a); ans = a - b; text = `${a} − ${b}`; }
  else if (k === '×') { a = ri(2, Math.round(9 * L)); b = ri(2, mid ? 12 : 9); ans = a * b; text = `${a} × ${b}`; }
  else if (k === '÷') { b = ri(2, 12); ans = ri(2, Math.round(10 * L)); a = b * ans; text = `${a} ÷ ${b}`; }
  else if (k === '±') { a = ri(-20, 20); b = ri(-20, 20); ans = a + b; text = `(${a}) + (${b})`; }
  else { a = ri(2, 15); ans = a * a; text = `${a}²`; }
  const opts = new Set([ans]);
  while (opts.size < 4) opts.add(ans + (Math.random() < 0.5 ? -1 : 1) * ri(1, Math.max(3, Math.round(Math.abs(ans) * 0.15) + 2)));
  return { text: fa(text).replace(/-(\d|[۰-۹])/g, '−$1'), ans, opts: [...opts].sort(() => Math.random() - 0.5) };
}

export function mathRush(el) {
  setHead('مسابقه ذهن سریع', 'سریع فکر کن، درست جواب بده!', '<a class="btn ghost sm" href="#/games">→ بازی‌ها</a>');
  const grade = state.me.student?.grade || 6;
  let best = 0;
  try { best = Number(localStorage.getItem('roshd-rush-best') || 0); } catch { /* */ }
  const start = () => {
    let score = 0, combo = 0, correct = 0, wrong = 0, level = 0, left = 60, locked = false, q;
    el.innerHTML = `<div class="game-stage" id="stage"><div class="game-hud"><span class="glass"> <b id="gT">${fa(60)}</b></span><span class="glass">${icon('star', { size: 16 })} <b id="gS">۰</b></span><span class="glass">${icon('check-circle', { size: 16 })} <b id="gC">۰</b></span></div>
      <div class="combo" id="gCombo"></div><div class="game-q" id="gQ"></div><div class="game-opts" id="gO"></div></div>`;
    const next = () => {
      q = makeQ(grade, level);
      $('#gQ', el).textContent = `${q.text} = ؟`;
      $('#gO', el).innerHTML = q.opts.map((o) => `<button class="game-opt" data-v="${o}">${fa(o).replace('-', '−')}</button>`).join('');
      locked = false;
    };
    next();
    on($('#gO', el), 'click', '.game-opt', (e, b) => {
      if (locked) return;
      locked = true;
      if (Number(b.dataset.v) === q.ans) {
        combo++; correct++; level = Math.floor(correct / 4);
        const gain = 10 * Math.min(4, 1 + Math.floor(combo / 3));
        score += gain;
        b.classList.add('right');
        $('#gCombo', el).innerHTML = combo >= 3 ? `${icon('flame', { size: 16 })} ${fa(combo)} پشت‌سرهم! ×${fa(Math.min(4, 1 + Math.floor(combo / 3)))}` : '';
      } else {
        combo = 0; wrong++;
        b.classList.add('wrong');
        el.querySelector(`[data-v="${q.ans}"]`)?.classList.add('right');
        $('#gCombo', el).textContent = '';
      }
      $('#gS', el).textContent = fa(score); $('#gC', el).textContent = fa(correct);
      setTimeout(next, 350);
    });
    const t = setInterval(async () => {
      if (!document.body.contains(el) || !$('#gT', el)) return clearInterval(t);
      left--;
      $('#gT', el).textContent = fa(left);
      if (left > 0) return;
      clearInterval(t);
      beep(3);
      const newBest = score > best;
      if (newBest) { best = score; try { localStorage.setItem('roshd-rush-best', String(best)); } catch { /* */ } confetti(90); }
      let reward = 0;
      try { reward = (await post('/api/student/game', { game: 'math-rush', score })).reward; } catch (err) { toast(err.message, 'err'); }
      const stars = score >= 200 ? 3 : score >= 100 ? 2 : score >= 50 ? 1 : 0;
      $('#stage', el).innerHTML = `<div class="row" style="gap:6px;color:var(--sun-400)" aria-label="${fa(stars)} ستاره">${[0, 1, 2].map((i) => `<span style="opacity:${i < stars ? 1 : .25}">${icon('star', { size: 40 })}</span>`).join('')}</div><h2 style="font-size:28px;font-weight:900">${fa(score)} امتیاز!</h2>
        <div class="game-hud"><span class="glass">${icon('check-circle', { size: 16 })} درست: ${fa(correct)}</span><span class="glass">${icon('x', { size: 16 })} غلط: ${fa(wrong)}</span><span class="glass">${icon('trophy', { size: 16 })} رکورد: ${fa(best)}</span></div>
        ${newBest ? '<div class="combo">رکورد جدید زدی</div>' : ''}${reward ? `<div class="glass" style="padding:8px 16px;border-radius:14px">${icon('star', { size: 16 })} ${sgn(reward)} امتیاز فعالیت به پروفایلت اضافه شد</div>` : score < 50 ? '<div class="small" style="opacity:.85">با ۵۰ امتیاز، جایزه روزانه فعالیت می‌گیری!</div>' : ''}
        <button class="btn lg orange" id="again">${icon('refresh', { size: 16 })} دوباره بازی کن</button>`;
      $('#again', el).onclick = start;
    }, 1000);
  };
  el.innerHTML = `<div class="game-stage"><span class="game-badge">${icon('zap', { size: 44 })}</span><h2 style="font-size:28px;font-weight:900">مسابقه ذهن سریع</h2>
    <p style="max-width:420px;opacity:.9;margin:0">۶۰ ثانیه وقت داری. هر پاسخ درست ۱۰ امتیاز؛ ۳ پاسخ درست پشت‌سرهم ضریب امتیازت را بالا می‌برد! سؤال‌ها مناسب پایه ${fa(grade)} است.</p>
    <div class="glass" style="padding:6px 14px;border-radius:12px;background:rgba(255,255,255,.1)">${icon('trophy', { size: 16 })} رکورد تو: ${fa(best)}</div><button class="btn lg orange" id="go">${icon('play', { size: 16 })} شروع</button></div>`;
  $('#go', el).onclick = start;
}

// ================= داستان تعاملی =================
const STORY = {
  start: { scene: 'star', bg: '#094A50', narr: 'شب، رصدخانه کوهستان', text: 'ساعت ۹ شب است. تو و دوستت «نیلو» به رصدخانه قدیمی کوهستان رسیده‌اید. پروفسور رادان پیام داده: «تلسکوپ بزرگ از کار افتاده و امشب شهاب‌باران بزرگ قرن است! فقط شما می‌توانید کمک کنید.» در ورودی قفل است و یک صفحه رمز روی آن می‌درخشد.', choices: [{ t: ' سراغ صفحه رمز برو', to: 'door' }, { t: ' دور ساختمان بگرد و پنجره‌ای پیدا کن', to: 'window' }] },
  window: { scene: 'eye', bg: '#0E7077', narr: 'پشت ساختمان', text: 'پشت ساختمان یک جغد روی شاخه نشسته و به تو خیره شده. پنجره‌ها همه بسته‌اند، اما روی دیوار با گچ نوشته شده: «رمز در، جواب معمای من است.» نیلو می‌خندد: «انگار چاره‌ای جز حل معما نداریم!»', choices: [{ t: ' برگرد سراغ در ورودی', to: 'door' }] },
  door: { scene: 'lock', bg: '#0B5F66', narr: 'در ورودی رصدخانه', text: 'روی صفحه نوشته شده: «عدد بعدی را وارد کن: ۳، ۶، ۱۲، ۲۴، ...»', quiz: { options: ['۳۰', '۳۶', '۴۸', '۲۸'], answer: 2, right: 'hall', wrong: 'doorWrong' } },
  doorWrong: { scene: 'alert', bg: '#A8202A', narr: 'بوق هشدار!', text: 'صفحه قرمز شد و بوق کوتاهی زد. نیلو می‌گوید: «دقت کن! هر عدد چند برابر عدد قبلی است؟» خوشبختانه صفحه یک فرصت دیگر می‌دهد.', choices: [{ t: ' دوباره امتحان کن', to: 'door' }] },
  hall: { scene: 'building', bg: '#0E7077', narr: 'تالار اصلی', text: 'در با صدای تیک باز شد! داخل تالار، تلسکوپ غول‌پیکر خاموش است. دو راه داری: اتاق کنترل برق در زیرزمین، یا کتابخانه پروفسور در طبقه بالا.', star: true, choices: [{ t: ' به زیرزمین و اتاق برق برو', to: 'power' }, { t: ' به کتابخانه پروفسور برو', to: 'library' }] },
  library: { scene: 'book', bg: '#A86E0C', narr: 'کتابخانه پروفسور', text: 'روی میز یک دفترچه باز است: «اگر برق رفت، یادت باشد کلید اصلی پشت تابلوی منظومه شمسی است.» کنار دفترچه نقشه‌ای از سیاره‌ها کشیده شده. نیلو تابلو را پیدا می‌کند، اما برای برداشتنش باید به سؤال روی آن جواب بدهید.', quiz: { q: 'کدام سیاره به «سیاره سرخ» معروف است؟', options: ['زهره', 'مشتری', 'مریخ', 'زحل'], answer: 2, right: 'power', wrong: 'libWrong' } },
  libWrong: { scene: 'bulb', bg: '#7A4F05', narr: 'تابلو تکان نخورد', text: 'تابلو تکان نخورد. نیلو یادآوری می‌کند: «خاک این سیاره پر از اکسید آهن است و برای همین قرمز دیده می‌شود.»', choices: [{ t: ' دوباره فکر کن', to: 'library' }] },
  power: { scene: 'zap', bg: '#A86E0C', narr: 'اتاق برق', text: 'در اتاق برق، یک مدار ساده می‌بینی که سیمش قطع شده. سه وسیله در جعبه ابزار هست. برای وصل کردن دو سر سیم، کدام را انتخاب می‌کنی؟', quiz: { options: ['تکه چوب خشک', 'سیم مسی', 'نوار پلاستیکی', 'شیشه'], answer: 1, right: 'telescope', wrong: 'powerWrong' } },
  powerWrong: { scene: 'bulb', bg: '#7A4F05', narr: 'چراغ روشن نشد', text: 'چراغ‌ها روشن نشدند. «این ماده نارسانا است» نیلو می‌گوید. «دنبال ماده‌ای بگرد که الکترون‌ها راحت از آن عبور کنند.»', choices: [{ t: ' وسیله دیگری انتخاب کن', to: 'power' }] },
  telescope: { scene: 'compass', bg: '#2C5A7A', narr: 'گنبد تلسکوپ', text: 'برق وصل شد و گنبد آرام باز می‌شود! تلسکوپ روشن است، اما باید جهتش را تنظیم کنی. پروفسور در پیام صوتی می‌گوید: «شهاب‌باران از سمت صورت فلکی شکارچی می‌آید؛ همان که سه ستاره کمربندش در یک خط است.»', star: true, choices: [{ t: ' تلسکوپ را به سمت سه ستاره هم‌خط بچرخان', to: 'final' }, { t: ' تلسکوپ را به سمت ماه بچرخان', to: 'moon' }] },
  moon: { scene: 'globe', bg: '#475B5D', narr: 'تصویر ماه', text: 'تصویر زیبایی از دهانه‌های ماه می‌بینی، اما خبری از شهاب‌ها نیست. نیلو می‌گوید: «ماه قشنگ است، ولی ما دنبال کمربند شکارچی بودیم!»', choices: [{ t: ' تلسکوپ را دوباره تنظیم کن', to: 'telescope' }] },
  final: { scene: 'sparkles', bg: '#094A50', narr: 'شهاب‌باران قرن!', text: 'آسمان پر از رگه‌های نورانی می‌شود! پروفسور رادان نفس‌زنان از راه می‌رسد و با خوشحالی تصاویر را ذخیره می‌کند: «شما نه‌تنها رصدخانه را نجات دادید، بلکه داده‌های این شب برای پژوهشگران سراسر کشور ارسال می‌شود. شما دانشمندان کوچک واقعی هستید!» ', end: true },
};

export function storyView(el) {
  setHead('داستان تعاملی «راز رصدخانه»', 'انتخاب کن، معما حل کن، داستان را بساز', '<a class="btn ghost sm" href="#/games">→ بازی‌ها</a>');
  let stars = 0, mistakes = 0;
  const got = new Set();
  const show = (id) => {
    const n = STORY[id];
    if (n.star && !got.has(id)) { got.add(id); stars++; }
    el.innerHTML = `<div class="story-stage"><div class="story-scene" style="background:${n.bg}"><span class="scene-ic">${icon(n.scene, { size: 64 })}</span><div class="narr">${esc(n.narr)} • ${icon('star', { size: 16 })} ${fa(stars)}</div></div>
      <div class="story-body"><p>${esc(n.text)}</p>${n.quiz?.q ? `<p class="bold">${esc(n.quiz.q)}</p>` : ''}<div class="story-choices">
      ${n.end ? `<button class="btn lg accent" id="finish">${icon('trophy', { size: 18 })} پایان داستان و دریافت جایزه</button>` : n.quiz ? n.quiz.options.map((o, i) => `<button class="story-choice" data-q="${i}"><span class="k">${['الف', 'ب', 'ج', 'د'][i]}</span>${esc(o)}</button>`).join('') : n.choices.map((c) => `<button class="story-choice" data-to="${c.to}">${esc(c.t)}</button>`).join('')}
      </div></div></div>`;
    on(el.firstElementChild, 'click', '[data-to]', (e, b) => show(b.dataset.to));
    on(el.firstElementChild, 'click', '[data-q]', (e, b) => {
      const ok = Number(b.dataset.q) === n.quiz.answer;
      if (ok) beep(1); else mistakes++;
      show(ok ? n.quiz.right : n.quiz.wrong);
    });
    $('#finish', el)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      confetti(140);
      const score = Math.max(10, 100 - mistakes * 15) + stars * 10;
      let reward = 0;
      try { reward = (await post('/api/student/game', { game: 'story', score })).reward; } catch (err) { toast(err.message, 'err'); }
      el.innerHTML = `<div class="game-stage" ><span class="game-badge">${icon('trophy', { size: 44 })}</span><h2 style="font-size:26px;font-weight:900">ماموریت با موفقیت انجام شد!</h2>
        <div class="game-hud"><span class="glass">${icon('star', { size: 16 })} ستاره: ${fa(stars)}</span><span class="glass">${icon('file-check', { size: 16 })} اشتباه: ${fa(mistakes)}</span><span class="glass">${icon('target', { size: 16 })} امتیاز داستان: ${fa(score)}</span></div>
        ${reward ? `<div class="glass" style="padding:8px 16px;border-radius:12px;background:rgba(255,255,255,.1)">${icon('star', { size: 16 })} ${sgn(reward)} امتیاز فعالیت گرفتی!</div>` : '<div class="small" style="opacity:.85">جایزه این داستان را قبلاً گرفته‌ای؛ اما رکوردت ثبت شد.</div>'}
        <div class="row"><button class="btn lg orange" id="re">${icon('refresh', { size: 16 })} دوباره از اول</button><a class="btn lg ghost" href="#/games">بازی‌های دیگر</a></div></div>`;
      $('#re', el).onclick = () => storyView(el);
    });
  };
  show('start');
}
