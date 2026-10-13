// The dashboard's pages.
const { ChannelType } = require('discord.js');
const { esc, page, select, checks, toggle, input, textarea, hidden, colorInput, FONTS, CORNERS, MODES } = require('./html');
const questions = require('../lib/questions');
const db = require('../lib/storage');
const settings = require('../lib/settings');
const automod = require('../lib/automod');
const schedules = require('../lib/schedules');
const { findRole, findChannel, findCategory } = require('../lib/resolve');
const panels = require('../lib/panels');
const customCommands = require('../lib/customcommands');
const appearance = require('../lib/appearance');

const opts = (record) => Object.entries(record).map(([id, name]) => ({ id, name: typeof name === 'string' ? name : name.name }));

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

function panelsCard(guild, csrf) {
  const rows = panels.list(guild.id).map((p) => {
    const where = p.channelId ? `#${esc(guild.channels.cache.get(p.channelId)?.name ?? 'deleted-channel')}` : '<span class="muted">not posted</span>';
    const issues = panels.problems(guild, p).length;
    return `<tr><td>#${p.id}</td><td><a href="/g/${esc(guild.id)}/panel/${p.id}"><b>${esc(p.name)}</b></a>${issues ? '<span class="badge">⚠️ needs a fix</span>' : ''}</td>
<td>${p.type === 'roles' ? 'Roles' : 'Tickets'} · ${p.mode === 'dropdown' ? 'dropdown' : 'buttons'}</td><td>${p.items.length}</td><td>${where}</td>
<td><a class="small" href="/g/${esc(guild.id)}/panel/${p.id}">Edit</a></td></tr>`;
  }).join('');
  return `<section class="card" id="panels"><h2>Panels</h2><p class="help">Messages with buttons or a dropdown. Make as many as you like: role panels hand out roles, ticket panels open private tickets (each button can be a different kind of ticket). No limit on panels or options: Discord fits 25 buttons in one message, so bigger panels carry on in extra messages automatically.</p>
${rows ? `<table><tr><th>#</th><th>Name</th><th>Kind</th><th>Items</th><th>Posted in</th><th></th></tr>${rows}</table>` : '<p class="muted">No panels yet.</p>'}
<form method="post" action="/g/${esc(guild.id)}/save/panel-new">${hidden('csrf', csrf)}
<div class="grid2"><div><label>New panel name</label>${input('name', '', { placeholder: 'e.g. Colour roles, Support, Applications' })}</div>
<div><label>Kind</label>${select('type', [{ id: 'roles', name: 'Role panel' }, { id: 'tickets', name: 'Ticket panel' }], 'roles', { blank: null })}</div></div>
<button type="submit">Create panel</button></form></section>`;
}

function commandsCard(guild, csrf, roles, editing) {
  const all = customCommands.list(guild.id);
  const c = (editing && customCommands.find(guild.id, editing)) || {};
  const rows = all.map((cmd) => `<tr><td><b>/${esc(cmd.name)}</b><br><span class="muted">${esc(cmd.description)}</span></td><td>${esc((cmd.title ? `${cmd.title}: ` : '') + cmd.response).slice(0, 120)}</td><td>${cmd.uses ?? 0}</td>
<td><a class="small" href="/g/${esc(guild.id)}?cc=${encodeURIComponent(cmd.name)}#commands">Edit</a></td>
<td><form method="post" action="/g/${esc(guild.id)}/save/command-remove">${hidden('csrf', csrf)}${hidden('name', cmd.name)}<button class="small" type="submit">Delete</button></form></td></tr>`).join('');
  return `<section class="card" id="commands"><h2>Custom commands</h2><p class="help">Your own slash commands, like /rules or /socials. They autofill in Discord like the built-in ones. In the reply you can use {user}, {username}, {server}, {count} and {channel}. Saving with an existing name replaces that command.</p>
${rows ? `<table><tr><th>Command</th><th>Reply</th><th>Uses</th><th></th><th></th></tr>${rows}</table>` : '<p class="muted">No custom commands yet.</p>'}
<form method="post" action="/g/${esc(guild.id)}/save/command">${hidden('csrf', csrf)}
<h2 style="margin-top:16px">${c.name ? `Editing /${esc(c.name)}` : 'Add a command'}</h2>
<div class="grid2"><div><label>Name (what people type after /)</label>${input('name', c.name ?? '', { hard: 32, placeholder: 'rules' })}</div>
<div><label>Description (shown in the command list)</label>${input('description', c.description ?? '', { hard: 100, placeholder: 'Read the server rules' })}</div></div>
<label>Reply</label>${textarea('response', c.response ?? '')}
${toggle('asCard', c.asCard, 'Reply with a styled card instead of plain text')}
<div class="grid2"><div><label>Card title (optional)</label>${input('title', c.title ?? '')}</div>
<div><label>Card colour</label>${colorInput('color', c.color)}</div>
<div><label>Big image link (optional, https://…)</label>${input('image', c.image ?? '')}</div>
<div><label>Small image link (optional, https://…)</label>${input('thumbnail', c.thumbnail ?? '')}</div></div>
<label>Card footer (optional)</label>${input('footer', c.footer ?? '')}
${toggle('private', c.private, 'Only the person who used it sees the reply')}
<label>Also give or remove this role when used (optional)</label>${select('toggleRole', roles, c.toggleRole ?? '')}
<label>Only these roles can use it (leave all unticked for everyone)</label>${checks('allowedRoles', roles, c.allowedRoles ?? [])}
<button type="submit">Save command</button>${c.name ? ` <a class="small" href="/g/${esc(guild.id)}#commands">Cancel</a>` : ''}</form></section>`;
}

function guildPage({ guild, user, csrf, flash, problems, editingCommand }) {
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
<nav class="jump"><a href="#panels">Panels</a><a href="#commands">Custom commands</a><a href="#welcome">Welcome</a><a href="#goodbye">Goodbye</a><a href="#appearance">Appearance</a><a href="#logs">Staff log</a><a href="#roles">Auto roles</a><a href="#ranks">Ranks</a><a href="#tickets">Ticket defaults</a><a href="#automod">Automod</a><a href="#filter">Word filter</a><a href="#schedule">Scheduled messages</a></nav>

${panelsCard(guild, csrf)}

${commandsCard(guild, csrf, roles, editingCommand)}

${section('welcome', 'Welcome message', 'Posted when someone joins. Use {user} (a ping), {username}, {server} and {count}.', `
${toggle('enabled', Boolean(g.welcome), 'Send welcome messages')}
<label>Channel</label>${select('channel', texts, g.welcome?.channelId ?? findChannel(guild, s.welcome.channel)?.id)}
<label>Message</label>${textarea('message', g.welcome?.message ?? s.welcome.message)}
${toggle('plain', g.welcome?.plain, 'Plain text instead of a card')}
<div class="grid2"><div><label>Card title</label>${input('title', g.welcome?.title ?? '', { placeholder: 'Welcome, {username}!' })}</div>
<div><label>Card colour</label>${colorInput('color', g.welcome?.color)}</div>
<div><label>Big image or banner link (https://…)</label>${input('image', g.welcome?.image ?? '')}</div>
<div><label>Footer</label>${input('footer', g.welcome?.footer ?? '', { placeholder: 'Member #{count}' })}</div></div>
${toggle('showAvatar', g.welcome?.showAvatar !== false, "Show the new member's profile picture")}
${toggle('ping', g.welcome?.ping !== false, 'Ping the new member')}
<label>Also DM new members this (leave empty for no DM)</label>${textarea('dm', g.welcomeDm ?? '')}<p class="help">DMs are plain messages, so Discord caps them at 2,000 characters.</p>`, csrf, guild.id)}

${section('goodbye', 'Goodbye message', 'Posted when someone leaves. Use {username}, {server} and {count}.', `
${toggle('enabled', Boolean(g.goodbye), 'Send goodbye messages')}
<label>Channel</label>${select('channel', texts, g.goodbye?.channelId ?? g.welcome?.channelId)}
<label>Message</label>${textarea('message', g.goodbye?.message ?? '**{username}** left the server. We now have {count} members.')}
${toggle('plain', g.goodbye?.plain, 'Plain text instead of a card')}
<label>Card colour</label>${colorInput('color', g.goodbye?.color, { fallback: '#e5484d' })}`, csrf, guild.id)}

${appearanceCard(guild, user, csrf)}

${section('logs', 'Staff log', 'Deleted and edited messages, role changes, timeouts, bans, channel/role/emoji changes and voice moves are posted here. Pixel Bot needs access to this channel.', `
<label>Log channel</label>${select('logChannel', texts, findChannel(guild, s.logChannel)?.id)}`, csrf, guild.id)}

${section('roles', 'Auto roles', 'Roles given automatically. Pixel Bot\'s role must be above every role it gives out.', `
<label>Give these roles to everyone who joins</label>${checks('autoroles', roles, roleIds(guild, s.autoroles))}
<label>Staff role</label>${select('staffRole', roles, findRole(guild, s.staffRole)?.id)}
<label>…given to anyone who has any of these roles</label>${checks('staffSourceRoles', roles, roleIds(guild, s.staffSourceRoles))}`, csrf, guild.id)}

${section('ranks', 'Staff ranks', 'The ladder for /promote and /demote, lowest first. Leave unused slots empty. Only the server owner can promote into, or demote out of, the top rank.', `
<div class="grid2">${rankSelects}</div>
<label>Who can use /promote and /demote (besides the owner and Administrators)</label>${checks('rankManagers', roles, roleIds(guild, s.rankManagers))}`, csrf, guild.id)}

${section('tickets', 'Ticket defaults', 'Used by ticket panel buttons that don\'t pick their own category or staff. Ticket panels themselves are under Panels.', `
<div class="grid2"><div><label>Create tickets in category</label>${select('category', categories, findCategory(guild, s.tickets.category)?.id)}</div>
<div><label>Post transcripts in</label>${select('transcriptChannel', texts, findChannel(guild, s.tickets.transcriptChannel)?.id)}</div></div>
<label>Staff who can see and close tickets</label>${checks('staffRoles', roles, roleIds(guild, s.tickets.staffRoles))}`, csrf, guild.id)}

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

function appearanceCard(guild, user, csrf) {
  const b = appearance.settings();
  const owner = guild.ownerId === user.id;
  const color = Number.isInteger(b.color) ? `#${b.color.toString(16).padStart(6, '0')}` : '';
  const t = b.theme ?? {};
  const botWide = owner
    ? `<div class="grid2"><div><label>Status dot</label>${select('status', opts(appearance.STATUSES), b.status, { blank: null })}</div>
<div><label>Activity</label>${select('activityType', opts(appearance.ACTIVITIES), b.activityType, { blank: null })}</div></div>
<label>Activity text</label>${input('activityText', b.activityText, { placeholder: '/help' })}
<label>Main colour for Pixel Bot's cards in Discord</label>${colorInput('color', color, { defaultText: 'Pixel purple' })}
<h2 style="margin-top:22px">Dashboard look</h2><p class="help">How this website looks for everyone who uses it.</p>
<div class="grid2"><div><label>Accent colour (buttons, links, highlights)</label>${colorInput('themeAccent', t.accent, { defaultText: 'Pixel purple' })}</div>
<div><label>Light or dark</label>${select('themeMode', opts(MODES), t.mode ?? 'auto', { blank: null })}</div>
<div><label>Page background</label>${colorInput('themeBackground', t.background, { fallback: '#16151c', defaultText: 'Automatic' })}</div>
<div><label>Card background</label>${colorInput('themeCard', t.card, { fallback: '#211f2b', defaultText: 'Automatic' })}</div>
<div><label>Font</label>${select('themeFont', opts(FONTS), t.font ?? 'system', { blank: null })}</div>
<div><label>Corners</label>${select('themeCorners', opts(CORNERS), t.corners ?? 'soft', { blank: null })}</div></div>
<label>Dashboard name (top left)</label>${input('themeTitle', t.title ?? '', { placeholder: 'Pixel Bot dashboard' })}
<p class="help">Text colour is picked automatically so it's always readable on your backgrounds.</p>`
    : '<p class="muted">Only the server owner can change the status, colours and dashboard look.</p>';
  return `<section class="card" id="appearance"><h2>Appearance</h2><p class="help">How Pixel Bot looks in Discord, and how this dashboard looks.</p>
<form method="post" action="/g/${esc(guild.id)}/save/appearance">${hidden('csrf', csrf)}
<label>Nickname in this server (empty for "Pixel Bot")</label>${input('nickname', guild.members.me?.nickname ?? '', { hard: 32 })}
${botWide}<button type="submit">Save</button></form></section>`;
}

/** Editable rows for a ticket type's questions, plus empty rows to add more. */
function questionRows(prefix, list) {
  const types = opts(questions.TYPES);
  const rows = [...list, null, null];
  return rows.map((q, i) => {
    const qq = q ?? questions.normalize({ text: '', type: 'long' });
    const p = `${prefix}q${i}_`;
    const warn = q ? questions.notes(qq) : [];
    return `<div class="qrow"><div class="head">${q ? `Question ${i + 1}` : '<span class="muted">+ New question</span>'}</div>
<label>Question</label>${textarea(`${p}text`, qq.text)}
<div class="grid2"><div><label>Answer type</label>${select(`${p}type`, types, qq.type, { blank: null })}</div>
<div><label>Hint under the question (optional)</label>${input(`${p}help`, qq.help)}</div></div>
<label>Placeholder text in the box (optional)</label>${input(`${p}placeholder`, qq.placeholder)}
<label>Choices, one per line (for dropdowns, multiple choice and checkboxes)</label>${textarea(`${p}choices`, qq.choices.join('\n'))}
${toggle(`${p}required`, q ? qq.required : true, 'Must be answered')}
${warn.length ? `<p class="note">Note: this question ${esc(warn.join('; '))}.</p>` : ''}</div>`;
  }).join('') + hidden(`${prefix}qcount`, rows.length);
}

/** The edit page for one panel. */
function panelPage({ guild, user, csrf, flash, panel }) {
  const roles = roleOptions(guild);
  const texts = channelOptions(guild);
  const categories = channelOptions(guild, [ChannelType.GuildCategory]);
  const styles = opts(panels.STYLES);
  const isRoles = panel.type === 'roles';
  const blanks = isRoles ? 3 : 1;
  const slots = [...panel.items, ...Array.from({ length: blanks }, () => null)];
  const issues = panels.problems(guild, panel);

  const itemHtml = slots.map((item, i) => {
    const it = item ?? panels.blankItem(panel.type);
    const p = `item${i}_`;
    const heading = item
      ? `${esc(it.emoji)} ${esc(panels.itemLabel(guild, panel, it))}`
      : `<span class="muted">+ Add ${isRoles ? 'a role' : 'another ticket type'}</span>`;
    const common = `<div class="grid3"><div><label>Button / choice text</label>${input(`${p}label`, item ? it.label : '', { placeholder: isRoles ? 'the role name' : 'Create ticket' })}</div>
<div><label>Emoji</label>${input(`${p}emoji`, item ? it.emoji : '', { placeholder: '🎮 or :pixel:' })}</div>
<div><label>Button colour</label>${select(`${p}style`, styles, it.style, { blank: null })}</div></div>
<label>Short description (shown in the dropdown${isRoles ? ' and the role list' : ''})</label>${input(`${p}description`, item ? it.description : '')}`;
    const body = isRoles
      ? `<label>Role</label>${select(`${p}role`, roles, it.roleId, { blank: '— pick a role —' })}${common}`
      : `${common}
<div class="grid2"><div><label>Create these tickets in</label>${select(`${p}category`, categories, findCategory(guild, it.category)?.id ?? '', { blank: '— the default —' })}</div>
<div><label>Channel name start ({username} works)</label>${input(`${p}namePrefix`, it.namePrefix)}</div></div>
<label>Staff who see these tickets (none ticked = the defaults)</label>${checks(`${p}staffRoles`, roles, roleIds(guild, it.staffRoles))}
${toggle(`${p}pingStaff`, it.pingStaff, 'Ping those staff roles when a ticket opens')}
<label>Ticket card colour</label>${colorInput(`${p}color`, it.color, { defaultText: 'Same as the panel' })}
<h2 style="margin-top:18px">Questions</h2><p class="help">As many as you like, any length. Discord shows 5 per page, so longer forms get a Continue button between pages. Delete a question's text to remove it. No questions = the ticket opens straight away.</p>
${questionRows(p, item ? questions.list(it) : questions.list(panels.blankItem('tickets')))}
<label>First message inside the ticket</label>${textarea(`${p}welcome`, it.welcome)}`;
    return `<details class="item"${item ? '' : ''}><summary>${heading}</summary>${body}
${item ? toggle(`${p}remove`, false, `Remove this ${isRoles ? 'role' : 'ticket type'}`) : ''}</details>`;
  }).join('');

  const body = `<p><a href="/g/${esc(guild.id)}#panels">← All panels</a></p>
<h1>${esc(panel.name)} <span class="badge">${isRoles ? 'Role panel' : 'Ticket panel'} #${panel.id}</span></h1>
<p class="sub">${panel.channelId ? `Posted in #${esc(guild.channels.cache.get(panel.channelId)?.name ?? 'deleted-channel')}. Saving updates it automatically.` : 'Not posted yet. Pick a channel and press Save and post.'}</p>
${flash ? `<div class="flash ${flash.ok ? 'ok' : 'bad'}">${esc(flash.text)}</div>` : ''}
${issues.length ? `<div class="card problems"><h2>⚠️ Things to fix</h2><ul>${issues.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
<form method="post" action="/g/${esc(guild.id)}/panel/${panel.id}/save">${hidden('csrf', csrf)}${hidden('slots', slots.length)}
<section class="card"><h2>The message</h2>
<label>Panel name (only you see this)</label>${input('name', panel.name)}
<label>Title</label>${input('title', panel.title)}
<label>Text</label>${textarea('description', panel.description)}
<div class="grid2"><div><label>Colour</label>${colorInput('color', panel.color)}</div>
<div><label>Footer</label>${input('footer', panel.footer)}</div>
<div><label>Big image link (https://…)</label>${input('image', panel.image)}</div>
<div><label>Small image link (https://…)</label>${input('thumbnail', panel.thumbnail)}</div></div>
<div class="grid2"><div><label>Show options as</label>${select('mode', [{ id: 'buttons', name: 'Buttons' }, { id: 'dropdown', name: 'A dropdown menu' }], panel.mode, { blank: null })}</div>
<div><label>Dropdown placeholder</label>${input('placeholder', panel.placeholder)}</div></div>
${isRoles
    ? `${toggle('listRoles', panel.listRoles, 'List the roles under the text')}
${toggle('exclusive', panel.exclusive, 'Members can only have one role from this panel (picking one removes the others)')}`
    : `<div class="grid2"><div><label>Open tickets one member can have from this panel</label><input type="number" name="maxOpen" min="0" step="1" value="${esc(panel.maxOpen ?? 1)}"><p class="help">0 = no limit.</p></div>
<div><label>Transcripts go to</label>${select('transcriptChannel', texts, findChannel(guild, panel.transcriptChannel)?.id ?? '', { blank: '— the default —' })}</div></div>
<h2 style="margin-top:18px">Close button inside tickets</h2>
<div class="grid3"><div><label>Text</label>${input('closeLabel', panel.closeLabel ?? 'Close ticket')}</div>
<div><label>Emoji</label>${input('closeEmoji', panel.closeEmoji ?? '🔒', { placeholder: 'none' })}</div>
<div><label>Colour</label>${select('closeStyle', styles, panel.closeStyle ?? 'red', { blank: null })}</div></div>`}
</section>
<section class="card"><h2>${isRoles ? 'Roles' : 'Ticket types'}</h2><p class="help">${isRoles ? 'Each role becomes a button (or a dropdown choice). Members click again to remove it.' : 'Each ticket type becomes a button (or a dropdown choice), with its own staff, category and questions.'} Need more empty slots? Save and they appear.</p>
${itemHtml}</section>
<section class="card"><h2>Post it</h2>
<label>Channel</label>${select('channel', texts, panel.channelId ?? '', { blank: '— pick a channel —' })}
<div class="actions"><button type="submit" name="do" value="save">Save</button><button type="submit" name="do" value="post">Save and post</button><button class="secondary" type="submit" name="do" value="repost">Post a fresh copy</button></div>
<p class="help" style="margin-top:10px">"Save and post" updates the posted message in place if it's still there. "Post a fresh copy" always sends a new message.</p></section>
</form>
<section class="card"><h2>More</h2><div class="actions">
<form method="post" action="/g/${esc(guild.id)}/panel/${panel.id}/duplicate">${hidden('csrf', csrf)}<button class="secondary" type="submit">Duplicate this panel</button></form>
<form method="post" action="/g/${esc(guild.id)}/panel/${panel.id}/delete">${hidden('csrf', csrf)}<label class="toggle"><input type="checkbox" name="confirm" value="1" required> Yes, delete it</label><button class="danger" type="submit">Delete panel</button></form>
</div><p class="help" style="margin-top:10px">Deleting doesn't remove the posted message; delete that in Discord.</p></section>`;
  return page({ title: panel.name, user, body });
}

module.exports = { landing, serverList, guildPage, panelPage, errorPage, roleOptions, channelOptions };
