#!/usr/bin/env node
// Apply pending deletions from data/edits.json to the issue Markdown, rebuild the site,
// and list instructions still waiting for Claude.
//   node tools/apply-edits.mjs            apply deletes + rebuild + list pending instructions
//   node tools/apply-edits.mjs --list     only list pending instructions (JSON)
//   node tools/apply-edits.mjs --mark <id> applied|failed "<note>"
import { applyDeletes, loadQueue, saveQueue } from './lib/edits.mjs';
import { build } from './build.mjs';

const args = process.argv.slice(2);
const pending = (q) => q.edits.filter((e) => e.type === 'instruction' && e.status === 'pending');

if (args[0] === '--list') {
  console.log(JSON.stringify(pending(loadQueue()), null, 2));
} else if (args[0] === '--mark') {
  const [, id, status, note] = args;
  const q = loadQueue();
  const e = q.edits.find((x) => x.id === id);
  if (!e || !['applied', 'failed', 'pending'].includes(status)) { console.error('usage: --mark <id> applied|failed "<note>"'); process.exit(1); }
  e.status = status; e.result = note || ''; e.appliedAt = new Date().toISOString();
  saveQueue(q);
  console.log(`✓ ${id} → ${status}`);
} else {
  const r = applyDeletes();
  console.log(`deletes: ${r.applied} applied, ${r.failed} failed`);
  build({ quiet: true });
  console.log('✓ site rebuilt');
  const p = pending(loadQueue());
  console.log(`instructions pending for Claude: ${p.length}`);
  p.forEach((e) => console.log(`  ${e.id}  [${e.issue}] ${e.instruction.slice(0, 80)}`));
}
