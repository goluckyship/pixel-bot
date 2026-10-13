// The dashboard's pages.
const { ChannelType } = require('discord.js');
const { esc, page, select, checks, toggle, input, textarea, hidden, colorInput, pixelHeart, FONTS, CORNERS, MODES, PRESETS } = require('./html');
const questions = require('../lib/questions');
const db = require('../lib/storage');
const settings = require('../lib/settings');
const automod = require('../lib/automod');
const schedules = require('../lib/schedules');
const { findRole, findChannel, findCategory } = require('../lib/resolve');
const panels = require('../lib/panels');
const customCommands = require('../lib/customcommands');
const appearance = require('../lib/appearance');
const features = require('../lib/features');
const fieldsUi = require('./fields');
const owner = require('../lib/owner');

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
    body: `<div class="hero">${pixelHeart(120, 'beat')}<h1>Pixel Bot</h1>
<p class="sub">Your cosy control room for The Pixel Bassment. Log in with Discord and everything's one click away.</p>
<a class="button" href="/login">Log in with Discord</a><br><a class="linky" href="/code">Discord blocked on this computer? Log in with a code</a></div>`,
  });
}

/** The "log in with a code" screen: type /login on your phone, this page logs itself in. */
function codeLogin(code, minutesLeft) {
  return page({
    title: 'Log in with a code',
    head: '<meta http-equiv="refresh" content="3">',
    body: `<div class="hero">${pixelHeart(72, 'beat')}<h1>Log in with a code</h1>
<p class="sub">For computers where Discord is blocked. Use Discord on your phone (or any device) instead.</p>
<div class="code">${esc(code)}</div>
<ol class="steps"><li>Open Discord on your phone</li><li>In your server (or a DM with Pixel Bot) type <b>/login</b></li><li>Enter <b>${esc(code)}</b> as the code</li></ol>
<p class="muted">This page logs you in by itself a few seconds after. The code works for ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'}.</p>
<a class="linky" href="/code?new=1">Get a new code</a> · <a class="linky" href="/">Back</a></div>`,
  });
}

/** Opening a backup link shows this first; the button is what logs you in. */
function linkLogin(token) {
  return page({
    title: 'Backup login',
    body: `<div class="hero">${pixelHeart(72, 'beat')}<h1>Backup login</h1>
<p class="sub">This one-time link logs you in to the Pixel Bot dashboard. It stops working once you use it.</p>
<form method="post" action="/r/${esc(token)}"><button type="submit">Log me in</button></form></div>`,
  });
}

function account(user, csrf, { hasAccess, count, max, used }) {
  const body = !hasAccess
    ? '<p class="sub">Backup login links are only for people who can use the dashboard.</p>'
    : `<p class="sub">A backup link logs you in once, even if Discord is blocked or you can't log in. Save it somewhere only you can see, like your notes app or a password manager.</p>
<p class="help">It only logs you in as <b>you</b>. What you can change is still up to the normal dashboard access, so it never gives anyone extra access. You can have up to ${max}; making another cancels the oldest.</p>
<p>You have <b>${count}</b> unused backup link${count === 1 ? '' : 's'}.</p>
<form method="post" action="/account/link"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit">🔑 Make a one-time login link</button></form>
${count ? `<form method="post" action="/account/revoke"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit" class="secondary">Cancel all my backup links</button></form>` : ''}`;
  return page({
    title: 'Backup login',
    user,
    body: `<div class="card">${used ? '<div class="flash ok">You\'re in! That backup link is used up now. Make a new one below if you want another spare.</div>' : ''}<h1>🔑 Backup login links</h1>${body}<p><a class="linky" href="/">Back to the dashboard</a></p></div>`,
  });
}

/** Shown exactly once: the link itself is never saved anywhere. */
function linkMade(user, link) {
  return page({
    title: 'Your backup link',
    user,
    body: `<div class="card"><h1>🔑 Your one-time login link</h1>
<p class="sub">Copy it now and keep it somewhere private. This is the only time it will be shown.</p>
<textarea readonly rows="3" style="width:100%;font:600 14px ui-monospace,monospace">${esc(link)}</textarea>
<p class="help">Anyone who has this link can log in as you once, so don't post it anywhere. If it ever leaks, use "Cancel all my backup links".</p>
<p><a class="linky" href="/account">Done</a></p></div>`,
  });
}

