// Admin layer (spec 001 §4 US3–US6). Loaded on every page; does nothing visible for readers.
(function () {
  'use strict';
  const body = document.body;
  const ROOT = body.dataset.root || '';
  const ISSUE = body.dataset.issue || '';
  const KEY = 'ca_admin', LOCAL = 'ca_edits_local', GHTOKEN = 'ca_gh_token';
  const TTL = 8 * 3600 * 1000;
  const mk = (store) => ({
    get(k) { try { return JSON.parse(store().getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { store().setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { store().removeItem(k); } catch (e) {} },
  });
  const ss = mk(() => sessionStorage), ls = mk(() => localStorage);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { mcq: 'MCQ প্রশ্ন', qa: 'প্রশ্নোত্তর', news: 'সংবাদ', content: 'অংশ', heading: 'শিরোনাম', chapter: 'অধ্যায়' };

  function toast(msg, ms = 2800) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  /* ---------------- auth ---------------- */
  async function detectMode() {
    try {
      const r = await fetch(ROOT + 'api/health', { cache: 'no-store' });
      if (r.ok && (await r.json()).mode === 'server') return 'server';
    } catch (e) {}
    return 'static';
  }
  const hex2buf = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  const buf2hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  async function pbkdf2(pw, saltHex, iterations) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hex2buf(saltHex), iterations, hash: 'SHA-256' }, key, 256);
    return buf2hex(bits);
  }
  async function login(username, password) {
    const mode = await detectMode();
    if (mode === 'server') {
      const r = await fetch(ROOT + 'api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'লগইন ব্যর্থ');
      ss.set(KEY, { user: j.user, token: j.token, exp: j.exp, mode });
      return mode;
    }
    if (!window.crypto || !crypto.subtle) throw new Error('লগইনের জন্য https বা localhost প্রয়োজন');
    const db = await (await fetch(ROOT + 'data/users.json', { cache: 'no-store' })).json();
    const u = (db.users || []).find((x) => x.username === username);
    const h = await pbkdf2(password, u ? u.salt : '00', u ? u.iterations : 100000);
    if (!u || h !== u.hash) throw new Error('ভুল ইউজারনেম বা পাসওয়ার্ড');
    ss.set(KEY, { user: username, exp: Date.now() + TTL, mode });
    return mode;
  }
  function session() {
    const s = ss.get(KEY);
    if (!s || s.exp < Date.now()) { ss.del(KEY); return null; }
    return s;
  }
  async function logout() {
    const s = session();
    if (s && s.mode === 'server') {
      try { await fetch(ROOT + 'api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + s.token } }); } catch (e) {}
    }
    ss.del(KEY);
    ss.del(GHTOKEN);
    location.reload();
  }
  function safeNext() {
    const n = new URLSearchParams(location.search).get('next');
    if (!n) return ROOT + 'index.html';
    try { const u = new URL(n, location.href); if (u.origin === location.origin) return u.href; } catch (e) {}
    return ROOT + 'index.html';
  }

  /* ---------------- login page ---------------- */
  if (body.dataset.page === 'login') {
    const form = document.getElementById('loginForm'), err = document.getElementById('err');
    const s = session();
    if (s) {
      form.innerHTML = `<h1>লগইন করা আছে</h1><p>${esc(s.user)} হিসেবে লগইন করা আছেন।</p>
        <button type="button" id="goBtn">সাইটে যান</button><button type="button" id="outBtn" style="background:transparent;color:var(--accent);border:1px solid var(--accent)">লগআউট</button>`;
      document.getElementById('goBtn').onclick = () => (location.href = safeNext());
      document.getElementById('outBtn').onclick = logout;
      return;
    }
    detectMode().then((m) => {
      document.getElementById('loginMode').textContent += m === 'server'
        ? ' (লোকাল সার্ভার মোড — পরিবর্তন সরাসরি ফাইলে সংরক্ষিত হবে)'
        : ' (স্ট্যাটিক মোড — পরিবর্তন GitHub-এ পাঠাতে হবে)';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'যাচাই হচ্ছে…';
      try {
        await login(form.username.value.trim(), form.password.value);
        location.href = safeNext();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = 'লগইন';
      }
    });
    return;
  }

  const S = session();
  const adminLink = document.getElementById('adminLink');
  if (!S) {
    if (adminLink) adminLink.href = ROOT + 'admin.html?next=' + encodeURIComponent(location.pathname + location.hash);
    return;
  }
  if (adminLink) { adminLink.textContent = `লগআউট (${S.user})`; adminLink.href = '#'; adminLink.onclick = (e) => { e.preventDefault(); logout(); }; }
  body.classList.add('admin');
  const isServer = S.mode === 'server';
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token });

  /* ---------------- edit queue ---------------- */
  let committed = [];
  let local = ls.get(LOCAL) || [];
  const all = () => [...committed, ...local.filter((l) => !committed.some((c) => c.id === l.id))];
  const newId = () => 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function loadQueue() {
    try {
      if (isServer) {
        const r = await fetch(ROOT + 'api/edits', { headers: H() });
        if (r.status === 401) { ss.del(KEY); toast('সেশন শেষ — আবার লগইন করুন'); return; }
        committed = (await r.json()).edits || [];
      } else {
        committed = (await (await fetch(ROOT + 'data/edits.json', { cache: 'no-store' })).json()).edits || [];
      }
    } catch (e) { committed = []; }
  }
  async function addEdit(e) {
    Object.assign(e, { id: newId(), createdAt: new Date().toISOString(), by: S.user, status: 'pending' });
    if (isServer) {
      const r = await fetch(ROOT + 'api/edits', { method: 'POST', headers: H(), body: JSON.stringify(e) });
      const j = await r.json().catch(() => ({}));
      if (!j.edit) throw new Error(j.error || 'সংরক্ষণ ব্যর্থ');
      committed.push(j.edit);
      return j.edit;
    }
    local.push(e);
    ls.set(LOCAL, local);
    return e;
  }
  async function cancelEdit(id) {
    if (local.some((l) => l.id === id)) {
      local = local.filter((l) => l.id !== id);
      ls.set(LOCAL, local);
    } else if (isServer) {
      const r = await fetch(ROOT + 'api/edits/' + id, { method: 'DELETE', headers: H() });
      if (!r.ok) throw new Error('বাতিল করা যায়নি');
      committed = committed.filter((c) => c.id !== id);
    } else throw new Error('GitHub-এ পাঠানো অনুরোধ এখান থেকে বাতিল করা যায় না');
  }

  let BL = null;
  async function blocks() {
    if (!BL) BL = await (await fetch(ROOT + 'issues/' + ISSUE + '/blocks.json', { cache: 'no-store' })).json();
    return BL;
  }

  /* ---------------- decorate items ---------------- */
  const main = document.querySelector('main');
  if (ISSUE && main) {
    document.querySelectorAll('.it[data-bid]').forEach((el) => {
      const tb = document.createElement('div');
      tb.className = 'atb';
      tb.innerHTML = '<span class="st"></span><button type="button" class="ins">✎ নির্দেশনা</button>' +
        (el.dataset.kind !== 'heading' ? '<button type="button" class="del">🗑 মুছুন</button>' : '');
      el.appendChild(tb);
    });
    document.querySelectorAll('.chapter > .ch-head').forEach((h) => {
      const d = document.createElement('div');
      d.className = 'ch-tools atb';
      d.innerHTML = '<span class="st"></span><button type="button" class="ins">✎ পুরো অধ্যায়ে নির্দেশনা</button>';
      h.appendChild(d);
    });
    main.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button');
      if (!btn || !btn.closest('.atb, .abox')) return;
      const chHead = btn.closest('.ch-head');
      const host = chHead || btn.closest('.it');
      if (!host) return;
      if (btn.classList.contains('ins')) openBox(host, !!chHead);
      else if (btn.classList.contains('del')) doDelete(host);
      else if (btn.classList.contains('undo')) undo(btn.dataset.id);
    });
  }

  function openBox(host, isChapter) {
    const existing = host.querySelector(':scope > .abox');
    if (existing) { existing.remove(); return; }
    const label = isChapter ? KIND.chapter : KIND[host.dataset.kind] || 'অংশ';
    const box = document.createElement('div');
    box.className = 'abox';
    box.innerHTML = `<textarea placeholder="এই ${label}-এ Claude কী পরিবর্তন করবে লিখুন… (যেমন: উত্তর সংশোধন করুন, আরও সংক্ষিপ্ত করুন, তথ্য হালনাগাদ করুন)"></textarea>
      <div class="row"><button type="button" class="x">বাতিল</button><button type="button" class="pri">Claude-এর জন্য সংরক্ষণ</button></div>`;
    host.appendChild(box);
    const ta = box.querySelector('textarea');
    ta.focus();
    box.querySelector('.x').onclick = () => box.remove();
    box.querySelector('.pri').onclick = async () => {
      const instruction = ta.value.trim();
      if (!instruction) { ta.focus(); return; }
      try {
        const bl = await blocks();
        let e;
        if (isChapter) {
          const key = host.parentElement.dataset.ckey, c = bl.chapters[key];
          e = { type: 'instruction', scope: 'chapter', issue: ISSUE, source: bl.source, chapter: c.title, blockId: key, kind: 'chapter', occurrence: 1, text: c.heading, instruction };
        } else {
          const id = host.dataset.bid, b = bl.blocks[id];
          if (!b) throw new Error('ব্লক খুঁজে পাওয়া যায়নি — পেজ রিফ্রেশ করুন');
          e = { type: 'instruction', scope: 'item', issue: ISSUE, source: bl.source, chapter: bl.chapters[b.ch].title, blockId: id, kind: b.k, occurrence: b.o, text: b.t, instruction };
        }
        await addEdit(e);
        box.remove();
        paint();
        toast('নির্দেশনা সংরক্ষিত হয়েছে');
      } catch (ex) { toast('ত্রুটি: ' + ex.message, 4000); }
    };
  }

  async function doDelete(host) {
    const label = KIND[host.dataset.kind] || 'অংশ';
    const preview = host.innerText.replace(/✎ নির্দেশনা|🗑 মুছুন|↺ ফিরিয়ে আনুন/g, '').trim().slice(0, 220);
    if (!confirm(`এই ${label}টি মুছে ফেলবেন?\n\n${preview}`)) return;
    try {
      const bl = await blocks();
      const id = host.dataset.bid, b = bl.blocks[id];
      if (!b) throw new Error('ব্লক খুঁজে পাওয়া যায়নি — পেজ রিফ্রেশ করুন');
      const e = await addEdit({ type: 'delete', scope: 'item', issue: ISSUE, source: bl.source, chapter: bl.chapters[b.ch].title, blockId: id, kind: b.k, occurrence: b.o, text: b.t });
      if (e.status === 'applied') {
        host.remove();
        toast('মুছে ফেলা হয়েছে ও সাইট আপডেট হয়েছে');
      } else if (e.status === 'failed') {
        toast('মুছতে ব্যর্থ: ' + (e.result || ''), 4500);
      } else {
        toast('মুছে ফেলার অনুরোধ যুক্ত হয়েছে — GitHub-এ পাঠালে কার্যকর হবে', 3800);
      }
      paint();
    } catch (ex) { toast('ত্রুটি: ' + ex.message, 4000); }
  }

  async function undo(id) {
    try { await cancelEdit(id); paint(); toast('অনুরোধ বাতিল হয়েছে'); } catch (ex) { toast(ex.message, 4000); }
  }

  function paint() {
    document.querySelectorAll('.it.pending-del').forEach((el) => el.classList.remove('pending-del'));
    document.querySelectorAll('.atb .st').forEach((s) => (s.innerHTML = ''));
    const pend = all().filter((e) => e.status === 'pending' && e.issue === ISSUE);
    for (const e of pend) {
      const host = e.scope === 'chapter'
        ? document.querySelector(`.chapter[data-ckey="${e.blockId}"] > .ch-head`)
        : document.querySelector(`.it[data-bid="${e.blockId}"]`);
      if (!host) continue;
      const st = host.querySelector(':scope > .atb .st');
      const canUndo = local.some((l) => l.id === e.id) || isServer;
      const undoBtn = canUndo ? ` <button type="button" class="undo" data-id="${e.id}">↺ ফিরিয়ে আনুন</button>` : '';
      if (e.type === 'delete') {
        host.classList.add('pending-del');
        if (st) st.innerHTML += `<b>🗑 মুছে ফেলার অপেক্ষায়</b>${undoBtn} `;
      } else if (st) {
        st.innerHTML += `<span title="${esc(e.instruction)}">⏳ <b>নির্দেশনা অপেক্ষমাণ</b>: ${esc(e.instruction.slice(0, 40))}${e.instruction.length > 40 ? '…' : ''}</span>${undoBtn} `;
      }
    }
    renderBar();
    if (panel.classList.contains('show')) renderPanel();
  }

  /* ---------------- admin bar + panel ---------------- */
  const bar = document.createElement('div');
  bar.className = 'abar';
  const panel = document.createElement('div');
  panel.className = 'apanel';
  document.body.append(bar, panel);

  function renderBar() {
    const pend = all().filter((e) => e.status === 'pending').length;
    bar.innerHTML = `<span>👤 ${esc(S.user)} · ${isServer ? 'লোকাল সার্ভার' : 'স্ট্যাটিক'}</span>
      <button type="button" data-a="panel">📝 সম্পাদনা তালিকা<span class="cnt">${pend}</span></button>
      <button type="button" data-a="logout">লগআউট</button>`;
  }
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'panel') { panel.classList.toggle('show'); if (panel.classList.contains('show')) renderPanel(); }
    if (a === 'logout') logout();
  });

  function editRow(e) {
    const isLocal = local.some((l) => l.id === e.id);
    const typeLbl = e.type === 'delete' ? 'মুছুন' : 'নির্দেশনা';
    const stLbl = { pending: isLocal ? 'পাঠানো হয়নি' : 'অপেক্ষমাণ', applied: 'প্রয়োগ হয়েছে', failed: 'ব্যর্থ' }[e.status] || e.status;
    return `<div class="e"><span class="t ${e.type}">${typeLbl}</span> <b>${esc(stLbl)}</b>
      <small>${esc(e.issue)} · ${esc(e.chapter || '')} · ${esc(KIND[e.kind] || e.kind || '')} · ${new Date(e.createdAt).toLocaleString('bn-BD')}</small>
      ${e.instruction ? `<div>✎ ${esc(e.instruction)}</div>` : ''}
      <pre>${esc((e.text || '').slice(0, 400))}</pre>
      ${e.result ? `<small>ফলাফল: ${esc(e.result)}</small>` : ''}
      ${e.status === 'pending' && (isLocal || isServer) ? `<button type="button" data-undo="${e.id}">↺ বাতিল</button>` : ''}
      ${e.issue !== ISSUE || !ISSUE ? '' : `<button type="button" data-go="${esc(e.scope === 'chapter' ? '' : e.blockId)}">দেখুন</button>`}</div>`;
  }

  function renderPanel(log) {
    const list = all();
    const pend = list.filter((e) => e.status === 'pending');
    const done = list.filter((e) => e.status !== 'pending').slice(-10).reverse();
    const acts = isServer
      ? `<button type="button" data-a="apply">🤖 এখনই Claude দিয়ে প্রয়োগ করুন</button>`
      : `<button type="button" data-a="push">⬆ GitHub-এ পাঠান (${local.length})</button>`;
    panel.innerHTML = `<h3>সম্পাদনা তালিকা</h3>
      <div class="acts">${acts}<button type="button" data-a="download">⬇ JSON ডাউনলোড</button><button type="button" data-a="refresh">⟳ রিফ্রেশ</button><button type="button" data-a="close">✕</button></div>
      <p class="note">${isServer
        ? 'মুছে ফেলা সঙ্গে সঙ্গে কার্যকর হয়। নির্দেশনাগুলো "প্রয়োগ করুন" চাপলে Claude Code (CLI) উৎস Markdown সম্পাদনা করে সাইট আবার তৈরি করবে।'
        : 'অনুরোধগুলো এই ব্রাউজারে জমা আছে। "GitHub-এ পাঠান" চাপলে data/edits.json-এ কমিট হবে; GitHub Action তখন Claude দিয়ে প্রয়োগ করে সাইট আপডেট করবে। বিকল্প: JSON ডাউনলোড করে লোকালি <code>/apply-edits</code> চালান।'}</p>
      ${log ? `<pre style="white-space:pre-wrap;max-height:200px;overflow:auto;font-size:12px">${esc(log)}</pre>` : ''}
      <h3>অপেক্ষমাণ (${pend.length})</h3>${pend.map(editRow).join('') || '<p class="note">কিছু নেই</p>'}
      ${done.length ? `<h3>সাম্প্রতিক</h3>${done.map(editRow).join('')}` : ''}`;
  }

  panel.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.undo) return undo(b.dataset.undo);
    if (b.dataset.go !== undefined) {
      const el = b.dataset.go && document.querySelector(`.it[data-bid="${b.dataset.go}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; setTimeout(() => (el.style.outline = ''), 2500); }
      return;
    }
    const a = b.dataset.a;
    if (a === 'close') panel.classList.remove('show');
    if (a === 'refresh') { await loadQueue(); paint(); }
    if (a === 'download') {
      const blob = new Blob([JSON.stringify({ edits: all() }, null, 2)], { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: u, download: 'edits.json' });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }
    if (a === 'push') { b.disabled = true; try { await pushGitHub(); } catch (ex) { toast('GitHub ত্রুটি: ' + ex.message, 5000); } b.disabled = false; paint(); }
    if (a === 'apply') runApply(b);
  });

  async function runApply(btn) {
    btn.disabled = true;
    const r = await fetch(ROOT + 'api/apply', { method: 'POST', headers: H() });
    const j = await r.json().catch(() => ({}));
    if (!j.started) { toast(j.message || 'Claude চালু করা যায়নি (আগে থেকেই চলছে?)', 4000); btn.disabled = false; return; }
    toast('Claude কাজ শুরু করেছে…');
    const poll = async () => {
      const st = await (await fetch(ROOT + 'api/status', { headers: H() })).json();
      renderPanel((st.running ? '⏳ চলছে…\n' : `✓ শেষ (code ${st.code})\n`) + (st.log || '').slice(-3000));
      if (st.running) return setTimeout(poll, 3000);
      await loadQueue();
      paint();
      renderPanel(`✓ শেষ (code ${st.code})\n` + (st.log || '').slice(-3000));
      if (confirm('Claude কাজ শেষ করেছে। হালনাগাদ পেজ দেখতে রিলোড করবেন?')) location.reload();
    };
    poll();
  }

  /* ---------------- GitHub sync (static mode) ---------------- */
  const b64enc = (s) => { let bin = ''; new TextEncoder().encode(s).forEach((x) => (bin += String.fromCharCode(x))); return btoa(bin); };
  const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  async function repoInfo() {
    let repo = '', branch = 'main';
    try { const m = await (await fetch(ROOT + 'data/issues.json', { cache: 'no-store' })).json(); repo = m.repo || ''; branch = m.branch || 'main'; } catch (e) {}
    if (!repo && location.hostname.endsWith('.github.io')) repo = location.hostname.split('.')[0] + '/' + location.pathname.split('/')[1];
    if (!repo) repo = prompt('GitHub রিপোজিটরি (owner/repo):') || '';
    return { repo, branch };
  }
  async function pushGitHub() {
    if (!local.length) { toast('পাঠানোর মতো নতুন কিছু নেই'); return; }
    const { repo, branch } = await repoInfo();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('রিপোজিটরির নাম সঠিক নয়');
    let token = ss.get(GHTOKEN);
    if (!token) {
      token = prompt('GitHub fine-grained personal access token দিন\n(শুধু এই রিপোজিটরি, Contents: Read and write)।\nটোকেনটি শুধু এই ট্যাবেই থাকবে।');
      if (!token) return;
      token = token.trim();
    }
    const api = `https://api.github.com/repos/${repo}/contents/data/edits.json`;
    const hd = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    let sha, cur = { edits: [] };
    const r = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: hd, cache: 'no-store' });
    if (r.ok) { const j = await r.json(); sha = j.sha; cur = JSON.parse(b64dec(j.content)); }
    else if (r.status === 401 || r.status === 403) { ss.del(GHTOKEN); throw new Error('টোকেন গ্রহণযোগ্য নয় (' + r.status + ')'); }
    else if (r.status !== 404) throw new Error('পড়া যায়নি (' + r.status + ')');
    const ids = new Set(cur.edits.map((e) => e.id));
    local.forEach((e) => { if (!ids.has(e.id)) cur.edits.push(e); });
    const put = await fetch(api, {
      method: 'PUT', headers: hd,
      body: JSON.stringify({ message: `admin: ${local.length} edit request(s) by ${S.user}`, content: b64enc(JSON.stringify(cur, null, 2) + '\n'), sha, branch }),
    });
    if (!put.ok) { if (put.status === 401 || put.status === 403) ss.del(GHTOKEN); throw new Error('কমিট ব্যর্থ (' + put.status + ')'); }
    ss.set(GHTOKEN, token);
    committed = cur.edits;
    local = [];
    ls.set(LOCAL, local);
    toast('GitHub-এ পাঠানো হয়েছে — GitHub Action কিছুক্ষণের মধ্যে প্রয়োগ করবে', 4500);
  }

  loadQueue().then(paint);
})();
