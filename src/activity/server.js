// Web routes for the Pixel Arcade activity (Discord loads it inside an iframe).
//
// Developer Portal → Activities → URL Mappings: root "/" → this dashboard's
// address (e.g. pixelbot.wisp.uno). Discord opens "/?instance_id=…&frame_id=…",
// which serves the arcade; everything else lives under /activity/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const arcade = require('./arcade');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8' };
const tokens = new Map(); // our token -> { user, expires }
const TOKEN_LIFE = 12 * 3600_000;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com https://discordapp.com https://*.discordapp.com",
].join('; ');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 10_000) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function userFor(req) {
  const auth = String(req.headers.authorization ?? '');
  const t = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const entry = t && tokens.get(t);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.user;
}

function issue(user) {
  const token = crypto.randomBytes(24).toString('base64url');
  tokens.set(token, { user, expires: Date.now() + TOKEN_LIFE });
  if (tokens.size > 2000) tokens.delete(tokens.keys().next().value);
  return token;
}

/** Discord's activity login: swap the code for the player's profile. */
async function exchange(code, clientId, clientSecret) {
  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
  });
  if (!tokenRes.ok) throw new Error(`Discord said no (${tokenRes.status})`);
  const { access_token: accessToken } = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!meRes.ok) throw new Error(`Couldn't read your profile (${meRes.status})`);
  const me = await meRes.json();
  return { user: { id: me.id, username: me.global_name || me.username }, accessToken };
}

const validRoom = (id) => /^[\w.:-]{1,120}$/.test(String(id ?? ''));

const attr = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function page(clientId, web = null) {
  const extra = web ? ` data-mode="web" data-room="${attr(web.room)}" data-code="${attr(web.code)}" data-token="${attr(web.token)}"` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Pixel Arcade</title><link rel="icon" href="/activity/bot.svg"><link rel="stylesheet" href="/activity/arcade.css"></head>
<body data-client="${String(clientId).replace(/\D/g, '')}"${extra}><div id="app"><div class="boot"><div class="bot big"></div><p>Loading the arcade…</p></div></div>
<script src="/activity/discord.js"></script><script src="/activity/arcade.js"></script></body></html>`;
}

/**
 * Handles activity requests. Returns true if it answered.
 * ctx: { clientId, clientSecret }
 */
async function handle(req, res, url, ctx) {
  // Discord opens the activity at "/" with these in the address.
  if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('frame_id')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin' });
    res.end(page(ctx.clientId));
    return true;
  }
  if (!url.pathname.startsWith('/activity/')) return false;
  arcade.startTicker();
  const sub = url.pathname.slice('/activity/'.length);

  // Files: the arcade's own script and styles.
  if (req.method === 'GET' && /^[\w-]+\.(js|css|svg)$/.test(sub)) {
    const file = path.join(PUBLIC, sub);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(fs.readFileSync(file));
    return true;
  }

  if (req.method === 'POST' && sub === 'api/login') {
    const body = await readJson(req);
    if (!body.code || !ctx.clientSecret) { sendJson(res, 400, { error: 'Missing login code.' }); return true; }
    try {
      const { user, accessToken } = await exchange(String(body.code), ctx.clientId, ctx.clientSecret);
      sendJson(res, 200, { token: issue(user), user, accessToken });
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return true;
  }

  const user = userFor(req);
  if (!user) { sendJson(res, 401, { error: 'Please reopen the activity to log in again.' }); return true; }

  if (req.method === 'GET' && sub === 'api/state') {
    const id = url.searchParams.get('room');
    if (!validRoom(id)) { sendJson(res, 400, { error: 'Bad room.' }); return true; }
    const r = arcade.room(id);
    arcade.join(r, user);
    const since = Number(url.searchParams.get('since') ?? 0);
    await arcade.waitFor(r, since, since ? 15_000 : 0);
    arcade.join(r, user); // still here
    sendJson(res, 200, arcade.view(r, user.id));
    return true;
  }
  if (req.method === 'POST' && sub === 'api/act') {
    const body = await readJson(req);
    if (!validRoom(body.room)) { sendJson(res, 400, { error: 'Bad room.' }); return true; }
    const r = arcade.room(body.room);
    arcade.join(r, user);
    const error = arcade.act(r, user, body);
    sendJson(res, error ? 400 : 200, error ? { error } : arcade.view(r, user.id));
    return true;
  }
  sendJson(res, 404, { error: 'Not found.' });
  return true;
}

// ---------- playing in a normal browser tab (from the dashboard) ----------
const WEB_CSP = CSP.replace(/frame-ancestors [^;]+/, "frame-ancestors 'none'");
const cleanCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const newCode = () => Array.from(crypto.randomBytes(5), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

/** The arcade page for a logged-in dashboard user. code: a room code, or MAIN. */
function webPage(res, clientId, user, code) {
  const room = `web-${code}`;
  const token = issue({ id: user.id, username: user.username });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': WEB_CSP, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  res.end(page(clientId, { room, code, token }));
}

/** Who's in which web room right now (for the rooms page). */
function webRooms() {
  return [...arcade.rooms.values()].filter((r) => r.id.startsWith('web-') && r.players.size).map((r) => ({ code: r.id.slice(4), players: [...r.players.values()].map((p) => p.name), game: r.game && !r.game.finished ? arcade.GAMES[r.game.type]?.name : null }));
}

module.exports = { handle, CSP, tokens, issue, webPage, webRooms, cleanCode, newCode };
