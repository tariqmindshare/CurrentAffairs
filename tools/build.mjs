#!/usr/bin/env node
// Build the static site from issues.config.json → index.html, archive.html, issues/<id>/index.html
// Usage: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIssue, renderChapter, esc, inline } from './lib/markdown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);
const urlPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const BN = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/\d/g, (d) => BN[d]);

export function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(rel('issues.config.json'), 'utf8'));
  cfg.issues.sort((a, b) => b.id.localeCompare(a.id));
  return cfg;
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=Noto+Serif+Bengali:wght@400;600;700&display=swap" rel="stylesheet">`;

function head(title, prefix, desc) {
  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || title)}">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;var f=localStorage.getItem('fs');if(f)document.documentElement.style.setProperty('--fs',f+'px')}catch(e){}</script>
${FONTS}
<link rel="stylesheet" href="${prefix}assets/site.css">
</head>`;
}

function footer(cfg, prefix) {
  return `<div class="foot">${esc(cfg.siteTitle)} · <a href="${prefix}archive.html">সব সংখ্যা</a> · <a href="${prefix}admin.html" id="adminLink">অ্যাডমিন</a></div>`;
}

function issuePage(cfg, issue, doc, { prefix, isLatest, prev, next }) {
  const brand = `${doc.title}`;
  // sidebar grouped by section, in order of appearance
  const groups = new Map();
  for (const ch of doc.chapters) {
    if (!groups.has(ch.section)) groups.set(ch.section, []);
    groups.get(ch.section).push(ch);
  }
  const side = [...groups].map(([sec, chs]) =>
    `<details open><summary>${esc(sec)} <small>${bn(chs.length)}</small></summary><ul>` +
    chs.map((c) => `<li><a href="#${c.id}" data-ch="${c.id}"><span class="pn">${esc(c.page)}</span>${inline(c.title)}</a></li>`).join('') +
    '</ul></details>').join('');
  const cards = [...groups].map(([sec, chs]) =>
    `<a class="card" href="#${chs[0].id}"><b>${esc(sec)}</b><span>${bn(chs.length)} অধ্যায় · পৃ. ${esc(chs[0].page)} থেকে</span></a>`).join('');

  const links = [`<a href="${prefix}archive.html">📚 সব সংখ্যা</a>`];
  if (prev) links.push(`<a href="${prefix}issues/${prev.id}/">◀ আগের সংখ্যা: ${esc(prev.month)}</a>`);
  if (next) links.push(`<a href="${prefix}issues/${next.id}/">পরের সংখ্যা: ${esc(next.month)} ▶</a>`);
  for (const p of issue.pdfs || []) links.push(`<a href="${prefix}${urlPath(p.path)}" target="_blank" rel="noopener">📄 PDF ${esc(p.label)}</a>`);
  if (isLatest && prefix === '') links.push(`<a href="issues/${issue.id}/">🔗 স্থায়ী লিংক</a>`);

  return `${head(brand, prefix, `${cfg.siteTitle} — ${issue.month}`)}
<body data-issue="${issue.id}" data-root="${prefix}" data-source="${esc(issue.source)}">
<div class="top">
  <button class="btn" id="menuBtn" aria-label="সূচি">☰</button>
  <a class="brand" href="#home">${esc(brand)}</a>
  <span class="sp"></span>
  <a class="nav" href="${prefix}archive.html" title="সব সংখ্যা">📚 সব সংখ্যা</a>
  <div class="search">
    <input id="q" type="search" placeholder="খুঁজুন…" autocomplete="off">
    <div class="results" id="results"></div>
  </div>
  <button class="btn" id="fontDown" title="ছোট লেখা">অ−</button>
  <button class="btn" id="fontUp" title="বড় লেখা">অ+</button>
  <button class="btn" id="themeBtn" title="থিম">◐</button>
</div>
<div class="wrap">
  <aside id="side">${side}</aside>
  <main>
    <div class="hero" id="home">
      <h1>${esc(doc.title)} ${isLatest ? '<span class="badge">সর্বশেষ সংখ্যা</span>' : ''}</h1>
      <p>${bn(doc.chapters.length)} অধ্যায় · ${bn(doc.pages)} পৃষ্ঠা · ${bn(groups.size)} বিভাগ</p>
      <div class="links">${links.join('')}</div>
      <div class="cards">${cards}</div>
    </div>
