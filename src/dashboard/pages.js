// The dashboard's pages.
const { ChannelType } = require('discord.js');
const { esc, page, select, checks, toggle } = require('./html');
const db = require('../lib/storage');
const settings = require('../lib/settings');
const automod = require('../lib/automod');
const schedules = require('../lib/schedules');
const { findRole, findChannel, findCategory } = require('../lib/resolve');

/** Roles members can be given (not @everyone, not bot-managed), highest first. */
function roleOptions(guild) {
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name }));
}

function channelOptions(guild, types = [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
  return [...guild.channels.cache.values()]
    .filter((channel) => types.includes(channel.type))
    .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
    .map((channel) => ({ id: channel.id, name: channel.type === ChannelType.GuildCategory ? channel.name : `#${channel.name}` }));
}

/** Turns names-or-IDs from settings into IDs for the pickers. */
const roleIds = (guild, list) => (list ?? []).map((entry) => findRole(guild, entry)?.id).filter(Boolean);

function landing() {
  return page({
    title: 'Log in',
    body: `<h1>Pixel Bot dashboard</h1><p class="sub">Change Pixel Bot's settings from your browser. You need the <b>Manage Server</b> permission in a server to change its settings.</p>
<a class="button" href="/login">Log in with Discord</a>`,
  });
}

function serverList(user, guilds) {
  const items = guilds.length
    ? guilds.map((g) => `<a href="/g/${esc(g.id)}">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<span class="noicon">${esc(g.name[0])}</span>`}<span><b>${esc(g.name)}</b><br><span class="muted">${g.memberCount} members</span></span></a>`).join('')
    : '<p class="muted">You don\'t have Manage Server in any server Pixel Bot is in.</p>';
  return page({ title: 'Your servers', user, body: `<h1>Your servers</h1><p class="sub">Pick a server to change its settings.</p><div class="servers">${items}</div>` });
}

function errorPage(user, message, status = 400) {
  return { status, html: page({ title: 'Problem', user, body: `<h1>Something's not right</h1><p>${esc(message)}</p><p><a href="/">Back to the dashboard</a></p>` }) };
}

function section(id, title, help, inner, csrf, guildId) {
  return `<section class="card" id="${id}"><h2>${esc(title)}</h2><p class="help">${help}</p>
<form method="post" action="/g/${esc(guildId)}/save/${id}"><input type="hidden" name="csrf" value="${esc(csrf)}">${inner}<button type="submit">Save</button></form></section>`;
}

function guildPage({ guild, user, csrf, flash, problems }) {
  const s = settings.get(guild.id);
  const g = db.guild(guild.id);
  const roles = roleOptions(guild);
  const texts = channelOptions(guild);
  const categories = channelOptions(guild, [ChannelType.GuildCategory]);
  const rules = automod.settings(guild.id);
  const rankIds = s.ranks.map((entry) => findRole(guild, entry)?.id ?? '');
  const rankSelects = Array.from({ length: 8 }, (_, i) =>
    `<label>Rank ${i + 1}${i === 0 ? ' (lowest)' : ''}</label>${select(`rank${i}`, roles, rankIds[i])}`).join('');

  const scheduleRows = schedules.list(guild.id)
    .slice().sort((a, b) => a.nextAt - b.nextAt)
    .map((item) => `<tr><td>#${item.id}</td><td>${esc(new Date(item.nextAt).toLocaleString('en-US', { timeZone: s.timezone, dateStyle: 'medium', timeStyle: 'short' }))}${item.repeat !== 'none' ? `<br><span class="muted">repeats ${esc(item.repeat)}</span>` : ''}</td>
<td>#${esc(guild.channels.cache.get(item.channelId)?.name ?? 'deleted-channel')}</td><td>${esc((item.title ? `${item.title}: ` : '') + item.message).slice(0, 160)}</td>
<td><form method="post" action="/g/${esc(guild.id)}/save/schedule-remove"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="id" value="${item.id}"><button class="small" type="submit">Delete</button></form></td></tr>`).join('');

  const body = `
<h1>${esc(guild.name)}</h1><p class="sub">Changes take effect immediately. <a href="/">All servers</a></p>
${flash ? `<div class="flash ${flash.ok ? 'ok' : 'bad'}">${esc(flash.text)}</div>` : ''}
${problems.length ? `<div class="card problems"><h2>⚠️ Things to fix</h2><ul>${problems.map((p) => `<li>${esc(p.replace(/\*\*/g, '').replace(/<@&(\d+)>/g, (m, id) => guild.roles.cache.get(id)?.name ?? 'a role'))}</li>`).join('')}</ul></div>` : ''}
<nav class="jump"><a href="#welcome">Welcome</a><a href="#logs">Staff log</a><a href="#roles">Auto roles</a><a href="#ranks">Ranks</a><a href="#tickets">Tickets</a><a href="#automod">Automod</a><a href="#filter">Word filter</a><a href="#schedule">Scheduled messages</a></nav>

${section('welcome', 'Welcome message', 'Posted when someone joins. Use {user}, {username}, {server} and {count}.', `
${toggle('enabled', Boolean(g.welcome), 'Send welcome messages')}
<label>Channel</label>${select('channel', texts, g.welcome?.channelId ?? findChannel(guild, s.welcome.channel)?.id)}
<label>Message</label><textarea name="message" maxlength="1000">${esc(g.welcome?.message ?? s.welcome.message)}</textarea>`, csrf, guild.id)}

${section('logs', 'Staff log', 'Deleted and edited messages, role changes, timeouts, bans, channel/role/emoji changes and voice moves are posted here. Pixel Bot needs access to this channel.', `
<label>Log channel</label>${select('logChannel', texts, findChannel(guild, s.logChannel)?.id)}`, csrf, guild.id)}

${section('roles', 'Auto roles', 'Roles given automatically. Pixel Bot\'s role must be above every role it gives out.', `
<label>Give these roles to everyone who joins</label>${checks('autoroles', roles, roleIds(guild, s.autoroles))}
<label>Staff role</label>${select('staffRole', roles, findRole(guild, s.staffRole)?.id)}
<label>…given to anyone who has any of these roles</label>${checks('staffSourceRoles', roles, roleIds(guild, s.staffSourceRoles))}`, csrf, guild.id)}

${section('ranks', 'Staff ranks', 'The ladder for /promote and /demote, lowest first. Leave unused slots empty. Only the server owner can promote into, or demote out of, the top rank.', `
<div class="grid2">${rankSelects}</div>
<label>Who can use /promote and /demote (besides the owner and Administrators)</label>${checks('rankManagers', roles, roleIds(guild, s.rankManagers))}`, csrf, guild.id)}

${section('tickets', 'Tickets', 'After changing the panel text, run <code>/panel tickets</code> again to post the new version.', `
<div class="grid2"><div><label>Create tickets in category</label>${select('category', categories, findCategory(guild, s.tickets.category)?.id)}</div>
<div><label>Post transcripts in</label>${select('transcriptChannel', texts, findChannel(guild, s.tickets.transcriptChannel)?.id)}</div></div>
<label>Staff who can see and close tickets</label>${checks('staffRoles', roles, roleIds(guild, s.tickets.staffRoles))}
<label>Question asked when opening a ticket (max 45 characters)</label><input type="text" name="question" maxlength="45" value="${esc(s.tickets.question)}">
<label>Panel title</label><input type="text" name="panelTitle" maxlength="256" value="${esc(s.tickets.panelTitle)}">
<label>Panel text</label><textarea name="panelText" maxlength="2000">${esc(s.tickets.panelText)}</textarea>`, csrf, guild.id)}

${section('automod', 'Automod', 'Members with Manage Messages are never affected.', Object.entries(automod.FEATURES).map(([key, text]) => toggle(key, rules[key], text)).join(''), csrf, guild.id)}

${section('filter', 'Word filter', 'One word or phrase per line. Messages containing them are deleted.', `
<textarea name="words" maxlength="10000">${esc(g.filter.join('\n'))}</textarea>`, csrf, guild.id)}

<section class="card" id="schedule"><h2>Scheduled messages</h2><p class="help">Posted automatically. Times are ${esc(s.timezone)} time.</p>
${scheduleRows ? `<table><tr><th>#</th><th>When</th><th>Channel</th><th>Message</th><th></th></tr>${scheduleRows}</table>` : '<p class="muted">Nothing scheduled.</p>'}
<form method="post" action="/g/${esc(guild.id)}/save/schedule-add"><input type="hidden" name="csrf" value="${esc(csrf)}">
<div class="grid2"><div><label>Channel</label>${select('channel', texts, '', { blank: '— pick a channel —' })}</div>
<div><label>When</label><input type="text" name="when" maxlength="40" placeholder="in 2h, 6:30pm, tomorrow 9am, 10/31 7pm"></div></div>
<label>Repeat</label><select name="repeat"><option value="none">Once</option><option value="daily">Every day</option><option value="weekly">Every week</option></select>
<label>Title (optional, makes it a styled message)</label><input type="text" name="title" maxlength="256">
<label>Message</label><textarea name="message" maxlength="2000"></textarea>
<button type="submit">Schedule it</button></form></section>`;

  return page({ title: guild.name, user, body });
}

module.exports = { landing, serverList, guildPage, errorPage, roleOptions, channelOptions };
