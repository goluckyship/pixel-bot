// "Log in with a code": for computers where discord.com is blocked (like school).
// The dashboard shows a short code; you type /login <code> in Discord on your
// phone; the dashboard page then logs itself in as you.
//
// The code on screen only links a Discord account to that one browser (which
// holds a separate secret in a cookie), lasts 10 minutes, and works once.
const crypto = require('node:crypto');

const LIFETIME = 10 * 60_000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L mix-ups
const pending = new Map(); // secret -> { code, expires, user }
const tries = new Map(); // discord user id -> { count, until }

function sweep() {
  const now = Date.now();
  for (const [secret, entry] of pending) if (now > entry.expires) pending.delete(secret);
  for (const [id, t] of tries) if (now > t.until) tries.delete(id);
}

function makeCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
  } while ([...pending.values()].some((e) => e.code === code));
  return code;
}

/** A new code for a browser. Returns { secret, code }. */
function create() {
  sweep();
  if (pending.size > 500) pending.delete(pending.keys().next().value); // never grows without limit
  const secret = crypto.randomBytes(24).toString('base64url');
  const code = makeCode();
  pending.set(secret, { code, expires: Date.now() + LIFETIME, user: null });
  return { secret, code };
}

/** What a browser is waiting on (or null if its code expired). */
function status(secret) {
  sweep();
  const entry = secret ? pending.get(secret) : null;
  if (!entry) return null;
  return { code: entry.code, user: entry.user, minutesLeft: Math.max(1, Math.ceil((entry.expires - Date.now()) / 60_000)) };
}

/** Called by /login. Returns 'ok', 'wrong' or 'slow down'. */
function claim(input, user) {
  sweep();
  const t = tries.get(user.id) ?? { count: 0, until: Date.now() + LIFETIME };
  if (t.count >= 8) return 'slow down';
  const code = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const entry of pending.values()) {
    if (entry.code === code && !entry.user) {
      entry.user = user;
      tries.delete(user.id);
      return 'ok';
    }
  }
  t.count += 1;
  tries.set(user.id, t);
  return 'wrong';
}

/** Hands over the logged-in user once (the code can't be reused). */
function take(secret) {
  const entry = pending.get(secret);
  if (!entry?.user) return null;
  pending.delete(secret);
  return entry.user;
}

module.exports = { create, status, claim, take, LIFETIME };
