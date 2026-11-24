// Magazine Markdown → chapters → items → HTML.  See specs/001-magazine-site/spec.md §5.
// No dependencies; tuned to the conventions of the "Full Book" files.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// FNV-1a 32-bit → 8 hex chars
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const normalize = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n');

/* ---------------- inline ---------------- */
const ALLOWED_TAGS = /&lt;(\/?)(u|sub|sup|br|b|i|em|strong)\s*\/?&gt;/gi;
export function inline(text) {
  let s = esc(text);
  s = s.replace(ALLOWED_TAGS, '<$1$2>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(>])\*([^\s*][^*]*?)\*(?=[\s).,;:!?।]|$)/g, '$1<em>$2</em>');
  s = s.replace(/ {2,}/g, '&emsp;&emsp;');
  return s;
}

/* ---------------- block rendering ---------------- */
const isTable = (lines) => lines.length >= 2 && lines.every((l) => l.trim().startsWith('|'));
const isList = (lines) => /^\s*[-*]\s+/.test(lines[0]);
const isQuote = (lines) => lines.every((l) => l.trim().startsWith('>'));

function cells(row) {
  let r = row.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|')) r = r.slice(0, -1);
  return r.split('|').map((c) => c.trim());
}

function renderTable(lines) {
  const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l));
  const hasSep = lines.length > 1 && /^\s*\|?\s*:?-{2,}/.test(lines[1]);
  let html = '<table>';
  rows.forEach((row, i) => {
    const tag = hasSep && i === 0 ? 'th' : 'td';
    if (hasSep && i === 0) html += '<thead>';
    if (hasSep && i === 1) html += '<tbody>';
    if (!hasSep && i === 0) html += '<tbody>';
    html += '<tr>' + cells(row).map((c) => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>';
    if (hasSep && i === 0) html += '</thead>';
  });
  return html + '</tbody></table>';
}

function renderList(lines) {
  // indentation-aware unordered list
  const items = [];
  for (const l of lines) {
    const m = l.match(/^(\s*)[-*]\s+(.*)$/);
    if (m) items.push({ depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2), text: m[2] });
    else if (items.length) items[items.length - 1].text += '<br>' + l.trim();
  }
  const root = { children: [] };
  const stack = [{ depth: -1, node: root }];
  for (const it of items) {
    while (stack[stack.length - 1].depth >= it.depth) stack.pop();
    const node = { text: it.text, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth: it.depth, node });
  }
  const render = (nodes) =>
    '<ul>' + nodes.map((n) => '<li>' + inline(n.text).replace(/&lt;br&gt;/g, '<br>') + (n.children.length ? render(n.children) : '') + '</li>').join('') + '</ul>';
  return render(root.children);
}

function renderParagraph(lines) {
  const t = lines.map((l) => l.trim()).join('\n');
  const img = t.match(/^\[(ছবি|চিত্র|Image)\s*[:：]\s*([\s\S]*)\]$/);
  if (img) return `<p><span class="img">${esc(img[1])}: ${inline(img[2])}</span></p>`;
  return '<p>' + lines.map((l) => inline(l.trim())).join('<br />\n') + '</p>';
}

export function renderRaw(text) {
  const lines = text.split('\n');
  if (isTable(lines)) return renderTable(lines);
  if (isQuote(lines)) {
    const inner = lines.map((l) => l.trim().replace(/^>\s?/, '')).join('\n');
    return '<blockquote>' + splitRaw(inner).map((b) => renderRaw(b.text)).join('\n') + '</blockquote>';
  }
  if (isList(lines)) return renderList(lines);
  return renderParagraph(lines);
}

/* ---------------- raw blocks ---------------- */
// Split text into blank-line separated blocks, keeping exact offsets into the source.
export function splitRaw(src, base = 0) {
  const out = [];
  const re = /(?:[^\n]*\S[^\n]*(?:\n|$))+/g;
  let m;
  while ((m = re.exec(src))) {
    const text = m[0].replace(/\n$/, '');
    if (!text.trim()) continue;
    out.push({ text, start: base + m.index, end: base + m.index + text.length });
  }
  return out;
}

