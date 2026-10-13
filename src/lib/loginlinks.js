// One-time backup login links, for when you can't log in the normal way.
//
// A link logs you in as the account that made it - nothing more. What you can
// open after that is still decided by the normal dashboard rules (Manage
// Server, extra access, "only me"), so a link never grants access by itself.
// Only a hash of each link is saved, so even data/db.json can't be used to log in.
const crypto = require('node:crypto');
const db = require('./storage');

const LIFETIME = 365 * 86_400_000; // a year, but each link works only once
const PER_USER = 3;
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function all() {
  db.data.loginLinks ??= {};
  const links = db.data.loginLinks;
  for (const [key, link] of Object.entries(links)) if (Date.now() > link.expires) delete links[key];
  return links;
}

/** Makes a new link for a user. Returns the secret token (shown once, never stored). */
function create(user) {
  const links = all();
  const mine = Object.entries(links).filter(([, l]) => l.userId === user.id).sort((a, b) => a[1].created - b[1].created);
  while (mine.length >= PER_USER) delete links[mine.shift()[0]]; // oldest stops working
  const token = crypto.randomBytes(32).toString('base64url');
  links[hash(token)] = { userId: user.id, username: user.username, avatar: user.avatar ?? null, created: Date.now(), expires: Date.now() + LIFETIME };
  db.save();
  return token;
}

const valid = (token) => /^[A-Za-z0-9_-]{40,60}$/.test(String(token)) && Object.hasOwn(all(), hash(token));

/** Uses up a link. Returns the user it belongs to, or null. */
function use(token) {
  if (!valid(token)) return null;
  const links = all();
  const link = links[hash(token)];
  delete links[hash(token)];
  db.save();
  return { id: link.userId, username: link.username, avatar: link.avatar };
}

const countFor = (userId) => Object.values(all()).filter((l) => l.userId === userId).length;

function revokeAll(userId) {
  const links = all();
  for (const [key, l] of Object.entries(links)) if (l.userId === userId) delete links[key];
  db.save();
}

module.exports = { create, valid, use, countFor, revokeAll, PER_USER };
