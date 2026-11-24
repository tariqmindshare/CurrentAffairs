// Reader features: theme, font size, TOC drawer, scroll-spy, back-to-top, in-issue search.
(function () {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  const themeBtn = $('themeBtn');
  if (themeBtn) themeBtn.onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  };
  function font(d) {
    const cur = parseInt(getComputedStyle(root).getPropertyValue('--fs')) || 17;
    const n = Math.min(24, Math.max(13, cur + d));
    root.style.setProperty('--fs', n + 'px');
    store.set('fs', n);
  }
  if ($('fontUp')) $('fontUp').onclick = () => font(1);
  if ($('fontDown')) $('fontDown').onclick = () => font(-1);

  const side = $('side');
  if (side) {
    $('menuBtn').onclick = () => side.classList.toggle('open');
    side.addEventListener('click', (e) => { if (e.target.closest('a')) side.classList.remove('open'); });
    const links = {};
    side.querySelectorAll('a[data-ch]').forEach((a) => (links[a.dataset.ch] = a));
    let active = null;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        const a = links[e.target.id];
        if (a && a !== active) {
          active && active.classList.remove('on');
          a.classList.add('on');
          active = a;
          const r = a.getBoundingClientRect(), sr = side.getBoundingClientRect();
          if (r.top < sr.top || r.bottom > sr.bottom) a.scrollIntoView({ block: 'center' });
        }
      });
    }, { rootMargin: '-30% 0px -65% 0px' });
    document.querySelectorAll('.chapter').forEach((s) => io.observe(s));
  }

  const toTop = $('toTop');
  if (toTop) {
    addEventListener('scroll', () => { toTop.style.display = scrollY > 800 ? 'block' : 'none'; }, { passive: true });
    toTop.onclick = () => scrollTo({ top: 0 });
  }

  // search within the current issue (page-level blocks)
  const q = $('q'), res = $('results');
  if (!q) return;
  let blocks = null;
  function index() {
    blocks = [];
    document.querySelectorAll('.chapter').forEach((ch) => {
      const title = ch.querySelector('h1').textContent;
      let cur = { id: ch.id, label: '', title, text: '' };
      ch.childNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.classList.contains('pg')) {
          if (cur.text) blocks.push(cur);
          cur = { id: n.id, label: n.querySelector('span').textContent, title, text: '' };
        } else if (!n.classList.contains('atb') && !n.classList.contains('abox')) cur.text += ' ' + (n.textContent || '');
      });
      blocks.push(cur);
    });
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 150); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; res.classList.remove('show'); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) res.classList.remove('show'); });
  function run() {
    const term = q.value.trim();
    if (term.length < 2) { res.classList.remove('show'); return; }
    if (!blocks) index();
    const lc = term.toLowerCase();
    const out = [];
    let total = 0;
    for (const b of blocks) {
      const t = b.text.replace(/\s+/g, ' ');
      const low = t.toLowerCase();
      let i = low.indexOf(lc);
      if (i < 0) continue;
      let c = 0;
      while (i >= 0) { c++; i = low.indexOf(lc, i + lc.length); }
      total += c;
      if (out.length < 60) {
        const j = low.indexOf(lc), s = Math.max(0, j - 50);
        const snip = esc(t.slice(s, j)) + '<mark>' + esc(t.slice(j, j + term.length)) + '</mark>' + esc(t.slice(j + term.length, j + term.length + 70));
        out.push(`<a href="#${b.id}"><small>${esc(b.title)}${b.label ? ' · ' + esc(b.label) : ''} · ${c}টি</small>…${snip}…</a>`);
      }
    }
    res.innerHTML = out.length ? `<div class="none">মোট ${total}টি মিল, ${out.length}টি পৃষ্ঠায়</div>` + out.join('') : '<div class="none">কিছু পাওয়া যায়নি</div>';
    res.classList.add('show');
  }
  res.addEventListener('click', (e) => { if (e.target.closest('a')) res.classList.remove('show'); });
})();
