// Pixel Bot's web dashboard. Runs inside the bot, so it always sees the live server.
//
// It turns on when these are set (in the env file on your PC, or in the host's
// environment variables):
//   DASHBOARD_URL           the public address, e.g. http://node.wispbyte.com:1234
//   DISCORD_CLIENT_SECRET   Developer Portal → OAuth2 → Client Secret
// and DASHBOARD_URL + "/callback" is added under Developer Portal → OAuth2 → Redirects.
const http = require('node:http');
const crypto = require('node:crypto');
const { PermissionFlagsBits } = require('discord.js');
const auth = require('./auth');
const codes = require('../lib/logincodes');
const links = require('../lib/loginlinks');
const source = require('./source');
const runner = require('./runner');
const activity = require('../activity/server');
const runPages = require('./runpages');
const more = require('./morepages');
const userprefs = require('../lib/userprefs');
const pages = require('./pages');
const { apply, applyPanel } = require('./actions');
const panels = require('../lib/panels');
const owner = require('../lib/owner');
const { report } = require('../commands/utility/setup');

const MAX_BODY = 20 * 1024 * 1024; // big panels with lots of questions send a lot of fields

function settingsFromEnv() {
  const base = (process.env.DASHBOARD_URL ?? '').trim().replace(/\/+$/, '');
  const secret = (process.env.DISCORD_CLIENT_SECRET ?? '').trim();
  if (!base || !secret) return null;
  let url;
  try {
    url = new URL(base);
  } catch {
    return { error: `DASHBOARD_URL "${base}" isn't a valid address.` };
  }
  const port = Number(process.env.SERVER_PORT || process.env.PORT || url.port || 3000);
  // Extra addresses that also reach the dashboard (like a free pixelbot.wisp.uno
  // address). Each needs its own "/callback" redirect in the Developer Portal.
  const aliases = String(process.env.DASHBOARD_ALIASES ?? '').split(/[\s,]+/).map((a) => a.trim().replace(/\/+$/, '')).filter((a) => /^https?:\/\/[^/\s]+$/i.test(a));
  return { base, secret, port, secure: url.protocol === 'https:', aliases };
}

/** The address this visitor used (the main one, or one of the aliases), so logins come back to it. */
function siteFor(req, config) {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase();
  for (const base of [config.base, ...(config.aliases ?? [])]) {
    try {
      if (new URL(base).host.toLowerCase() === host) return { base, secure: base.startsWith('https:') };
    } catch {
      // ignore a malformed alias
    }
  }
  return { base: config.base, secure: config.secure };
}

/** Can this person change this server's settings? */
async function memberWithAccess(guild, userId) {
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) return null;
  const o = owner.settings();
  if (owner.isOwner(guild.client, userId)) return member; // you always get in
  if (o.onlyMe && require('../lib/settings').isHome(guild.id)) return null; // The Pixel Bassment's dashboard locked to the owner
  if (o.blocked.includes(userId)) return null;
  const ok = guild.ownerId === userId || member.permissions.has(PermissionFlagsBits.ManageGuild) || o.extraAccess.includes(userId);
  return ok ? member : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Form body -> { key: value | [values] } */
