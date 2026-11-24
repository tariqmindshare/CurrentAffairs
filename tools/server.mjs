#!/usr/bin/env node
// Local preview + admin API. Binds to 127.0.0.1 only.
//   node tools/server.mjs            → http://127.0.0.1:8080
//   PORT=9000 node tools/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT, loadQueue, saveQueue, sanitizeEdit, removePassage, sourceFor } from './lib/edits.mjs';
import { verify } from './user.mjs';
import { build } from './build.mjs';

const PORT = +process.env.PORT || 8080;
const HOST = '127.0.0.1';
const TTL = 8 * 3600 * 1000;
const sessions = new Map(); // token → {user, exp}
const job = { running: false, log: '', startedAt: null, endedAt: null, code: null };

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, bad) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 2e6) req.destroy(); });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } });
  });
}
function auth(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { sessions.delete(t); return null; }
  return s.user;
}

function claudePrompt() {
  const md = fs.readFileSync(path.join(ROOT, '.claude', 'commands', 'apply-edits.md'), 'utf8');
  return md.replace(/^---[\s\S]*?---\s*/, '');
}

function runClaude() {
  if (job.running) return false;
  Object.assign(job, { running: true, log: '', startedAt: new Date().toISOString(), endedAt: null, code: null });
  const args = ['-p', '--permission-mode', 'acceptEdits', '--allowedTools',
    'Read,Edit,Write,Grep,Glob,Bash(node tools/apply-edits.mjs:*),Bash(node tools/build.mjs:*)'];
  let child;
  try {
    child = spawn(process.env.CLAUDE_BIN || 'claude', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    Object.assign(job, { running: false, code: -1, log: 'claude CLI চালু করা যায়নি: ' + e.message, endedAt: new Date().toISOString() });
    return true;
  }
  const add = (d) => { job.log = (job.log + d.toString()).slice(-20000); };
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  child.on('error', (e) => { add('\n[error] ' + e.message + '\nClaude Code CLI (claude) PATH-এ আছে কি না দেখুন।'); });
  child.on('close', (code) => {
    Object.assign(job, { running: false, code, endedAt: new Date().toISOString() });
    try { build({ quiet: true }); } catch (e) { add('\n[build error] ' + e.message); }
  });
  child.stdin.end(claudePrompt());
  return true;
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health') return send(res, 200, { mode: 'server' });
  if (p === '/api/login' && req.method === 'POST') {
    const { username, password } = await readBody(req);
    if (!verify(username, password)) return send(res, 401, { error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { user: username, exp: Date.now() + TTL });
    return send(res, 200, { token, user: username, exp: Date.now() + TTL });
  }
  const user = auth(req);
  if (!user) return send(res, 401, { error: 'লগইন প্রয়োজন' });

  if (p === '/api/logout' && req.method === 'POST') {
    sessions.delete((req.headers.authorization || '').replace(/^Bearer\s+/, ''));
    return send(res, 200, { ok: true });
  }
  if (p === '/api/edits' && req.method === 'GET') return send(res, 200, loadQueue());
  if (p === '/api/edits' && req.method === 'POST') {
    let e;
    try { e = sanitizeEdit(await readBody(req), user); } catch (err) { return send(res, 400, { error: err.message }); }
    const q = loadQueue();
    if (e.type === 'delete') {
      // local mode: deletions are mechanical → apply immediately
      const src = sourceFor(e.issue);
      const ok = src && removePassage(src, e.text, e.occurrence);
      e.status = ok ? 'applied' : 'failed';
      e.result = ok ? 'মুছে ফেলা হয়েছে' : 'উৎস ফাইলে লেখাটি পাওয়া যায়নি';
      e.appliedAt = new Date().toISOString();
      q.edits.push(e);
      saveQueue(q);
      if (ok) build({ quiet: true });
      return send(res, ok ? 200 : 409, { edit: e });
    }
    q.edits.push(e);
    saveQueue(q);
    return send(res, 200, { edit: e });
  }
  const m = p.match(/^\/api\/edits\/(e_[a-z0-9]+)$/);
  if (m && req.method === 'DELETE') {
    const q = loadQueue();
    const i = q.edits.findIndex((x) => x.id === m[1] && x.status === 'pending');
    if (i < 0) return send(res, 404, { error: 'not found or not pending' });
    q.edits.splice(i, 1);
    saveQueue(q);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/apply' && req.method === 'POST') {
    const pending = loadQueue().edits.filter((x) => x.status === 'pending').length;
    if (!pending) return send(res, 200, { started: false, message: 'অপেক্ষমাণ কোনো নির্দেশনা নেই' });
    return send(res, 200, { started: runClaude() });
  }
  if (p === '/api/status') return send(res, 200, job);
  return send(res, 404, { error: 'unknown endpoint' });
}

function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'bad url', 'text/plain'); }
  let file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
  const rp = path.relative(ROOT, file).split(path.sep)[0];
  if (['.git', 'tools', '.claude', '.github'].includes(rp) || /credentials/i.test(file)) return send(res, 403, 'forbidden', 'text/plain');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, HOST, () => {
  build({ quiet: true });
  console.log(`Current Affairs site → http://${HOST}:${PORT}/   (admin: /admin.html)`);
});