function serverList(user, guilds) {
  const items = guilds.length
    ? guilds.map((g) => `<a href="/g/${esc(g.id)}">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<span class="noicon">${esc(g.name[0])}</span>`}<span><b>${esc(g.name)}</b><br><span class="muted">${g.memberCount} members</span></span></a>`).join('')
    : '<p class="empty">You need the Manage Server permission in a server Pixel Bot is in.</p>';
  return page({ title: 'Your servers', user, body: `<h1>Hi ${esc(user.username)}!</h1><p class="sub">Pick a server to look after.</p><div class="servers">${items}</div>` });
}

function errorPage(user, message, status = 400) {
  return { status, html: page({ title: 'Oops', user, body: `<div class="hero">${pixelHeart(72)}<h1>Oops</h1><p class="sub">${esc(message)}</p><a class="button" href="/">Back to the dashboard</a></div>` }) };
}

/** A section that folds up into one tidy row showing what it's set to. */
function fold({ id, emoji, title, status, help = '', body, open = false, flash = null }) {
  return `<details class="card fold" id="${esc(id)}"${open ? ' open' : ''}><summary><span class="emoji" aria-hidden="true">${emoji}</span><span class="t"><b>${esc(title)}</b><small>${status}</small></span></summary>
<div class="foldbody">${flash ? flashBox(flash) : ''}${help ? `<p class="help">${help}</p>` : ''}${body}</div></details>`;
}

/** The 🔄 Refresh button: re-reads channels and roles from Discord. */
const refreshButton = (guildId, csrf, back) =>
  `<form class="refresh" method="post" action="/g/${esc(guildId)}/save/refresh">${hidden('csrf', csrf)}${hidden('back', back)}<button class="secondary" type="submit" title="Show channels and roles you just made in Discord">🔄 Refresh</button></form>`;

/** Extra settings most people never need, tucked away. */
const more = (inner, label = 'More options') => `<details class="more"><summary>${esc(label)}</summary><div>${inner}</div></details>`;

const flashBox = (flash) => `<div class="flash ${flash.ok ? 'ok' : 'bad'}" role="status">${esc(flash.text)}</div>`;

/** A form for one section, saved to /g/<server>/save/<id>. */
const form = (guildId, id, csrf, inner, button = 'Save') =>
  `<form method="post" action="/g/${esc(guildId)}/save/${id}">${hidden('csrf', csrf)}${inner}<button type="submit">${esc(button)}</button></form>`;

const on = (text) => `<span class="pill on">${text}</span>`;
const off = (text = 'Off') => `<span class="pill">${text}</span>`;
const chan = (guild, id) => (id && guild.channels.cache.get(id) ? `#${esc(guild.channels.cache.get(id).name)}` : '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function panelsCard(guild, csrf, opened, flash) {
  const all = panels.list(guild.id).filter((p) => p.type !== 'applications');
  const rows = all.map((p) => {
    const where = p.channelId ? `in ${chan(guild, p.channelId) || '#deleted-channel'}` : 'not posted yet';
    const issues = panels.problems(guild, p).length;
    return `<a class="row" href="/g/${esc(guild.id)}/panel/${p.id}"><span class="emoji" aria-hidden="true">${p.type === 'roles' ? '🏷️' : '🎟️'}</span>
<span class="t"><b>${esc(p.name)}</b><small>${p.type === 'roles' ? plural(p.items.length, 'role') : plural(p.items.length, 'ticket type')}, ${where}${issues ? ' · needs a fix' : ''}</small></span><span class="go">Edit</span></a>`;
  }).join('');
  return fold({
    id: 'panels', emoji: '🎟️', title: 'Panels', open: opened === 'panels', flash,
    status: all.length ? plural(all.length, 'panel') : off('None yet'),
    help: 'Messages with buttons members click: role panels hand out roles, ticket panels open private tickets. Staff applications have their own section below.',
    body: `<div class="rows">${rows || '<p class="empty">No panels yet. Make your first one below.</p>'}</div>
<form method="post" action="/g/${esc(guild.id)}/save/panel-new">${hidden('csrf', csrf)}
<div class="grid2"><div><label>Name it</label>${input('name', '', { placeholder: 'Colour roles, Support…' })}</div>
<div><label>What should it do?</label>${select('type', [{ id: 'roles', name: '🏷️ Hand out roles' }, { id: 'tickets', name: '🎟️ Open tickets' }], 'roles', { blank: null })}</div></div>
<button type="submit">Make a panel</button></form>`,
  });
}

function applicationsCard(guild, csrf, opened, flash) {
  const all = panels.list(guild.id).filter((p) => p.type === 'applications');
  const apps = Object.values(require('../lib/applications').store(guild.id).items);
  const pending = apps.filter((a) => a.status === 'pending');
  const rows = all.map((p) => {
    const where = p.channelId ? `in ${chan(guild, p.channelId) || '#deleted-channel'}` : 'not posted yet';
    const issues = panels.problems(guild, p).length;
    const waiting = pending.filter((a) => a.panelId === p.id).length;
    return `<a class="row" href="/g/${esc(guild.id)}/panel/${p.id}"><span class="emoji" aria-hidden="true">📝</span>
<span class="t"><b>${esc(p.name)}</b><small>${p.items.map((it) => esc(it.label)).join(', ') || 'No application types yet'}, ${where}${waiting ? `, ${waiting} waiting` : ''}${issues ? ' · needs a fix' : ''}</small></span><span class="go">Edit</span></a>`;
  }).join('');
  const recent = apps.slice().sort((a, b) => b.at - a.at).slice(0, 8).map((a) => `<div class="row"><span class="emoji" aria-hidden="true">${a.status === 'pending' ? '⏳' : a.status === 'accepted' ? '✅' : '❌'}</span>
<span class="t"><b>${esc(a.kind)} #${a.id}: ${esc(guild.members.cache.get(a.userId)?.displayName ?? a.tag)}</b><small>${esc(require('../lib/applications').STATUS[a.status].text)}, ${esc(new Date(a.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} · 👍 ${a.yes.length} 🛑 ${a.veto.length}</small></span></div>`).join('');
  return fold({
    id: 'applications', emoji: '📝', title: 'Applications', open: opened === 'applications', flash,
    status: pending.length ? on(`${plural(pending.length, 'application')} waiting`) : all.length ? plural(all.length, 'panel') : off('None yet'),
    help: 'Staff, partner or any other applications. Members fill in your questions, staff review them in a private channel with Accept, Decline and 👍 / 🛑 Veto votes, and the applicant gets a DM with the result.',
    body: `<div class="rows">${rows || '<p class="empty">No application panels yet. Make one below.</p>'}</div>
<form method="post" action="/g/${esc(guild.id)}/save/panel-new">${hidden('csrf', csrf)}${hidden('type', 'applications')}
<label>Name it</label>${input('name', '', { placeholder: 'Staff applications' })}
<button type="submit">Make an application panel</button></form>
${recent ? `<h2 class="minor">Latest applications</h2><div class="rows">${recent}</div>` : ''}`,
  });
}

