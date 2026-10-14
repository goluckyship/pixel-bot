// Discord login for the dashboard: OAuth2 "identify" only, signed session cookies,
// and a CSRF token on every form.
const crypto = require('node:crypto');
const db = require('../lib/storage');

const SESSION_DAYS = 60; // and renewed every time you visit, so you stay logged in

/**
 * Logins are saved in data/db.json so a bot restart (or an update) doesn't log
 * everyone out. Only a random ID is kept in the browser cookie.
 */
const sessions = {
  all() {
    db.data.dashboardSessions ??= {};
    return db.data.dashboardSessions;
  },
  get(id) {
    return Object.hasOwn(this.all(), id) ? this.all()[id] : undefined;
  },
  set(id, session) {
    const all = this.all();
    for (const [key, value] of Object.entries(all)) if (Date.now() > value.expires) delete all[key];
    all[id] = session;
    db.save();
  },
  delete(id) {
    if (Object.hasOwn(this.all(), id)) {
      delete this.all()[id];
      db.save();
    }
  },
  clear() {
    db.data.dashboardSessions = {};
    db.save();
  },
};

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  db.data.dashboardSecret ??= crypto.randomBytes(32).toString('hex');
  db.save();
  return db.data.dashboardSecret;
}

const sign = (value) => `${value}.${crypto.createHmac('sha256', secret()).update(value).digest('base64url')}`;
function unsign(signed) {
  const dot = String(signed ?? '').lastIndexOf('.');
  if (dot < 1) return null;
  const value = signed.slice(0, dot);
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signed));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, secure }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge !== undefined ? `; Max-Age=${maxAge}` : ''}`;
}

function getSession(req) {
  const id = unsign(parseCookies(req.headers.cookie).pb_session);
  const session = id && sessions.get(id);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(id);
    return null;
  }
  // Renew it (at most once a day, so we're not writing the file on every click).
  const renewed = Date.now() + SESSION_DAYS * 86_400_000;
  if (renewed - session.expires > 86_400_000) {
    session.expires = renewed;
    db.save();
  }
  return session;
}

function createSession(user) {
  const id = crypto.randomBytes(24).toString('base64url');
  sessions.set(id, { user, csrf: crypto.randomBytes(24).toString('base64url'), expires: Date.now() + SESSION_DAYS * 86_400_000 });
  return sign(id);
}

function destroySession(req) {
  const id = unsign(parseCookies(req.headers.cookie).pb_session);
  if (id) sessions.delete(id);
}

function csrfOk(session, token) {
  if (!session || typeof token !== 'string') return false;
  const a = Buffer.from(session.csrf);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Exchanges the login code for the user's Discord profile. */
async function fetchDiscordUser({ code, clientId, clientSecret, redirectUri }) {
  if (typeof fetch !== 'function') throw new Error('This Node.js version is too old for the dashboard (needs 18+).');
  const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  if (!tokenResponse.ok) throw new Error(`Discord refused the login (${tokenResponse.status}). Check DISCORD_CLIENT_SECRET and the redirect in the Developer Portal.`);
  const { access_token: accessToken } = await tokenResponse.json();
  const userResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!userResponse.ok) throw new Error(`Could not read your Discord profile (${userResponse.status}).`);
  const user = await userResponse.json();
  return {
    id: user.id,
    username: user.global_name || user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
  };
}

/** How many devices a person is logged in on, and logging them all out. */
const devicesFor = (userId) => Object.values(sessions.all()).filter((x) => x.user?.id === userId && Date.now() < x.expires).length;
function logoutEverywhere(userId) {
  const all = sessions.all();
  for (const [id, x] of Object.entries(all)) if (x.user?.id === userId) delete all[id];
  db.save();
}

module.exports = { devicesFor, logoutEverywhere, SESSION_DAYS, sessions, sign, unsign, parseCookies, cookie, getSession, createSession, destroySession, csrfOk, fetchDiscordUser };