function parseForm(body) {
  const out = {};
  for (const [key, value] of new URLSearchParams(body)) {
    if (key in out) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

/** Which fold-up section a save belongs to (so it opens again afterwards). */
const sectionFor = (target) => (target.startsWith('owner-') ? 'owner' : target.startsWith('feat-') ? target.split('--')[0] : target.startsWith('schedule') ? 'schedule' : target.startsWith('command') ? 'commands' : target.startsWith('panel') ? 'panels' : target);

const flashes = new Map(); // session csrf -> { ok, text } shown once

function createHandler(client, config) {
  const imageCache = new Map();
  const pendingForms = new Map(); // forms a command opened on the dashboard, waiting to be filled in
  const send = (res, status, html, headers = {}) => {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://cdn.discordapp.com data:; form-action 'self'; frame-ancestors 'none'",
      ...headers,
    });
    // School networks block Discord's image server too, so pictures load through Pixel Bot.
    res.end(String(html).replace(/src="(https:\/\/cdn\.discordapp\.com\/[^"]+)"/g, (m, u) => `src="/img?u=${encodeURIComponent(u.replace(/&amp;/g, '&'))}"`));
  };
  const redirect = (res, location, headers = {}) => {
    res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers });
    res.end();
  };

  return async function handle(req, res) {
    try {
      const site = siteFor(req, config);
      const url = new URL(req.url, site.base);
      // The Pixel Arcade (Discord Activity) has its own pages and login.
      if (await activity.handle(req, res, url, { clientId: client.application.id, clientSecret: config.secret })) return;

      const session = auth.getSession(req);
      const user = session?.user ? { ...session.user, isOwner: owner.isOwner(client, session.user.id) } : null;

      if (req.method === 'GET' && url.pathname === '/login') {
        const state = crypto.randomBytes(16).toString('base64url');
        const params = new URLSearchParams({
          client_id: client.application.id, response_type: 'code', scope: 'identify', prompt: 'none', // skip Discord's "Authorize" screen after the first time
          redirect_uri: `${site.base}/callback`, state,
        });
        return redirect(res, `https://discord.com/oauth2/authorize?${params}`, {
          'Set-Cookie': auth.cookie('pb_state', auth.sign(state), { maxAge: 600, secure: site.secure }),
        });
      }

      if (req.method === 'GET' && url.pathname === '/callback') {
        const expected = auth.unsign(auth.parseCookies(req.headers.cookie).pb_state);
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (!expected || !state || state !== expected || !code) {
          const e = pages.errorPage(null, 'That login link expired or was already used. Please try again.');
          return send(res, e.status, e.html);
        }
        const profile = await auth.fetchDiscordUser({ code, clientId: client.application.id, clientSecret: config.secret, redirectUri: `${site.base}/callback` });
        return redirect(res, '/', {
          'Set-Cookie': [
            auth.cookie('pb_session', auth.createSession(profile), { maxAge: auth.SESSION_DAYS * 86400, secure: site.secure }),
            auth.cookie('pb_state', '', { maxAge: 0, secure: site.secure }),
          ],
        });
      }

      // One-time backup login links: /r/<secret>. A button press (not just opening
      // the link) uses it, so chat apps that preview links can't burn it.
      const linkMatch = /^\/r\/([A-Za-z0-9_-]{1,100})$/.exec(url.pathname);
      if (linkMatch) {
        const token = linkMatch[1];
        if (!links.valid(token)) {
          const e = pages.errorPage(null, 'That backup login link was already used, cancelled or has expired. Each link works once.', 404);
          return send(res, e.status, e.html);
        }
        if (req.method === 'GET') return send(res, 200, pages.linkLogin(token));
        if (req.method === 'POST') {
          const saved = links.use(token);
          if (!saved) return redirect(res, url.pathname);
          const fresh = await client.users?.fetch?.(saved.id).catch(() => null);
          const profile = fresh
            ? { id: fresh.id, username: fresh.globalName || fresh.username, avatar: fresh.avatar ? `https://cdn.discordapp.com/avatars/${fresh.id}/${fresh.avatar}.png?size=64` : null }
            : saved;
          owner.audit({ userId: profile.id, username: profile.username, guildId: null, what: 'Logged in with a backup link', ok: true, text: '' });
          console.log(`Dashboard: ${profile.username} logged in with a one-time backup link`);
          return redirect(res, '/account?used=1', {
            'Set-Cookie': auth.cookie('pb_session', auth.createSession(profile), { maxAge: auth.SESSION_DAYS * 86400, secure: site.secure }),
          });
        }
      }

      // Log in with a code (for computers where discord.com is blocked).
      if (req.method === 'GET' && url.pathname === '/code') {
        const secret = auth.unsign(auth.parseCookies(req.headers.cookie).pb_code);
        let state = url.searchParams.has('new') ? null : codes.status(secret);
        if (state?.user) {
          const profile = codes.take(secret);
          return redirect(res, '/', {
            'Set-Cookie': [
              auth.cookie('pb_session', auth.createSession(profile), { maxAge: auth.SESSION_DAYS * 86400, secure: site.secure }),
              auth.cookie('pb_code', '', { maxAge: 0, secure: site.secure }),
            ],
          });
        }
        if (user) return redirect(res, '/');
        const headers = {};
        if (!state) {
          const made = codes.create();
          headers['Set-Cookie'] = auth.cookie('pb_code', auth.sign(made.secret), { maxAge: codes.LIFETIME / 1000, secure: site.secure });
          state = { code: made.code, minutesLeft: codes.LIFETIME / 60_000 };
        }
        if (url.searchParams.has('new')) return redirect(res, '/code', headers);
        return send(res, 200, pages.codeLogin(state.code, state.minutesLeft), headers);
      }

      if (url.pathname === '/logout') {
        auth.destroySession(req);
        return redirect(res, '/', { 'Set-Cookie': auth.cookie('pb_session', '', { maxAge: 0, secure: site.secure }) });
      }

      // The desktop shortcut opens /start: straight in if you're logged in, otherwise to Discord's login.
      if (req.method === 'GET' && url.pathname === '/start') return redirect(res, user ? '/' : '/login');
      if (req.method === 'GET' && url.pathname === '/shortcut.url') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="Pixel Bot.url"', 'Cache-Control': 'no-store' });
        return res.end(`[InternetShortcut]\r\nURL=${(config.aliases?.[0] ?? site.base)}/start\r\n`);
      }

      // "Add to a server": Discord's own invite screen, with the permissions Pixel Bot needs.
      if (req.method === 'GET' && url.pathname === '/invite') {
        return redirect(res, require('../lib/invite').inviteLink(client, url.searchParams.get('server')?.match(/^\d{15,25}$/)?.[0]));
      }

      // ---------- pages anyone can open ----------
      if (req.method === 'GET' && url.pathname === '/help') return send(res, 200, more.help(user));
      if (req.method === 'GET' && url.pathname === '/status') {
        let members = 0;
        for (const g of client.guilds.cache.values()) members += g.memberCount ?? 0;
        const v = source.version();
        const info = {
          online: Boolean(client.isReady?.() ?? client.user), ping: Math.max(0, Math.round(client.ws?.ping ?? 0)), uptime: client.uptime ?? process.uptime() * 1000,
          servers: client.guilds.cache.size, members, games: activity.liveGames?.() ?? 0, memory: Math.round(process.memoryUsage().rss / 1048576),
          version: v.hash, updated: v.changes?.[0] ? `${v.changes[0].text} (${new Date(v.changes[0].when).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })})` : null,
        };
        if (user && owner.isOwner(client, user.id)) info.crashes = require('../lib/crashlog').read();
        return send(res, 200, more.status(user, info));
      }

      // Guest arcade: play without Discord. Guests only ever get an arcade pass, never the dashboard.
      const guest = (() => {
        const raw = auth.unsign(auth.parseCookies(req.headers.cookie).pb_guest);
        const m = /^(g-[A-Za-z0-9_-]{8,30})\|(.{1,20})$/s.exec(raw ?? '');
        return m ? { id: m[1], name: m[2] } : null;
      })();
      const joinCode = (c) => activity.cleanCode(c) || 'MAIN';
      if (url.pathname === '/play') {
        if (req.method === 'POST') {
          const form = parseForm(await readBody(req));
          const name = String(form.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
          if (!name) return send(res, 400, more.guestPlay(user, null, form.code, 'Type a name first.'));
          const id = guest?.id ?? `g-${crypto.randomBytes(9).toString('base64url')}`;
          return redirect(res, `/play/room?room=${joinCode(form.code || form.room)}`, {
            'Set-Cookie': auth.cookie('pb_guest', auth.sign(`${id}|${name}`), { maxAge: 30 * 86400, secure: site.secure }),
          });
        }
        if (guest && !user && url.searchParams.get('room')) return redirect(res, `/play/room?room=${joinCode(url.searchParams.get('room'))}`);
        return send(res, 200, more.guestPlay(user, guest, activity.cleanCode(url.searchParams.get('room')), null));
      }
      if (req.method === 'GET' && url.pathname === '/play/room') {
        const code = joinCode(url.searchParams.get('room'));
        if (user) return redirect(res, `/arcade/play?room=${code}`);
        if (!guest) return redirect(res, `/play?room=${code}`);
        return activity.webPage(res, client.application.id, { id: guest.id, username: `${guest.name} (guest)` }, code, { guest: true });
      }
      // Share links: pixelbot.wisp.uno/join/CODE works for everyone.
      const joinMatch = /^\/join\/([A-Za-z0-9]{1,8})$/.exec(url.pathname);
      if (req.method === 'GET' && joinMatch) return redirect(res, user ? `/arcade/play?room=${joinCode(joinMatch[1])}` : `/play?room=${joinCode(joinMatch[1])}`);

      if (!user) {
        if (req.method === 'GET' && url.pathname === '/') return send(res, 200, more.home());
        return redirect(res, '/');
      }

      // Pixel Arcade in a normal tab: /arcade (pick a room), /arcade/play?room=CODE, /arcade/new
      if (req.method === 'GET' && url.pathname === '/arcade') return send(res, 200, pages.arcadeRooms(user, activity.webRooms()));
      if (req.method === 'GET' && url.pathname === '/arcade/new') return redirect(res, `/arcade/play?room=${activity.newCode()}`);
      if (req.method === 'GET' && url.pathname === '/arcade/play') {
        const code = activity.cleanCode(url.searchParams.get('room')) || 'MAIN';
        if (code !== url.searchParams.get('room')) return redirect(res, `/arcade/play?room=${code}`);
        return activity.webPage(res, client.application.id, user, code);
      }

      // Your account: make or cancel one-time backup login links.
      // Your own look.
      if (url.pathname === '/me/look') {
        if (req.method === 'POST') {
          const form = parseForm(await readBody(req));
          if (!auth.csrfOk(session, form.csrf)) return send(res, 403, more.appearance(user, session.csrf, userprefs.get(user.id), { ok: false, text: 'That form expired. Try again.' }));
          const html = require('./html');
          const okKey = (record, v) => (Object.hasOwn(record, v) ? v : '');
          const values = form.reset ? {} : {
            preset: okKey(html.PRESETS, form.preset), mode: okKey(html.MODES, form.mode), font: okKey(html.FONTS, form.font), corners: okKey(html.CORNERS, form.corners),
            textSize: okKey(html.TEXT_SIZES, form.textSize), motion: okKey(html.MOTIONS, form.motion), width: okKey(html.WIDTHS, form.width),
            accent: form.accent_default ? '' : (/^#[0-9a-f]{6}$/i.test(form.accent ?? '') ? form.accent : ''),
          };
          userprefs.set(user.id, values);
          return send(res, 200, more.appearance(user, session.csrf, userprefs.get(user.id), { ok: true, text: form.reset ? 'Back to the default look.' : 'Saved! This is your look on every device.' }));
        }
        return send(res, 200, more.appearance(user, session.csrf, userprefs.get(user.id), null));
      }
      if (req.method === 'POST' && url.pathname === '/account/logout-all') {
        const form = parseForm(await readBody(req));
        if (!auth.csrfOk(session, form.csrf)) return redirect(res, '/account');
        auth.logoutEverywhere(user.id);
        owner.audit({ userId: user.id, username: user.username, guildId: null, what: 'Logged out everywhere', ok: true, text: '' });
        return redirect(res, '/', { 'Set-Cookie': auth.cookie('pb_session', '', { maxAge: 0, secure: site.secure }) });
      }

      if (url.pathname === '/account' || url.pathname === '/account/link' || url.pathname === '/account/revoke') {
        let hasAccess = owner.isOwner(client, user.id);
        for (const guild of client.guilds.cache.values()) if (!hasAccess && (await memberWithAccess(guild, user.id))) hasAccess = true;
        if (req.method === 'GET' && url.pathname === '/account') {
          return send(res, 200, pages.account(user, session.csrf, { hasAccess, count: links.countFor(user.id), max: links.PER_USER, used: url.searchParams.has('used'), devices: auth.devicesFor(user.id) }));
        }
        if (req.method === 'POST') {
          const form = parseForm(await readBody(req));
          if (!auth.csrfOk(session, form.csrf)) {
            const e = pages.errorPage(user, 'That form expired. Go back, refresh the page and try again.', 403);
            return send(res, e.status, e.html);
          }
          if (url.pathname === '/account/revoke') {
            links.revokeAll(user.id);
            owner.audit({ userId: user.id, username: user.username, guildId: null, what: 'Cancelled backup login links', ok: true, text: '' });
            return redirect(res, '/account');
          }
          if (!hasAccess) {
            const e = pages.errorPage(user, 'Backup login links are only for people who can use the dashboard.', 403);
            return send(res, e.status, e.html);
          }
          const token = links.create(user);
          owner.audit({ userId: user.id, username: user.username, guildId: null, what: 'Made a backup login link', ok: true, text: '' });
          return send(res, 200, pages.linkMade(user, `${config.aliases?.[0] ?? site.base}/r/${token}`));
        }
      }

      // The Code page (bot owner only): Pixel Bot's own files, read live.
      if (req.method === 'GET' && (url.pathname === '/source' || url.pathname === '/source/view')) {
        if (!user.isOwner) {
          const e = pages.errorPage(user, 'Only the bot owner can see the code page.', 403);
          return send(res, e.status, e.html);
        }
        if (url.pathname === '/source') {
          const q = url.searchParams.get('q')?.slice(0, 100) ?? '';
          return send(res, 200, pages.sourceList(user, source.list(), source.version(), q, q ? source.search(q) : []));
        }
        const rel = url.searchParams.get('p') ?? '';
        const file = source.read(rel);
        if (!file) {
          const e = pages.errorPage(user, 'That file isn\'t part of the code (or was removed).', 404);
          return send(res, e.status, e.html);
        }
        return send(res, 200, pages.sourceFile(user, rel, file.text));
      }

      // Discord pictures (avatars, server icons) fetched by the bot for people whose
      // network blocks Discord. Only Discord's image server, only when logged in.
      if (req.method === 'GET' && url.pathname === '/img') {
        let target;
        try { target = new URL(url.searchParams.get('u') ?? ''); } catch {}
        if (!target || target.protocol !== 'https:' || target.hostname !== 'cdn.discordapp.com') { res.writeHead(404); return res.end(); }
        const hit = imageCache.get(target.href);
        const image = hit ?? (await fetch(target.href).then(async (r) => (r.ok ? { type: r.headers.get('content-type') || 'image/png', body: Buffer.from(await r.arrayBuffer()) } : null)).catch(() => null));
        if (!image || !/^image\//.test(image.type) || image.body.length > 2_000_000) { res.writeHead(404); return res.end(); }
        if (!hit) { imageCache.set(target.href, image); if (imageCache.size > 200) imageCache.delete(imageCache.keys().next().value); }
        res.writeHead(200, { 'Content-Type': image.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        return res.end(image.body);
      }

      if (req.method === 'GET' && url.pathname === '/') {
        const guilds = [];
        for (const guild of client.guilds.cache.values()) {
          if (await memberWithAccess(guild, user.id)) {
            guilds.push({ id: guild.id, name: guild.name, memberCount: guild.memberCount, icon: guild.iconURL?.({ size: 64 }) ?? null });
          }
        }
        if (guilds.length === 1 && !url.searchParams.has('all')) return redirect(res, `/g/${guilds[0].id}`);
        return send(res, 200, pages.serverList(user, guilds));
      }

      // /g/<server>                      settings page
      // /g/<server>/save/<section>         save a section (POST)
      // /g/<server>/panel/<id>             edit a panel
      // /g/<server>/panel/<id>/<action>    save/duplicate/delete a panel (POST)
      // /g/<server>/run                 list of commands
      // /g/<server>/run/<command>       its form (GET) / run it (POST)
      // /g/<server>/run/<command>/form  answer a form the command opened (POST)
      const runMatch = /^\/g\/(\d+)\/run(?:\/([\w-]{1,32})(\/form)?)?$/.exec(url.pathname);
      if (runMatch) {
        const [, guildId, name, isForm] = runMatch;
        const guild = client.guilds.cache.get(guildId);
        const access = guild && (await memberWithAccess(guild, user.id));
        const member = guild && (await guild.members.fetch(user.id).catch(() => null));
        if (!access || !member) {
          const e = pages.errorPage(user, access ? 'You need to be a member of that server to run its commands.' : 'You need the Manage Server permission in that server.', 403);
          return send(res, e.status, e.html);
        }
        const commands = runner.commandList(client, guild.id).filter((c) => runner.allowed(member, c.json));
        if (!name) return send(res, 200, runPages.listPage(user, guild, commands, url.searchParams.get('q')?.slice(0, 50)));
        const command = commands.find((c) => c.name === name);
        if (!command) {
          const e = pages.errorPage(user, 'That command doesn\'t exist, or you don\'t have the permission it needs.', 404);
          return send(res, e.status, e.html);
        }
        const defaultChannelId = guild.systemChannelId ?? [...guild.channels.cache.values()].find((c) => c.type === 0)?.id;
        if (req.method === 'GET' && !isForm) {
          if (guild.memberCount <= 2000) await guild.members.fetch().catch(() => null);
          const members = [...guild.members.cache.values()].filter((m) => !m.user.bot).sort((a, b) => a.displayName.localeCompare(b.displayName)).slice(0, 2000);
          const autocomplete = {};
          for (const v of runner.variants(command.json)) for (const o of v.options) if (o.autocomplete) autocomplete[o.name] = await runner.suggestions(client, guild, member, command.name, o.name);
          return send(res, 200, runPages.commandPage(user, guild, session.csrf, command, { members, autocomplete, defaultChannelId }));
        }
        if (req.method === 'POST') {
          const form = parseForm(await readBody(req));
          if (!auth.csrfOk(session, form.csrf)) {
            const e = pages.errorPage(user, 'That form expired. Go back, refresh the page and try again.', 403);
            return send(res, e.status, e.html);
          }
          const channel = guild.channels.cache.get(String(form.where ?? '')) ?? guild.channels.cache.get(defaultChannelId) ?? null;
          const post = form.post === '1';
          const perms = channel?.permissionsFor?.(member);
          if (!channel || !perms?.has(PermissionFlagsBits.ViewChannel) || (post && !perms.has(PermissionFlagsBits.SendMessages))) {
            const e = pages.errorPage(user, 'Pick a channel you can see (and post in, if you ticked "Also post").', 403);
            return send(res, e.status, e.html);
          }
          const again = `/g/${guild.id}/run/${command.name}`;
          let result;
          if (isForm) {
            const fieldValues = {};
            for (const [k, v] of Object.entries(form)) if (k.startsWith('f_')) fieldValues[k.slice(2)] = v;
            const customId = String(form.customId ?? '');
            const key = `${session.csrf}|${customId}`;
            const shownAt = pendingForms.get(key);
            pendingForms.delete(key);
            if (!customId.startsWith('pb:') || !shownAt || Date.now() - shownAt > 30 * 60_000) {
              const e = pages.errorPage(user, 'That form expired or was already sent. Run the command again.', 400);
              return send(res, e.status, e.html);
            }
            result = await runner.run({ client, guild, member, channel, mode: 'modal', commandName: command.name, customId, fieldValues, post });
          } else {
            const [group, sub] = String(form.v ?? '/').split('/');
            const values = {};
            for (const [k, v] of Object.entries(form)) if (k.startsWith('o_')) values[k.slice(2)] = Array.isArray(v) ? v[0] : v;
            const variant = runner.variants(command.json).find((x) => (x.group ?? '') === group && (x.sub ?? '') === sub);
            await runner.loadPicked(guild, variant?.options, values);
            result = await runner.run({ client, guild, member, channel, commandName: command.name, group: group || null, sub: sub || null, values, post });
          }
          if (result.modal?.customId) {
            pendingForms.set(`${session.csrf}|${result.modal.customId}`, Date.now());
            if (pendingForms.size > 500) pendingForms.delete(pendingForms.keys().next().value);
          }
          const label = `/${command.name}${isForm ? ' (form)' : ''}`;
          owner.audit({ userId: user.id, username: user.username, guildId: guild.id, what: `Ran ${label} from the dashboard`, ok: !result.error, text: result.error ?? '' });
          console.log(`Dashboard: ${user.username} ran ${label} in ${guild.name}${result.error ? ` (${result.error})` : ''}`);
          return send(res, 200, runPages.resultPage(user, guild, session.csrf, command, result, { channel, post, again }));
        }
      }

      const match = /^\/g\/(\d+)(?:\/(save|panel)\/([a-z0-9-]+)(?:\/([a-z]+))?)?$/.exec(url.pathname);
      if (match) {
        const [, guildId, area, target, action] = match;
        const guild = client.guilds.cache.get(guildId);
        const member = guild && (await memberWithAccess(guild, user.id));
        if (!member) {
          const e = pages.errorPage(user, 'You need the Manage Server permission in that server to change its settings.', 403);
          return send(res, e.status, e.html);
        }
        const panel = area === 'panel' ? panels.get(guild.id, target) : null;
        if (area === 'panel' && !panel) {
          const e = pages.errorPage(user, 'That panel was deleted.', 404);
          return send(res, e.status, e.html);
        }

        if (req.method === 'GET' && area === 'save' && target === 'backup') {
          if (!owner.isOwner(client, user.id)) {
            const e = pages.errorPage(user, 'Only the bot owner can download backups.', 403);
            return send(res, e.status, e.html);
          }
          const body = JSON.stringify(require('./actions').backupOf(guild), null, 2);
          const stamp = new Date().toISOString().slice(0, 10);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="pixel-bot-backup-${stamp}.json"`, 'Cache-Control': 'no-store' });
          return res.end(body);
        }

        if (req.method === 'POST' && (area === 'save' || (panel && action))) {
          const form = parseForm(await readBody(req));
          if (!auth.csrfOk(session, form.csrf)) {
            const e = pages.errorPage(user, 'That form expired. Go back, refresh the page and try again.', 403);
            return send(res, e.status, e.html);
          }
          const result = panel ? await applyPanel(guild, member, panel, action, form) : await apply(guild, member, target, form);
          flashes.set(session.csrf, { ...result, section: panel || target === 'refresh' ? null : sectionFor(target) });
          owner.audit({ userId: user.id, username: user.username, guildId: guild.id, what: panel ? `Panel "${panel.name}": ${action}` : target, ok: result.ok, text: result.text });
          console.log(`Dashboard: ${user.username} changed "${panel ? `panel ${panel.id} ${action}` : target}" in ${guild.name} (${result.ok ? 'saved' : result.text})`);
          const anchor = sectionFor(target);
          return redirect(res, result.redirect ?? `/g/${guild.id}#${anchor}`);
        }

        if (req.method === 'GET' && !action) {
          const flash = flashes.get(session.csrf);
          flashes.delete(session.csrf);
          if (panel) return send(res, 200, pages.panelPage({ guild, user, csrf: session.csrf, flash, panel }));
          if (!area) {
            return send(res, 200, pages.guildPage({
              guild, user, csrf: session.csrf, flash, problems: report(guild).problems,
              editingCommand: url.searchParams.get('cc') ?? null,
            }));
          }
        }
      }

      const e = pages.errorPage(user, 'Page not found.', 404);
      return send(res, e.status, e.html);
    } catch (error) {
      console.error('Dashboard error:', error);
      const e = pages.errorPage(null, error.message?.startsWith('Discord') || error.message?.startsWith('This Node') ? error.message : 'Something went wrong. Please try again.', 500);
      return send(res, e.status, e.html);
    }
  };
}

function start(client) {
  const config = settingsFromEnv();
  if (!config) {
    console.log('Dashboard is off. To turn it on, set DASHBOARD_URL and DISCORD_CLIENT_SECRET (see the README).');
    return null;
  }
  if (config.error) {
    console.warn(`Dashboard is off: ${config.error}`);
    return null;
  }
  const server = http.createServer(createHandler(client, config));
  server.on('error', (error) => console.warn(`Dashboard could not start on port ${config.port}: ${error.message}`));
  server.listen(config.port, '0.0.0.0', () => console.log(`Dashboard is running at ${[config.base, ...config.aliases].join(' and ')}`));
  return server;
}

module.exports = { start, createHandler, settingsFromEnv, siteFor, parseForm };