/* ---------------- item grouping ---------------- */
const RX = {
  page: /^##\s+পৃষ্ঠা\s+(\S+)\s*\(PDF page\s*0*(\d+)\)/,
  h2: /^##\s+(.*)$/,
  h3: /^###\s+(.*)$/,
  h4: /^####\s+(.*)$/,
  hr: /^-{3,}$/,
  comment: /^<!--[\s\S]*-->$/,
  question: /^(?:[০-৯]+|\d+)\s*[.।)]\s+\S/,
  option: /^(?:\(?[কখগঘ]\)|\(?[a-dA-D]\)|[ⓐⓑⓒⓓ]|\*\*(?:উত্তর|Ans|উ:))/,
  qaQ: /^\*\*(?:প্রশ্ন|Ques|Question|Q\.?)\s*[:：.]?\s*\*\*|^\*\*(?:প্রশ্ন|Ques|Q)\s*[:：.]/,
  qaA: /^\*\*(?:উত্তর|Ans|Answer|A\.?)\s*[:：.]?\s*\*\*|^\*\*(?:উত্তর|Ans|A)\s*[:：.]/,
  news: /^\*\*[^*\n]*♦[^*\n]*\*\*$/,
  rh: /[◀▶]/,
};

export function groupItems(blocks) {
  const items = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const t = b.text.trim();
    const first = t.split('\n')[0];
    let m;
    if ((m = first.match(RX.page))) {
      items.push({ kind: 'page', label: m[1], pdf: +m[2], blocks: [b] });
      const nx = blocks[i + 1];
      if (nx && !nx.text.includes('\n') && RX.rh.test(nx.text) && !/^#/.test(nx.text)) {
        items.push({ kind: 'rh', blocks: [nx] });
        i++;
      }
      continue;
    }
    if (RX.hr.test(t)) { items.push({ kind: 'hr', blocks: [b] }); continue; }
    if (RX.comment.test(t)) { items.push({ kind: 'comment', blocks: [b] }); continue; }
    if ((m = first.match(RX.h4)) && !t.includes('\n')) { items.push({ kind: 'heading', level: 4, title: m[1], blocks: [b] }); continue; }
    if ((m = first.match(RX.h3)) && !t.includes('\n')) { items.push({ kind: 'heading', level: 3, title: m[1], blocks: [b] }); continue; }
    if ((m = first.match(RX.h2)) && !t.includes('\n')) { items.push({ kind: 'heading', level: 2, title: m[1], blocks: [b] }); continue; }

    if (RX.qaQ.test(first)) {
      const grp = [b];
      if (!t.split('\n').some((l) => RX.qaA.test(l.trim()))) {
        const nx = blocks[i + 1];
        if (nx && RX.qaA.test(nx.text.trim())) { grp.push(nx); i++; }
      }
      items.push({ kind: 'qa', blocks: grp });
      continue;
    }
    if (RX.question.test(first)) {
      const grp = [b];
      while (blocks[i + 1] && RX.option.test(blocks[i + 1].text.trim())) { grp.push(blocks[++i]); }
      items.push({ kind: 'mcq', blocks: grp });
      continue;
    }
    if (RX.news.test(first)) {
      const grp = [b];
      if (!t.includes('\n')) {
        while (blocks[i + 1] && isList(blocks[i + 1].text.split('\n'))) grp.push(blocks[++i]);
      }
      items.push({ kind: 'news', blocks: grp });
      continue;
    }
    items.push({ kind: 'content', blocks: [b] });
  }
  return items;
}

const EDITABLE = new Set(['qa', 'mcq', 'news', 'content', 'heading']);