function commandsCard(guild, csrf, roles, editing, opened, flash) {
  const all = customCommands.list(guild.id);
  const c = (editing && customCommands.find(guild.id, editing)) || {};
  const rows = all.map((cmd) => `<div class="row"><span class="emoji" aria-hidden="true">💬</span><span class="t"><b>/${esc(cmd.name)}</b><small>${esc(cmd.description)} · used ${cmd.uses ?? 0}×</small></span>
<a class="go" href="/g/${esc(guild.id)}?cc=${encodeURIComponent(cmd.name)}#commands">Edit</a>
<form method="post" action="/g/${esc(guild.id)}/save/command-remove">${hidden('csrf', csrf)}${hidden('name', cmd.name)}<button class="small" type="submit">Delete</button></form></div>`).join('');
  return fold({
    id: 'commands', emoji: '✨', title: 'Custom commands', open: opened === 'commands' || Boolean(c.name), flash,
    status: all.length ? all.map((cmd) => `/${esc(cmd.name)}`).slice(0, 4).join(', ') + (all.length > 4 ? ` +${all.length - 4}` : '') : off('None yet'),
    help: 'Your own slash commands, like /rules. Type {user} in the reply to mention whoever used it.',
    body: `<div class="rows">${rows}</div>
<form method="post" action="/g/${esc(guild.id)}/save/command">${hidden('csrf', csrf)}
<h2 class="minor">${c.name ? `Editing /${esc(c.name)}` : 'Add a command'}</h2>
<div class="grid2"><div><label>Name</label>${input('name', c.name ?? '', { hard: 32, placeholder: 'rules' })}</div>
<div><label>What it's for</label>${input('description', c.description ?? '', { hard: 100, placeholder: 'Read the server rules' })}</div></div>
<label>Reply</label>${textarea('response', c.response ?? '')}
${toggle('private', c.private, 'Only the person who used it sees the reply')}
${more(`${toggle('asCard', c.asCard, 'Reply with a styled card')}
<div class="grid2"><div><label>Card title</label>${input('title', c.title ?? '')}</div>
<div><label>Card colour</label>${colorInput('color', c.color)}</div>
<div><label>Big image link</label>${input('image', c.image ?? '', { placeholder: 'https://…' })}</div>
<div><label>Small image link</label>${input('thumbnail', c.thumbnail ?? '', { placeholder: 'https://…' })}</div></div>
<label>Card footer</label>${input('footer', c.footer ?? '')}
<label>Also give or remove this role when used</label>${select('toggleRole', roles, c.toggleRole ?? '')}
<label>Only these roles can use it (none ticked = everyone)</label>${checks('allowedRoles', roles, c.allowedRoles ?? [])}
<p class="help">Other things you can type in the reply: {username}, {server}, {count}, {channel}.</p>`)}
<div class="actions"><button type="submit">${c.name ? 'Save changes' : 'Add command'}</button>${c.name ? `<a class="small" href="/g/${esc(guild.id)}#commands">Cancel</a>` : ''}</div></form>`,
  });
}

