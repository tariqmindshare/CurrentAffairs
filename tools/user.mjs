#!/usr/bin/env node
// File-based admin user store (data/users.json), PBKDF2-SHA256.
//   node tools/user.mjs add <username> [password]     (random password if omitted)
//   node tools/user.mjs passwd <username> <password>
//   node tools/user.mjs remove <username>
//   node tools/user.mjs list
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'users.json');
export const ITER = 100000;

export function loadUsers() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: [] }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');
}
export function hashPassword(password, saltHex = crypto.randomBytes(16).toString('hex'), iterations = ITER) {
  const hash = crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
  return { salt: saltHex, iterations, hash };
}
export function verify(username, password) {
  const u = loadUsers().users.find((x) => x.username === username);
  if (!u || typeof password !== 'string') return false;
  const { hash } = hashPassword(password, u.salt, u.iterations);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.hash, 'hex'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, name, pw] = process.argv.slice(2);
  const db = loadUsers();
  const idx = db.users.findIndex((u) => u.username === name);
  if (cmd === 'list') {
    db.users.forEach((u) => console.log(u.username));
  } else if ((cmd === 'add' || cmd === 'passwd') && name) {
    if (cmd === 'add' && idx >= 0) { console.error('user exists; use passwd'); process.exit(1); }
    if (cmd === 'passwd' && idx < 0) { console.error('no such user'); process.exit(1); }
    const password = pw || crypto.randomBytes(9).toString('base64url');
    const rec = { username: name, ...hashPassword(password) };
    if (idx >= 0) db.users[idx] = rec; else db.users.push(rec);
    save(db);
    console.log(`✓ ${cmd === 'add' ? 'added' : 'updated'} ${name}${pw ? '' : `\n  password: ${password}`}`);
  } else if (cmd === 'remove' && name) {
    if (idx < 0) { console.error('no such user'); process.exit(1); }
    db.users.splice(idx, 1);
    save(db);
    console.log('✓ removed ' + name);
  } else {
    console.log('usage: node tools/user.mjs add|passwd|remove|list <username> [password]');
  }
}