/* ---------------- document ---------------- */
export function parseIssue(src) {
  src = src.replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const title = (lines[0] || '').replace(/^#\s+/, '').trim();

  // chapter boundaries: every "# " line except the first
  const heads = [];
  let off = 0;
  lines.forEach((l, idx) => {
    if (idx > 0 && /^#\s+\S/.test(l)) heads.push({ off, title: l.replace(/^#\s+/, '').trim(), len: l.length });
    off += l.length + 1;
  });

  const front = src.slice(0, heads.length ? heads[0].off : src.length);
  const frontBlocks = splitRaw(front);
  const intro = frontBlocks.find((b, i) => i > 0 && !b.text.startsWith('#') && !b.text.startsWith('|'));
  const tocTable = frontBlocks.find((b) => isTable(b.text.split('\n')));
  const meta = [];
  if (tocTable) {
    const rows = tocTable.text.split('\n').slice(2).map(cells);
    for (const r of rows) meta.push({ n: r[0], section: r[1], title: r[2], page: r[3], pdf: r[4] });
  }

  const seen = new Map();
  const chapters = heads.map((h, ci) => {
    const bodyStart = h.off + h.len + 1;
    const bodyEnd = ci + 1 < heads.length ? heads[ci + 1].off : src.length;
    const blocks = splitRaw(src.slice(bodyStart, bodyEnd), bodyStart);
    const items = groupItems(blocks);
    const m = meta[ci] || {};
    for (const it of items) {
      it.start = it.blocks[0].start;
      it.end = it.blocks[it.blocks.length - 1].end;
      it.text = src.slice(it.start, it.end);
      if (EDITABLE.has(it.kind)) {
        const base = 'b' + fnv1a(normalize(it.text));
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        it.id = n === 1 ? base : `${base}-${n}`;
        it.occurrence = n;
      }
    }
    const chHash = 'c' + fnv1a(h.title + '#' + ci);
    return { idx: ci + 1, id: `ch${ci + 1}`, key: chHash, title: h.title, section: m.section || 'অন্যান্য', page: m.page || '', pdf: m.pdf || '', start: h.off, items };
  });

  const pages = chapters.reduce((n, c) => n + c.items.filter((i) => i.kind === 'page').length, 0);
  return { title, intro: intro ? intro.text : '', chapters, pages };
}

export function renderChapter(ch) {
  let html = `<section class="chapter" id="${ch.id}" data-sec="${esc(ch.section)}" data-ckey="${ch.key}">`;
  html += `<header class="ch-head"><span class="ch-sec">${esc(ch.section)}</span><h1>${inline(ch.title)}</h1>`;
  html += `<span class="ch-meta">${ch.page ? 'মুদ্রিত পৃষ্ঠা ' + esc(ch.page) : ''}${ch.pdf ? ' · PDF ' + esc(ch.pdf) : ''}</span></header>\n`;
  const sources = [];
  for (const it of ch.items) {
    switch (it.kind) {
      case 'page':
        html += `<div class="pg" id="p${it.pdf}"><span>পৃষ্ঠা ${esc(it.label)}</span><a href="#p${it.pdf}">PDF ${it.pdf}</a></div>\n`;
        break;
      case 'rh':
        html += `<div class="rh">${inline(it.text.trim())}</div>\n`;
        break;
      case 'hr':
        break;
      case 'comment': {
        const m = it.text.match(/<!--\s*উৎস\s*[:：]([\s\S]*?)-->/);
        if (m) m[1].split(/\s;\s|\s*\n\s*/).map((s) => s.trim()).filter(Boolean).forEach((s) => sources.push(s));
        break;
      }
      case 'heading':
        html += `<div class="it" data-bid="${it.id}" data-kind="heading"><h${it.level}>${inline(it.title)}</h${it.level}></div>\n`;
        break;
      default:
        html += `<div class="it it-${it.kind}" data-bid="${it.id}" data-kind="${it.kind}">` + it.blocks.map((b) => renderRaw(b.text)).join('\n') + '</div>\n';
    }
  }
  if (sources.length) {
    html += `<details class="src"><summary>উৎস (${sources.length})</summary><ul>` +
      sources.map((s) => (/^https?:\/\//.test(s) ? `<li><a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a></li>` : `<li>${esc(s)}</li>`)).join('') +
      '</ul></details>';
  }
  return html + '</section>\n';
}
