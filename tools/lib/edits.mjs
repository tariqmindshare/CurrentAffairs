// Edit queue (data/edits.json) helpers + mechanical application of deletions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUEUE = path.join(ROOT, 'data', 'edits.json');

export function loadQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE, 'utf8')); } catch { return { edits: [] }; }
}
export function saveQueue(q) {
  fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
  fs.writeFileSync(QUEUE, JSON.stringify(q, null, 2) + '\n');
}

export function newId() {
  return 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const TYPES = new Set(['delete', 'instruction']);
// Validate + normalise an edit coming from the browser.
export function sanitizeEdit(e, user) {
  if (!e || !TYPES.has(e.type)) throw new Error('invalid type');
  for (const k of ['issue', 'blockId', 'text']) if (typeof e[k] !== 'string' || !e[k]) throw new Error('missing ' + k);
  if (e.type === 'instruction' && (typeof e.instruction !== 'string' || !e.instruction.trim())) throw new Error('missing instruction');
  return {
    id: typeof e.id === 'string' && /^e_[a-z0-9]+$/.test(e.id) ? e.id : newId(),
    type: e.type,
    scope: e.scope === 'chapter' ? 'chapter' : 'item',
    issue: e.issue.slice(0, 20),
    source: String(e.source || '').slice(0, 300),
    chapter: String(e.chapter || '').slice(0, 300),
    blockId: e.blockId.slice(0, 40),
    kind: String(e.kind || '').slice(0, 20),
    occurrence: Number.isInteger(e.occurrence) ? e.occurrence : 1,
    text: e.text.slice(0, 20000),
    instruction: e.type === 'instruction' ? e.instruction.trim().slice(0, 4000) : undefined,
    status: 'pending',
    createdAt: e.createdAt || new Date().toISOString(),
    by: user || e.by || 'admin',
  };
}

function nthIndexOf(hay, needle, n) {
  let i = -1;
  for (let k = 0; k < n; k++) {
    i = hay.indexOf(needle, i + 1);
    if (i < 0) return -1;
  }
  return i;
}

// Remove an exact markdown passage from a source file. Returns true when removed.
export function removePassage(srcPath, text, occurrence = 1) {
  const abs = path.resolve(ROOT, srcPath);
  const crlf = fs.readFileSync(abs, 'utf8').includes('\r\n');
  let src = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  const needle = text.replace(/\r\n/g, '\n');
  let i = nthIndexOf(src, needle, occurrence);
  if (i < 0) i = src.indexOf(needle);
  if (i < 0) return false;
  src = src.slice(0, i) + src.slice(i + needle.length).replace(/^\n+/, '');
  fs.writeFileSync(abs, crlf ? src.replace(/\n/g, '\r\n') : src);
  return true;
}

export function sourceFor(issueId) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'issues.config.json'), 'utf8'));
  return cfg.issues.find((x) => x.id === issueId)?.source;
}

// Apply all pending deletions in the queue. Returns {applied, failed}.
export function applyDeletes(q = loadQueue()) {
  let applied = 0, failed = 0;
  for (const e of q.edits) {
    if (e.type !== 'delete' || e.status !== 'pending') continue;
    const src = sourceFor(e.issue);
    if (src && removePassage(src, e.text, e.occurrence)) {
      e.status = 'applied'; e.appliedAt = new Date().toISOString(); e.result = 'মুছে ফেলা হয়েছে';
      applied++;
    } else {
      e.status = 'failed'; e.result = 'উৎস ফাইলে লেখাটি পাওয়া যায়নি (হয়তো আগেই বদলানো হয়েছে)';
      failed++;
    }
  }
  saveQueue(q);
  return { applied, failed };
}
