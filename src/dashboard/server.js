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
const pages = require('./pages');
const { apply, applyPanel } = require('./actions');
const panels = require('../lib/panels');
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
  return { base, secret, port, secure: url.protocol === 'https:' };
}

/** Can this person change this server's settings? */
async function memberWithAccess(guild, userId) {
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) return null;
  const ok = guild.ownerId === userId || member.permissions.has(PermissionFlagsBits.ManageGuild);
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

const flashes = new Map(); // session csrf -> { ok, text } shown once

function createHandler(client, config) {
  const send = (res, status, html, headers = {}) => {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https://cdn.discordapp.com; form-action 'self'; frame-ancestors 'none'",
      ...headers,
    });
    res.end(html);
  };
  const redirect = (res, location, headers = {}) => {
    res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers });
    res.end();
  };

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, config.base);
      const session = auth.getSession(req);
      const user = session?.user;

      if (req.method === 'GET' && url.pathname === '/login') {
        const state = crypto.randomBytes(16).toString('base64url');
        const params = new URLSearchParams({
          client_id: client.application.id, response_type: 'code', scope: 'identify',
          redirect_uri: `${config.base}/callback`, state,
        });
        return redirect(res, `https://discord.com/oauth2/authorize?${params}`, {
          'Set-Cookie': auth.cookie('pb_state', auth.sign(state), { maxAge: 600, secure: config.secure }),
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
        const profile = await auth.fetchDiscordUser({ code, clientId: client.application.id, clientSecret: config.secret, redirectUri: `${config.base}/callback` });
        return redirect(res, '/', {
          'Set-Cookie': [
            auth.cookie('pb_session', auth.createSession(profile), { maxAge: 7 * 86400, secure: config.secure }),
            auth.cookie('pb_state', '', { maxAge: 0, secure: config.secure }),
          ],
        });
      }

      if (url.pathname === '/logout') {
        auth.destroySession(req);
        return redirect(res, '/', { 'Set-Cookie': auth.cookie('pb_session', '', { maxAge: 0, secure: config.secure }) });
      }

      if (!user) {
        if (req.method === 'GET' && url.pathname === '/') return send(res, 200, pages.landing());
        return redirect(res, '/');
      }

      if (req.method === 'GET' && url.pathname === '/') {
        const guilds = [];
        for (const guild of client.guilds.cache.values()) {
          if (await memberWithAccess(guild, user.id)) {
            guilds.push({ id: guild.id, name: guild.name, memberCount: guild.memberCount, icon: guild.iconURL?.({ size: 64 }) ?? null });
          }
        }
        return send(res, 200, pages.serverList(user, guilds));
      }

      // /g/<server>                      settings page
      // /g/<server>/save/<section>         save a section (POST)
      // /g/<server>/panel/<id>             edit a panel
      // /g/<server>/panel/<id>/<action>    save/duplicate/delete a panel (POST)
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

        if (req.method === 'POST' && (area === 'save' || (panel && action))) {
          const form = parseForm(await readBody(req));
          if (!auth.csrfOk(session, form.csrf)) {
            const e = pages.errorPage(user, 'That form expired. Go back, refresh the page and try again.', 403);
            return send(res, e.status, e.html);
          }
          const result = panel ? await applyPanel(guild, member, panel, action, form) : await apply(guild, member, target, form);
          flashes.set(session.csrf, result);
          console.log(`Dashboard: ${user.username} changed "${panel ? `panel ${panel.id} ${action}` : target}" in ${guild.name} (${result.ok ? 'saved' : result.text})`);
          const anchor = target.startsWith('schedule') ? 'schedule' : target.startsWith('command') ? 'commands' : target;
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
  server.listen(config.port, '0.0.0.0', () => console.log(`Dashboard is running at ${config.base}`));
  return server;
}

module.exports = { start, createHandler, settingsFromEnv, parseForm };