${doc.chapters.map(renderChapter).join('')}
    ${footer(cfg, prefix)}
  </main>
</div>
<button class="btn" id="toTop" title="উপরে">▲</button>
<script src="${prefix}assets/site.js"></script>
<script src="${prefix}assets/admin.js" defer></script>
</body>
</html>
`;
}

function archivePage(cfg, list) {
  const cards = list.map((it, i) => `<a class="issue" href="issues/${it.id}/">
  <div class="cover"><div class="mt">${esc(it.titleShort)}</div><div class="mm">${esc(it.month)}</div>
  <ul>${it.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
  <div class="info"><span>${bn(it.chapters)} অধ্যায় · ${bn(it.pages)} পৃষ্ঠা</span>${i === 0 ? '<span class="badge">সর্বশেষ</span>' : ''}</div>
</a>`).join('\n');
  return `${head(`সব সংখ্যা • ${cfg.siteTitle}`, '', cfg.siteTagline)}
<body data-root="">
<div class="top">
  <a class="brand" href="index.html">${esc(cfg.siteTitle)}</a>
  <span class="sp"></span>
  <a class="nav" href="index.html">সর্বশেষ সংখ্যা</a>
  <button class="btn" id="themeBtn" title="থিম">◐</button>
</div>
<div class="archive">
  <h1>সব সংখ্যা</h1>
  <p>${esc(cfg.siteTagline)} · মোট ${bn(list.length)}টি সংখ্যা</p>
  <div class="issues">
${cards}
  </div>
</div>
${footer(cfg, '')}
<script src="assets/site.js"></script>
<script src="assets/admin.js" defer></script>
</body>
</html>
`;
}

export function build({ quiet = false } = {}) {
  const cfg = loadConfig();
  const docs = cfg.issues.map((issue) => {
    const src = fs.readFileSync(rel(issue.source), 'utf8');
    return { issue, doc: parseIssue(src) };
  });
  const manifest = [];
  docs.forEach(({ issue, doc }, i) => {
    const prev = docs[i + 1]?.issue; // older
    const next = docs[i - 1]?.issue; // newer
    const dir = rel('issues', issue.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), issuePage(cfg, issue, doc, { prefix: '../../', isLatest: i === 0, prev, next }));
    if (i === 0) fs.writeFileSync(rel('index.html'), issuePage(cfg, issue, doc, { prefix: '', isLatest: true, prev, next }));
    // admin-only lookup: block id → exact markdown (used to build edit requests)
    const blocks = {}, chapters = {};
    for (const ch of doc.chapters) {
      chapters[ch.key] = { id: ch.id, title: ch.title, heading: `# ${ch.title}` };
      for (const it of ch.items) if (it.id) blocks[it.id] = { k: it.kind, ch: ch.key, o: it.occurrence, t: it.text };
    }
    fs.writeFileSync(path.join(dir, 'blocks.json'), JSON.stringify({ issue: issue.id, source: issue.source, chapters, blocks }));
    const highlights = doc.chapters.filter((c) => c.section !== 'সূচি').slice(0, 4).map((c) => c.title.split(' : ')[0]);
    manifest.push({
      id: issue.id, month: issue.month, title: doc.title, titleShort: doc.title.split('•')[0].trim(),
      url: `issues/${issue.id}/`, source: issue.source, chapters: doc.chapters.length, pages: doc.pages,
      items: doc.chapters.reduce((n, c) => n + c.items.filter((x) => x.id).length, 0), highlights, latest: i === 0,
    });
    if (!quiet) console.log(`✓ ${issue.id}  ${doc.chapters.length} chapters, ${doc.pages} pages`);
  });
  fs.writeFileSync(rel('archive.html'), archivePage(cfg, manifest));
  fs.mkdirSync(rel('data'), { recursive: true });
  fs.writeFileSync(rel('data', 'issues.json'), JSON.stringify({ generatedAt: new Date().toISOString(), repo: cfg.repo, issues: manifest }, null, 2));
  if (!fs.existsSync(rel('data', 'edits.json'))) fs.writeFileSync(rel('data', 'edits.json'), JSON.stringify({ edits: [] }, null, 2) + '\n');
  if (!fs.existsSync(rel('.nojekyll'))) fs.writeFileSync(rel('.nojekyll'), '');
  if (!quiet) console.log(`✓ index.html → ${manifest[0]?.id}; archive.html (${manifest.length} issues)`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