/** 👑 Only shown to the bot owner. */
function ownerCard(guild, user, csrf, opened, flash) {
  const client = guild.client;
  const o = owner.settings();
  const up = process.uptime();
  const uptime = up > 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h` : `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`;
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  const ping = client?.ws?.ping;
  const commands = [...(client?.commands?.keys?.() ?? [])].sort().map((name) => ({ id: name, name: `/${name}` }));
  const enabled = commands.map((c) => c.id).filter((name) => !o.disabledCommands.includes(name));
  const nameOf = (id) => esc(guild.members.cache.get(id)?.displayName ?? guild.members.cache.get(id)?.user?.username ?? id);
  const history = o.audit.filter((a) => !a.guildId || a.guildId === guild.id).slice(0, 25).map((a) => `<div class="row"><span class="emoji" aria-hidden="true">${a.ok ? '📝' : '⚠️'}</span><span class="t"><b>${esc(a.username)}: ${esc(a.what)}</b><small>${esc(new Date(a.at).toLocaleString('en-US', { timeZone: settings.get(guild.id).timezone, dateStyle: 'medium', timeStyle: 'short' }))} · ${esc(a.text ?? '')}</small></span></div>`).join('');
  return fold({
    id: 'owner', emoji: '👑', title: 'Owner controls', open: opened === 'owner', flash,
    status: o.maintenance ? '<span class="pill">🛠️ Maintenance mode on</span>' : on(`Online ${uptime}, ${ping >= 0 ? `${ping}ms` : 'ping —'}`),
    help: 'Only you can see this section, because your Discord account owns Pixel Bot.',
    body: `<div class="stats"><div><b>${uptime}</b><small>online for</small></div><div><b>${ping >= 0 ? `${ping}ms` : '—'}</b><small>ping</small></div><div><b>${mem} MB</b><small>memory</small></div><div><b>${commands.length}</b><small>commands</small></div></div>
${form(guild.id, 'owner-controls', csrf, `${toggle('maintenance', o.maintenance, 'Maintenance mode (only you can use Pixel Bot)')}
<label>What everyone else sees</label>${input('maintenanceText', o.maintenanceText)}
${more(`<p class="help">Untick a command to switch it off for everyone but you.</p>${checks('commands', commands, enabled)}`, `Command switches${o.disabledCommands.length ? ` (${o.disabledCommands.length} off)` : ''}`)}
${more(`<p class="help">People who can't use Pixel Bot at all. Paste Discord user IDs, one per line (right-click someone → Copy User ID).</p>${textarea('blocked', o.blocked.join('\n'), { placeholder: '123456789012345678' })}${o.blocked.length ? `<p class="help">Blocked now: ${o.blocked.map(nameOf).join(', ')}</p>` : ''}`, `Blocked users${o.blocked.length ? ` (${o.blocked.length})` : ''}`)}`)}
${more(form(guild.id, 'owner-access', csrf, `${toggle('onlyMe', o.onlyMe, 'Only I can use the dashboard')}
<label>Let these people in too, even without Manage Server (user IDs, one per line)</label>${textarea('extraAccess', o.extraAccess.join('\n'), { placeholder: '123456789012345678' })}${o.extraAccess.length ? `<p class="help">Extra access: ${o.extraAccess.map(nameOf).join(', ')}</p>` : ''}`) + form(guild.id, 'owner-logout', csrf, '', 'Log everyone out of the dashboard'), 'Dashboard access')}
${more(`<p class="help">A backup has every setting for this server: panels, applications, levels, custom commands, all of it.</p><a class="button" href="/g/${esc(guild.id)}/save/backup">Download a backup</a>
${form(guild.id, 'owner-restore', csrf, `<label>Restore: open a backup file in Notepad, copy everything, and paste it here</label>${textarea('backup', '', { placeholder: '{ "pixelBotBackup": 1, …' })}<label class="toggle"><input type="checkbox" name="confirm" value="1"> Yes, replace this server's settings with the backup</label>`, 'Restore backup')}`, 'Backup and restore')}
${more(history ? `<div class="rows">${history}</div>` : '<p class="empty">No dashboard changes yet.</p>', 'Change history')}`,
  });
}

/** A fold-up section for one feature module, built from its settings list. */
function featureFold(feature, guild, user, csrf, opened, flash) {
  const cfg = features.config(guild.id, feature.id);
  const id = `feat-${feature.id}`;
  const status = cfg.enabled === false && feature.fields?.some((f) => f.key === 'enabled') ? off() : (feature.status?.(cfg, guild, { on, off, chan, plural }) ?? on('On'));
  const ctx = { guild, user, csrf, cfg, esc, hidden, more, on, off, chan, plural, form: (action, inner, button) => form(guild.id, `${id}--${action}`, csrf, inner, button) };
  const extra = feature.dashboard ? feature.dashboard(ctx) : '';
  const settingsForm = feature.fields?.length ? form(guild.id, id, csrf, fieldsUi.renderAll(feature.fields, cfg, guild, more)) : '';
  return fold({
    id, emoji: feature.emoji, title: feature.title, open: opened === id, flash, status,
    help: feature.help ?? '',
    body: (feature.dashboardFirst ? extra + settingsForm : settingsForm + extra),
  });
}

function guildPage({ guild, user, csrf, flash, problems, editingCommand }) {
  const s = settings.get(guild.id);
  const g = db.guild(guild.id);
  const roles = roleOptions(guild);
  const texts = channelOptions(guild);
  const categories = channelOptions(guild, [ChannelType.GuildCategory]);
  const rules = automod.settings(guild.id);
  const rankIds = s.ranks.map((entry) => findRole(guild, entry)?.id ?? '');
  const rankSelects = Array.from({ length: Math.max(8, rankIds.length + 2) }, (_, i) =>
    `<label>Rank ${i + 1}${i === 0 ? ' (lowest)' : ''}</label>${select(`rank${i}`, roles, rankIds[i])}`).join('');
  const opened = flash?.section ?? null;
  const flashFor = (id) => (flash && flash.section === id ? flash : null);
  const roleName = (entry) => esc(findRole(guild, entry)?.name ?? entry);
  const group = (name) => features.all().filter((f) => (f.group ?? 'community') === name).map((f) => featureFold(f, guild, user, csrf, opened, flashFor(`feat-${f.id}`))).join('\n');

  const scheduled = schedules.list(guild.id).slice().sort((a, b) => a.nextAt - b.nextAt);
  const scheduleRows = scheduled.map((item) => `<div class="row"><span class="emoji" aria-hidden="true">⏰</span><span class="t"><b>${esc(new Date(item.nextAt).toLocaleString('en-US', { timeZone: s.timezone, dateStyle: 'medium', timeStyle: 'short' }))}${item.repeat !== 'none' ? `, then ${esc(item.repeat)}` : ''}</b>
<small>${chan(guild, item.channelId) || '#deleted-channel'}: ${esc((item.title ? `${item.title}: ` : '') + item.message).slice(0, 120)}</small></span>
<form method="post" action="/g/${esc(guild.id)}/save/schedule-remove">${hidden('csrf', csrf)}${hidden('id', item.id)}<button class="small" type="submit">Delete</button></form></div>`).join('');
  const autoOn = Object.entries(automod.FEATURES).filter(([key]) => rules[key]).length;

  const body = `
<div class="welcomebar">${pixelHeart(44, 'beat')}<div><h1>${esc(guild.name)}</h1><p class="sub">Tap a section to open it. Everything saves the moment you press Save.</p></div>${refreshButton(guild.id, csrf, `/g/${guild.id}`)}</div>
${flash && !flash.section ? flashBox(flash) : ''}
${problems.length ? `<div class="card problems"><h2>💡 A few things to check</h2><ul>${problems.map((p) => `<li>${esc(p.replace(/\*\*/g, '').replace(/<@&(\d+)>/g, (m, id) => guild.roles.cache.get(id)?.name ?? 'a role'))}</li>`).join('')}</ul></div>` : ''}

${owner.isOwner(guild.client, user.id) ? ownerCard(guild, user, csrf, opened, flashFor('owner')) : ''}

<h2 class="group">Fun and community</h2>
${panelsCard(guild, csrf, opened, flashFor('panels'))}
${applicationsCard(guild, csrf, opened, flashFor('applications'))}
${commandsCard(guild, csrf, roles, editingCommand, opened, flashFor('commands'))}

${fold({
    id: 'welcome', emoji: '👋', title: 'Welcome message', open: opened === 'welcome', flash: flashFor('welcome'),
    status: g.welcome ? on(`On in ${chan(guild, g.welcome.channelId) || 'a deleted channel'}`) : off(),
    help: 'Pixel Bot greets new members. {user} pings them, {count} is how many members you have.',
    body: form(guild.id, 'welcome', csrf, `${toggle('enabled', Boolean(g.welcome), 'Greet new members')}
<label>Where</label>${select('channel', texts, g.welcome?.channelId ?? findChannel(guild, s.welcome.channel)?.id)}
<label>What it says</label>${textarea('message', g.welcome?.message ?? s.welcome.message)}
${more(`${toggle('ping', g.welcome?.ping !== false, 'Ping the new member')}
${toggle('showAvatar', g.welcome?.showAvatar !== false, 'Show their profile picture')}
${toggle('plain', g.welcome?.plain, 'Plain text instead of a card')}
<div class="grid2"><div><label>Card title</label>${input('title', g.welcome?.title ?? '', { placeholder: 'Welcome, {username}!' })}</div>
<div><label>Card colour</label>${colorInput('color', g.welcome?.color)}</div>
<div><label>Banner image link</label>${input('image', g.welcome?.image ?? '', { placeholder: 'https://…' })}</div>
<div><label>Footer</label>${input('footer', g.welcome?.footer ?? '', { placeholder: 'Member #{count}' })}</div></div>
<label>Also send them a DM (leave empty for none)</label>${textarea('dm', g.welcomeDm ?? '')}`)}`),
  })}

${fold({
    id: 'goodbye', emoji: '🌙', title: 'Goodbye message', open: opened === 'goodbye', flash: flashFor('goodbye'),
    status: g.goodbye ? on(`On in ${chan(guild, g.goodbye.channelId) || 'a deleted channel'}`) : off(),
    help: 'A little note when someone leaves.',
    body: form(guild.id, 'goodbye', csrf, `${toggle('enabled', Boolean(g.goodbye), 'Say goodbye when someone leaves')}
<label>Where</label>${select('channel', texts, g.goodbye?.channelId ?? g.welcome?.channelId)}
<label>What it says</label>${textarea('message', g.goodbye?.message ?? '**{username}** left the server. We now have {count} members.')}
${more(`${toggle('plain', g.goodbye?.plain, 'Plain text instead of a card')}
<label>Card colour</label>${colorInput('color', g.goodbye?.color, { fallback: '#e5484d' })}`)}`),
  })}

${scheduledCard()}

${appearanceCard(guild, user, csrf, opened === 'appearance', flashFor('appearance'))}
${group('community')}

<h2 class="group">Levels</h2>
${group('levels')}

<h2 class="group">Channels and automation</h2>
${group('automation')}

<h2 class="group">Staff and safety</h2>
${group('safety')}
${fold({
    id: 'automod', emoji: '🛡️', title: 'Automod', open: opened === 'automod', flash: flashFor('automod'),
    status: autoOn ? on(`${autoOn} of ${Object.keys(automod.FEATURES).length} on`) : off(),
    help: "Stops spam on its own. Staff with Manage Messages are never affected.",
    body: form(guild.id, 'automod', csrf, Object.entries(automod.FEATURES).map(([key, text]) => toggle(key, rules[key], text)).join('')),
  })}

${fold({
    id: 'filter', emoji: '🧹', title: 'Word filter', open: opened === 'filter', flash: flashFor('filter'),
    status: g.filter.length ? on(plural(g.filter.length, 'word')) : off('Empty'),
    help: 'Messages with these words get deleted. One word or phrase per line.',
    body: form(guild.id, 'filter', csrf, textarea('words', g.filter.join('\n'), { placeholder: 'one word per line' })),
  })}

${fold({
    id: 'logs', emoji: '📜', title: 'Staff log', open: opened === 'logs', flash: flashFor('logs'),
    status: findChannel(guild, s.logChannel) ? on(`#${esc(findChannel(guild, s.logChannel).name)}`) : off('No channel'),
    help: 'Deleted and edited messages, role changes, bans and more get posted here.',
    body: form(guild.id, 'logs', csrf, `<label>Log channel</label>${select('logChannel', texts, findChannel(guild, s.logChannel)?.id)}`),
  })}

${fold({
    id: 'roles', emoji: '🏷️', title: 'Auto roles', open: opened === 'roles', flash: flashFor('roles'),
    status: s.autoroles.length ? `New members get ${s.autoroles.map(roleName).join(', ')}` : off('None'),
    help: "Roles handed out automatically. Pixel Bot's own role needs to be above them.",
    body: form(guild.id, 'roles', csrf, `<label>Everyone who joins gets</label>${checks('autoroles', roles, roleIds(guild, s.autoroles))}
${more(`<label>Staff role</label>${select('staffRole', roles, findRole(guild, s.staffRole)?.id)}
<label>…given to anyone who has one of these</label>${checks('staffSourceRoles', roles, roleIds(guild, s.staffSourceRoles))}`, 'Staff role')}`),
  })}

${fold({
    id: 'ranks', emoji: '🪜', title: 'Staff ranks', open: opened === 'ranks', flash: flashFor('ranks'),
    status: `${plural(rankIds.filter(Boolean).length, 'rank')} for /promote and /demote`,
    help: 'The ladder /promote and /demote move people along, lowest first. Leave spare slots empty.',
    body: form(guild.id, 'ranks', csrf, `<div class="grid2">${rankSelects}</div>
<label>Who can promote and demote (as well as you)</label>${checks('rankManagers', roles, roleIds(guild, s.rankManagers))}`),
  })}

${fold({
    id: 'tickets', emoji: '🗂️', title: 'Ticket defaults', open: opened === 'tickets', flash: flashFor('tickets'),
    status: findCategory(guild, s.tickets.category) ? `Tickets go in ${esc(findCategory(guild, s.tickets.category).name)}` : off('No category'),
    help: 'Used by any ticket type that doesn\'t pick its own. You can set these per ticket type inside each panel.',
    body: form(guild.id, 'tickets', csrf, `<div class="grid2"><div><label>Category for new tickets</label>${select('category', categories, findCategory(guild, s.tickets.category)?.id)}</div>
<div><label>Transcripts go to</label>${select('transcriptChannel', texts, findChannel(guild, s.tickets.transcriptChannel)?.id)}</div></div>
<label>Staff who see tickets</label>${checks('staffRoles', roles, roleIds(guild, s.tickets.staffRoles))}`),
  })}`;

  function scheduledCard() {
    return fold({
      id: 'schedule', emoji: '⏰', title: 'Scheduled messages', open: opened === 'schedule', flash: flashFor('schedule'),
      status: scheduled.length ? on(plural(scheduled.length, 'message')) : off('Nothing planned'),
      help: `Messages Pixel Bot posts for you later, once or on repeat. Times are ${esc(s.timezone)} time.`,
      body: `<div class="rows">${scheduleRows}</div>
<form method="post" action="/g/${esc(guild.id)}/save/schedule-add">${hidden('csrf', csrf)}
<div class="grid2"><div><label>Where</label>${select('channel', texts, '', { blank: '— pick a channel —' })}</div>
<div><label>When</label>${input('when', '', { placeholder: 'tomorrow 9am, in 2h, 10/31 7pm' })}</div></div>
<label>Message</label>${textarea('message', '')}
${more(`<label>Repeat</label>${select('repeat', [{ id: 'none', name: 'Just once' }, { id: 'daily', name: 'Every day' }, { id: 'weekly', name: 'Every week' }], 'none', { blank: null })}
<label>Title (makes it a styled card)</label>${input('title', '')}`)}
<button type="submit">Schedule it</button></form>`,
    });
  }

  return page({ title: guild.name, user, body });
}

function appearanceCard(guild, user, csrf, open, flash) {
  const b = appearance.settings();
  const isBotOwner = owner.isOwner(guild.client, user.id);
  const color = Number.isInteger(b.color) ? `#${b.color.toString(16).padStart(6, '0')}` : '';
  const t = b.theme ?? {};
  const statusText = b.activityType === 'None' || !b.activityText ? 'No status' : `${appearance.ACTIVITIES[b.activityType] ?? ''} ${b.activityText}`.trim();
  const botWide = isBotOwner
    ? `<div class="grid2"><div><label>Status</label>${select('activityType', opts(appearance.ACTIVITIES), b.activityType, { blank: null })}</div>
<div><label>Status text</label>${input('activityText', b.activityText, { placeholder: '/help' })}</div></div>
${more(`<div class="grid2"><div><label>Online dot</label>${select('status', opts(appearance.STATUSES), b.status, { blank: null })}</div>
<div><label>Colour of Pixel Bot's cards in Discord</label>${colorInput('color', color, { defaultText: 'Pixel purple' })}</div></div>`, 'Online dot and card colour')}
${more(`<p class="help">How this dashboard looks for everyone. Text colours adjust themselves so they're always readable.</p>
<label>Theme</label>${select('themePreset', opts(PRESETS), t.preset ?? 'lavender', { blank: null })}
<p class="help small">Pick a ready-made look. The colour pickers below (left on Default) are only for fine-tuning.</p>
<div class="grid2"><div><label>Accent colour</label>${colorInput('themeAccent', t.accent, { defaultText: 'Theme default' })}</div>
<div><label>Light or dark</label>${select('themeMode', opts(MODES), t.mode ?? 'auto', { blank: null })}</div>
<div><label>Page background</label>${colorInput('themeBackground', t.background, { fallback: '#f5effc', defaultText: 'Theme default' })}</div>
<div><label>Card background</label>${colorInput('themeCard', t.card, { fallback: '#fffbfe', defaultText: 'Theme default' })}</div>
<div><label>Font</label>${select('themeFont', opts(FONTS), t.font ?? 'system', { blank: null })}</div>
<div><label>Corners</label>${select('themeCorners', opts(CORNERS), t.corners ?? 'soft', { blank: null })}</div></div>
<label>Dashboard name</label>${input('themeTitle', t.title ?? '', { placeholder: 'Pixel Bot dashboard' })}`, 'Dashboard look')}`
    : '<p class="muted">Only the bot owner can change the status, colours and dashboard look.</p>';
  return fold({
    id: 'appearance', emoji: '🎨', title: 'Appearance', open, flash,
    status: esc(statusText),
    help: 'How Pixel Bot shows up in Discord, and how this page looks.',
    body: form(guild.id, 'appearance', csrf, `<label>Nickname here (empty for "Pixel Bot")</label>${input('nickname', guild.members.me?.nickname ?? '', { hard: 32 })}
${botWide}`),
  });
}

/** Editable rows for a ticket type's questions, plus empty rows to add more. */
function questionRows(prefix, list) {
  const types = opts(questions.TYPES);
  const rows = [...list, null, null];
  return rows.map((q, i) => {
    const qq = q ?? questions.normalize({ text: '', type: 'long' });
    const p = `${prefix}q${i}_`;
    const warn = q ? questions.notes(qq) : [];
    return `<div class="qrow${q ? '' : ' blank'}"><div class="head">${q ? `Question ${i + 1}` : '+ Add a question'}</div>
${textarea(`${p}text`, qq.text, { placeholder: q ? '' : 'Type a new question here' })}
<div class="grid2"><div><label>Answer with</label>${select(`${p}type`, types, qq.type, { blank: null })}</div>
<div class="center">${toggle(`${p}required`, q ? qq.required : true, 'Must be answered')}</div></div>
${more(`<label>Choices, one per line (for dropdowns, multiple choice and checkboxes)</label>${textarea(`${p}choices`, qq.choices.join('\n'))}
<div class="grid2"><div><label>Hint under the question</label>${input(`${p}help`, qq.help)}</div>
<div><label>Grey example text in the box</label>${input(`${p}placeholder`, qq.placeholder)}</div></div>`, qq.choices.length ? `Choices (${qq.choices.length}), hint and example` : 'Choices, hint and example')}
${warn.length ? `<p class="note">Heads up: this question ${esc(warn.join('; '))}.</p>` : ''}</div>`;
  }).join('') + hidden(`${prefix}qcount`, rows.length);
}

/** The edit page for one panel. */
function panelPage({ guild, user, csrf, flash, panel }) {
  const roles = roleOptions(guild);
  const texts = channelOptions(guild);
  const categories = channelOptions(guild, [ChannelType.GuildCategory]);
  const styles = opts(panels.STYLES);
  const isRoles = panel.type === 'roles';
  const isApps = panel.type === 'applications';
  const blanks = isRoles ? 3 : 1;
  const slots = [...panel.items, ...Array.from({ length: blanks }, () => null)];
  const issues = panels.problems(guild, panel);

  const itemHtml = slots.map((item, i) => {
    const it = item ?? panels.blankItem(panel.type);
    const p = `item${i}_`;
    const heading = item
      ? `${esc(it.emoji)} ${esc(panels.itemLabel(guild, panel, it))}${isApps && it.open === false ? ' <span class="pill">Closed</span>' : ''}`
      : `<span class="muted">+ Add ${isRoles ? 'a role' : isApps ? 'another kind of application' : 'another kind of ticket'}</span>`;
    const look = `<div class="grid3"><div><label>Button text</label>${input(`${p}label`, item ? it.label : '', { placeholder: isRoles ? 'the role name' : 'Create ticket' })}</div>
<div><label>Emoji</label>${input(`${p}emoji`, item ? it.emoji : '', { placeholder: '🎮 or :pixel:' })}</div>
<div><label>Button colour</label>${select(`${p}style`, styles, it.style, { blank: null })}</div></div>`;
    const appBody = () => `${look}
${toggle(`${p}open`, it.open !== false, 'Open for applications')}
<label>Make a private review channel for each application in</label>${select(`${p}reviewCategory`, categories, findCategory(guild, it.reviewCategory)?.id ?? '', { blank: '— pick a category —' })}
<p class="help small">Like tickets: every application gets its own channel there, only reviewers can see it, and it's renamed ✅ or ❌ once decided.</p>
${toggle(`${p}pingReviewers`, it.pingReviewers, 'Ping reviewers for new applications')}
${toggle(`${p}applicantSees`, it.applicantSees, 'Let the applicant see their channel too (for follow-up questions)')}
<label>Who can review, vote and accept (none ticked = server managers)</label>${checks(`${p}reviewers`, roles, it.reviewers ?? [])}
<label>Roles to give when accepted</label>${checks(`${p}acceptRoles`, roles, it.acceptRoles ?? [])}
<h2 class="minor">Questions</h2><p class="help">Add as many as you like. Discord shows 5 at a time, so longer forms get a Continue button. Clear a question's text to remove it.</p>
${questionRows(p, item ? questions.list(it) : questions.list(panels.blankItem('applications')))}
${more(`<label>Message after they apply</label>${textarea(`${p}thanks`, it.thanks ?? '')}
<label>DM when accepted ({application} and {server} work)</label>${textarea(`${p}acceptMessage`, it.acceptMessage ?? '')}
<label>DM when declined</label>${textarea(`${p}declineMessage`, it.declineMessage ?? '')}
<div class="grid2"><div><label>Days before someone declined can apply again (0 = straight away)</label><input type="number" name="${esc(p)}cooldownDays" min="0" step="1" value="${esc(it.cooldownDays ?? 7)}"></div>
<div><label>Card colour</label>${colorInput(`${p}color`, it.color, { defaultText: 'Same as the panel' })}</div></div>
<label>Roles to take away when accepted</label>${checks(`${p}removeRoles`, roles, it.removeRoles ?? [])}
<label>Short description (shown in the dropdown)</label>${input(`${p}description`, item ? it.description : '')}`, 'Messages, cooldown and more')}`;
    const body = isApps ? appBody() : isRoles
      ? `<label>Role</label>${select(`${p}role`, roles, it.roleId, { blank: '— pick a role —' })}${look}
${more(`<label>Short description (shown in the dropdown and the role list)</label>${input(`${p}description`, item ? it.description : '')}`)}`
      : `${look}
<label>Staff who see these tickets (none ticked = your ticket defaults)</label>${checks(`${p}staffRoles`, roles, roleIds(guild, it.staffRoles))}
<h2 class="minor">Questions</h2><p class="help">Add as many as you like. Discord shows 5 at a time, so longer forms get a Continue button. Clear a question's text to remove it, or leave none to open tickets straight away.</p>
${questionRows(p, item ? questions.list(it) : questions.list(panels.blankItem('tickets')))}
${more(`<label>First message inside the ticket</label>${textarea(`${p}welcome`, it.welcome)}
<div class="grid2"><div><label>Create these tickets in</label>${select(`${p}category`, categories, findCategory(guild, it.category)?.id ?? '', { blank: '— the default —' })}</div>
<div><label>Channel name starts with ({username} works)</label>${input(`${p}namePrefix`, it.namePrefix)}</div>
<div><label>Ticket card colour</label>${colorInput(`${p}color`, it.color, { defaultText: 'Same as the panel' })}</div>
<div><label>Short description (shown in the dropdown)</label>${input(`${p}description`, item ? it.description : '')}</div></div>
${toggle(`${p}pingStaff`, it.pingStaff, 'Ping the staff when a ticket opens')}`, 'First message, category and more')}`;
    return `<details class="item"${item ? '' : ''}><summary>${heading}</summary>${body}
${item ? `<div class="removebox">${toggle(`${p}remove`, false, `Remove this ${isRoles ? 'role' : 'ticket type'}`)}</div>` : ''}</details>`;
  }).join('');

  const body = `<p><a href="/g/${esc(guild.id)}#${isApps ? 'applications' : 'panels'}">← Back to all settings</a></p>
<div class="welcomebar"><span class="bigemoji" aria-hidden="true">${isRoles ? '🏷️' : isApps ? '📝' : '🎟️'}</span><div><h1>${esc(panel.name)}</h1>
<p class="sub">${panel.channelId ? `Posted in ${chan(guild, panel.channelId) || '#deleted-channel'}. Saving updates it for you.` : 'Not posted yet. Fill it in, pick a channel at the bottom and press Save and post.'}</p></div>${refreshButton(guild.id, csrf, `/g/${guild.id}/panel/${panel.id}`)}</div>
${flash ? flashBox(flash) : ''}
${issues.length ? `<div class="card problems"><h2>💡 A few things to check</h2><ul>${issues.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
<form method="post" action="/g/${esc(guild.id)}/panel/${panel.id}/save">${hidden('csrf', csrf)}${hidden('slots', slots.length)}
<section class="card"><h2>💌 The message</h2>
<label>Title</label>${input('title', panel.title)}
<label>Text</label>${textarea('description', panel.description)}
<div class="grid2"><div><label>Colour</label>${colorInput('color', panel.color)}</div>
<div><label>Show options as</label>${select('mode', [{ id: 'buttons', name: 'Buttons' }, { id: 'dropdown', name: 'A dropdown menu' }], panel.mode, { blank: null })}</div></div>
${isRoles ? toggle('exclusive', panel.exclusive, 'Only one role each (picking one removes the others)') : ''}
${more(`<label>Panel name (only staff see this)</label>${input('name', panel.name)}
<div class="grid2"><div><label>Footer</label>${input('footer', panel.footer)}</div>
<div><label>Dropdown placeholder</label>${input('placeholder', panel.placeholder)}</div>
<div><label>Big image link</label>${input('image', panel.image, { placeholder: 'https://…' })}</div>
<div><label>Small image link</label>${input('thumbnail', panel.thumbnail, { placeholder: 'https://…' })}</div></div>
${isRoles
    ? toggle('listRoles', panel.listRoles, 'List the roles under the text')
    : isApps ? '' : `<div class="grid2"><div><label>Open tickets one member can have (0 = no limit)</label><input type="number" name="maxOpen" min="0" step="1" value="${esc(panel.maxOpen ?? 1)}"></div>
<div><label>Transcripts go to</label>${select('transcriptChannel', texts, findChannel(guild, panel.transcriptChannel)?.id ?? '', { blank: '— the default —' })}</div></div>
<div class="grid3"><div><label>Close button text</label>${input('closeLabel', panel.closeLabel ?? 'Close ticket')}</div>
<div><label>Close button emoji</label>${input('closeEmoji', panel.closeEmoji ?? '🔒', { placeholder: 'none' })}</div>
<div><label>Close button colour</label>${select('closeStyle', styles, panel.closeStyle ?? 'red', { blank: null })}</div></div>`}`)}
</section>
<section class="card"><h2>${isRoles ? '🏷️ Roles' : isApps ? '📝 Kinds of application' : '🎟️ Kinds of ticket'}</h2><p class="help">${isRoles ? 'Each role becomes a button. Members click again to take it off.' : isApps ? 'Each kind (Staff, Partner…) becomes its own Apply button, with its own questions, reviewers and roles.' : 'Each kind becomes its own button, with its own questions and staff.'} Need more slots? Press Save and new ones appear.</p>
${itemHtml}</section>
<section class="card postbox"><h2>📮 Post it</h2>
<label>Channel</label>${select('channel', texts, panel.channelId ?? '', { blank: '— pick a channel —' })}
<div class="actions"><button type="submit" name="do" value="post">Save and post</button><button class="secondary" type="submit" name="do" value="save">Just save</button></div>
${more(`<p class="help">Already posted and want a brand-new copy instead of updating the old one?</p><button class="secondary" type="submit" name="do" value="repost">Post a fresh copy</button>`, 'Post a fresh copy')}</section>
</form>
${fold({
    id: 'panel-more', emoji: '🧺', title: 'Copy or delete', status: 'Duplicate this panel, or remove it',
    body: `<div class="actions">
<form method="post" action="/g/${esc(guild.id)}/panel/${panel.id}/duplicate">${hidden('csrf', csrf)}<button class="secondary" type="submit">Make a copy</button></form>
<form method="post" action="/g/${esc(guild.id)}/panel/${panel.id}/delete">${hidden('csrf', csrf)}<label class="toggle"><input type="checkbox" name="confirm" value="1" required> Yes, delete it</label><button class="danger" type="submit">Delete panel</button></form>
</div><p class="help" style="margin-top:12px">Deleting doesn't remove the posted message. Delete that in Discord.</p>`,
  })}`;
  return page({ title: panel.name, user, body });
}

module.exports = { landing, codeLogin, linkLogin, account, linkMade, serverList, guildPage, panelPage, errorPage, roleOptions, channelOptions };
