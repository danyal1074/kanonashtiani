// Each illustration belongs to one logical section; control icons may repeat.
const ART = { 'login-welcome': [960, 720], 'dashboard-student': [768, 960], 'dashboard-teacher': [768, 960], 'dashboard-manager': [768, 960], 'dashboard-parent': [960, 720], 'dashboard-admin': [960, 720],
  'learning-path': [960, 640], 'study-focus': [960, 640], 'math-challenge': [960, 640], 'observatory-story': [960, 640], 'public-center': [960, 640], 'shop-resources': [960, 640] };
export function artwork(id, cls = '') {
  if (!Object.hasOwn(ART, id)) throw new Error('Unknown artwork');
  const [w, h] = ART[id];
  return `<img class="section-art ${cls}" data-artwork="${id}" src="/img/visual-refresh/${id}.webp" alt="" aria-hidden="true" decoding="async" width="${w}" height="${h}">`;
}
export function decoratePageArt(el, me, path) {
  const role = me.user.role;
  if (path === '/home') {
    const person = el.querySelector('.reference-person');
    if (person && !person.classList.contains('has-student-photo')) {
      person.style.backgroundImage = 'none';
      person.innerHTML = artwork('dashboard-' + role);
    } else if (!person && ['parent','admin'].includes(role)) {
      const banner = document.createElement('section');
      banner.className = 'visual-section-banner';
      const heading = document.createElement('h2');
      heading.textContent = role === 'parent' ? 'همراه مسیر رشد فرزندتان' : 'مدیریت یکپارچه کانون‌ها';
      banner.append(heading);
      banner.insertAdjacentHTML('beforeend', artwork('dashboard-' + role));
      el.prepend(banner);
    }
    return;
  }
  const id = role === 'student' && path === '/study' ? 'study-focus' :
    role === 'student' && path === '/path' ? 'learning-path' :
    ['student','parent'].includes(role) && path === '/shop' ? 'shop-resources' : null;
  if (!id) return;
  const banner = document.createElement('div');
  banner.className = 'visual-section-banner art-only';
  banner.setAttribute('aria-hidden', 'true');
  banner.innerHTML = artwork(id);
  el.prepend(banner);
}
