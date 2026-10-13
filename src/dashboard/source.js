// The "Code" page: lets the bot owner read Pixel Bot's own code in the dashboard
// (handy where GitHub is blocked). It reads the files the bot is running right
// now, so it's always up to date. Secrets are never shown: only code files are
// listed, and .env, data/, node_modules/ and .git/ are always skipped.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'data', '.git', '.npm', '.cache']);
const SHOW = /\.(js|json|md|bat|example|gitignore)$|^\.gitignore$|^\.env\.example$/i;
const NEVER = /(^|\/)(\.env|env|\.env\.txt|env\.txt)$/i;
const MAX_BYTES = 1_000_000;

function walk(dir = ROOT, rel = '') {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(path.join(dir, entry.name), r));
    } else if (entry.isFile() && SHOW.test(entry.name) && !NEVER.test(r) && entry.name !== 'package-lock.json') {
      out.push(r);
    }
  }
  return out;
}

/** Every code file with its line count, plus totals. */
function list() {
  const files = walk().map((rel) => {
    let text = '';
    try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch {}
    return { path: rel, lines: text ? text.split('\n').length : 0, bytes: Buffer.byteLength(text) };
  });
  return { files, totalLines: files.reduce((n, f) => n + f.lines, 0) };
}

/** One file's text, only if it's in the list (so nothing else can be read). */
function read(rel) {
  const clean = String(rel ?? '').replace(/\\/g, '/');
  if (!walk().includes(clean)) return null;
  const full = path.resolve(ROOT, clean);
  if (!full.startsWith(ROOT + path.sep)) return null;
  const stat = fs.statSync(full);
  if (stat.size > MAX_BYTES) return { text: '(This file is too big to show here.)', modified: stat.mtimeMs };
  return { text: fs.readFileSync(full, 'utf8'), modified: stat.mtimeMs };
}

/** Lines matching a search, across every file (first 300 hits). */
function search(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  for (const rel of walk()) {
    const file = read(rel);
    if (!file) continue;
    file.text.split('\n').forEach((line, i) => {
      if (hits.length < 300 && line.toLowerCase().includes(q)) hits.push({ path: rel, line: i + 1, text: line.slice(0, 220) });
    });
  }
  return hits;
}

/** Which version is running (from .git, without running git). */
function version() {
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? head.slice(5) : null;
    let hash = ref ? null : head;
    if (ref) {
      try { hash = fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim(); } catch {
        const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
        hash = packed.split('\n').find((l) => l.endsWith(` ${ref}`))?.split(' ')[0] ?? null;
      }
    }
    // The last few updates the host pulled, newest first.
    let updates = [];
    try {
      updates = fs.readFileSync(path.join(ROOT, '.git', 'logs', 'HEAD'), 'utf8').trim().split('\n').reverse().slice(0, 8).map((l) => {
        const m = /^\S+ (\S+) .*?> (\d+) [+-]\d{4}\t(.*)$/.exec(l);
        return m ? { hash: m[1].slice(0, 7), when: Number(m[2]) * 1000, what: m[3] } : null;
      }).filter(Boolean);
    } catch {}
    return { hash: hash?.slice(0, 7) ?? null, updates };
  } catch {
    return { hash: null, updates: [] };
  }
}

module.exports = { ROOT, list, read, search, version };
