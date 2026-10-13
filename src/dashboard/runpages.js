// Dashboard pages for running slash commands (see runner.js).
const { ChannelType } = require('discord.js');
const { esc, page, hidden, pixelBot } = require('./html');
const { T, variants } = require('./runner');

const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

/** Discord-style text: **bold**, *italic*, `code`, mentions, line breaks. */
function md(guild, text) {
  let h = esc(text ?? '');
  h = h.replace(/&lt;@!?(\d+)&gt;/g, (m, id) => `<span class="mention">@${esc(guild.members.cache.get(id)?.displayName ?? guild.client.users.cache.get(id)?.username ?? 'someone')}</span>`)
    .replace(/&lt;@&amp;(\d+)&gt;/g, (m, id) => `<span class="mention">@${esc(guild.roles.cache.get(id)?.name ?? 'role')}</span>`)
    .replace(/&lt;#(\d+)&gt;/g, (m, id) => `<span class="mention">#${esc(guild.channels.cache.get(id)?.name ?? 'channel')}</span>`)
    .replace(/&lt;t:(\d+)(?::\w)?&gt;/g, (m, t) => esc(new Date(Number(t) * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })))
    .replace(/&lt;a?:(\w+):\d+&gt;/g, ':$1:')
    .replace(/```(?:\w+\n)?([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/^-# (.*)$/gm, '<small class="muted">$1</small>')
    .replace(/^### (.*)$/gm, '<b>$1</b>')
    .replace(/^## (.*)$/gm, '<b class="big">$1</b>')
    .replace(/^# (.*)$/gm, '<b class="big">$1</b>')
    .replace(/\n/g, '<br>');
  return h;
}

function embedHtml(guild, e) {
  const color = typeof e.color === 'number' ? `#${e.color.toString(16).padStart(6, '0')}` : 'var(--line)';
  const fields = (e.fields ?? []).map((f) => `<div class="ef${f.inline ? ' inline' : ''}"><b>${md(guild, f.name)}</b><div>${md(guild, f.value)}</div></div>`).join('');
  return `<div class="embed" style="border-left-color:${esc(color)}">${e.author?.name ? `<small><b>${esc(e.author.name)}</b></small>` : ''}${e.title ? `<b class="et">${md(guild, e.title)}</b>` : ''}${e.description ? `<div>${md(guild, e.description)}</div>` : ''}${fields ? `<div class="efs">${fields}</div>` : ''}${e.image?.url ? `<p class="muted">🖼️ image attached</p>` : ''}${e.footer?.text ? `<small class="muted">${md(guild, e.footer.text)}</small>` : ''}</div>`;
}

/** One reply from the bot, drawn like a Discord message. */
function bubble(guild, o, posted) {
  if (o.kind === 'note') return `<div class="flash bad">${esc(o.content)}</div>`;
  const tags = [o.kind === 'edit' ? 'edited' : o.kind === 'followup' ? 'follow-up' : '', o.ephemeral ? 'only you' : '', posted && !o.ephemeral ? 'also posted' : ''].filter(Boolean);
  return `<div class="msg">${pixelBot(40)}<div class="mb"><div class="mh"><b>Pixel Bot</b><span class="botchip">BOT</span>${tags.map((t) => `<span class="mtag">${t}</span>`).join('')}</div>
${o.content ? `<div class="mc">${md(guild, o.content)}</div>` : ''}${o.embeds.map((e) => embedHtml(guild, e)).join('')}
${o.buttons.length ? `<div class="mbtns">${o.buttons.map((b) => `<span class="mbtn" title="Buttons work in Discord">${esc(b)}</span>`).join('')}</div>` : ''}${o.files.length ? `<p class="muted">📎 ${o.files.map(esc).join(', ')}</p>` : ''}</div></div>`;
}

const header = (guild, title, sub) => `<p><a class="linky" href="/g/${esc(guild.id)}">← ${esc(guild.name)}</a></p><div class="welcomebar"><span class="bigemoji" aria-hidden="true">⌨️</span><div><h1>${esc(title)}</h1><p class="sub">${sub}</p></div></div>`;

/** All the commands, with a search box. */
function listPage(user, guild, commands, query) {
  const q = String(query ?? '').toLowerCase();
  const shown = commands.filter((c) => !q || c.name.includes(q) || c.description.toLowerCase().includes(q));
  const rows = shown.map((c) => `<a href="/g/${esc(guild.id)}/run/${esc(c.name)}"><span><b>/${esc(c.name)}</b>${c.builtin ? '' : ' <span class="mtag">custom</span>'}<br><span class="muted">${esc(c.description)}</span></span></a>`).join('');
  return page({
    title: 'Run a command',
    user,
    body: `${header(guild, 'Run a command', 'Commands run in Discord as you. What the bot says back shows up here instead.')}
<div class="card"><form method="get" action="/g/${esc(guild.id)}/run"><input name="q" value="${esc(query ?? '')}" placeholder="Search commands…" style="width:100%"></form>
<div class="files cmdlist">${rows || '<p class="sub">No commands match that.</p>'}</div></div>`,
  });
}

function optionInput(guild, o, members, autoList) {
  const name = `o_${o.name}`;
  const req = o.required ? ' required' : '';
  const label = `<label>${esc(o.name)}${o.required ? ' <span class="req">*</span>' : ''}<small class="muted"> ${esc(o.description ?? '')}</small></label>`;
  const opts = (list, blank = true) => `${blank ? `<option value="">${o.required ? 'Pick one…' : '(leave empty)'}</option>` : ''}${list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}`;
  if (o.choices?.length) return `${label}<select name="${name}"${req}>${opts(o.choices.map((c) => [c.value, c.name]))}</select>`;
  switch (o.type) {
    case T.BOOLEAN: return `${label}<select name="${name}"${req}>${opts([['true', 'Yes'], ['false', 'No']])}</select>`;
    case T.INTEGER: case T.NUMBER:
      return `${label}<input type="number" name="${name}"${o.type === T.NUMBER ? ' step="any"' : ''}${o.min_value !== undefined ? ` min="${o.min_value}"` : ''}${o.max_value !== undefined ? ` max="${o.max_value}"` : ''}${req}>`;
    case T.USER: return `${label}<select name="${name}"${req}>${opts(members.map((m) => [m.id, `${m.displayName} (@${m.user.username})`]))}</select>`;
    case T.MENTIONABLE: return `${label}<select name="${name}"${req}>${opts([...members.map((m) => [m.id, `👤 ${m.displayName}`]), ...[...guild.roles.cache.values()].filter((r) => r.id !== guild.id).map((r) => [r.id, `🏷️ @${r.name}`])])}</select>`;
    case T.ROLE: return `${label}<select name="${name}"${req}>${opts([...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => b.position - a.position).map((r) => [r.id, `@${r.name}`]))}</select>`;
    case T.CHANNEL: {
      const types = o.channel_types?.length ? o.channel_types : null;
      const list = [...guild.channels.cache.values()].filter((c) => (types ? types.includes(c.type) : c.type !== ChannelType.GuildCategory)).sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0));
      return `${label}<select name="${name}"${req}>${opts(list.map((c) => [c.id, `${c.type === ChannelType.GuildCategory ? '📁' : c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice ? '🔊' : '#'} ${c.name}`]))}</select>`;
    }
    case T.ATTACHMENT: return `${label}<p class="muted">📎 File uploads only work when you use this command in Discord.</p>`;
    default: {
      const long = (o.max_length ?? 0) > 200 || /message|text|description|content|question|reason/i.test(o.name);
      const list = autoList?.length ? ` list="ac_${esc(o.name)}"` : '';
      const dl = autoList?.length ? `<datalist id="ac_${esc(o.name)}">${autoList.map((c) => `<option value="${esc(c.value)}">${esc(c.name)}</option>`).join('')}</datalist>` : '';
      return long && !list
        ? `${label}<textarea name="${name}" rows="3"${o.max_length ? ` maxlength="${o.max_length}"` : ''}${req}></textarea>`
        : `${label}<input name="${name}"${list}${o.max_length ? ` maxlength="${o.max_length}"` : ''}${req}>${dl}`;
    }
  }
}

function whereFields(guild, defaultChannelId) {
  const channels = [...guild.channels.cache.values()].filter((c) => TEXT_TYPES.includes(c.type)).sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0));
  return `<div class="runwhere"><div><label>Run it in</label><select name="where">${channels.map((c) => `<option value="${esc(c.id)}"${c.id === defaultChannelId ? ' selected' : ''}># ${esc(c.name)}</option>`).join('')}</select></div>
<label class="tick"><input type="checkbox" name="post" value="1"> Also post the bot's reply in that channel</label></div>`;
}

/** The command's form (one per subcommand). */
function commandPage(user, guild, csrf, command, { members, autocomplete, defaultChannelId, discordOnly }) {
  const forms = variants(command.json).map((v) => {
    const title = [command.name, v.group, v.sub].filter(Boolean).join(' ');
    const blocked = v.options.some((o) => o.type === T.ATTACHMENT && o.required);
    const inputs = v.options.map((o) => `<div class="optrow">${optionInput(guild, o, members, autocomplete[o.name])}</div>`).join('');
    return `<form class="card runform" method="post" action="/g/${esc(guild.id)}/run/${esc(command.name)}">${hidden('csrf', csrf)}${hidden('v', [v.group ?? '', v.sub ?? ''].join('/'))}
<h2>/${esc(title)}</h2><p class="sub">${esc(v.description ?? '')}</p>
${inputs || '<p class="muted">This one has no options. Just press Run.</p>'}
${whereFields(guild, defaultChannelId)}
${blocked ? '<p class="flash bad">This needs a file, so it only works in Discord.</p>' : `<button type="submit">▶ Run /${esc(title)}</button>`}</form>`;
  }).join('');
  return page({
    title: `/${command.name}`,
    user,
    body: `${header(guild, `/${command.name}`, esc(command.description))}
${discordOnly ? `<p class="flash bad">${esc(discordOnly)}</p>` : forms}
<p><a class="linky" href="/g/${esc(guild.id)}/run">All commands</a></p>`,
  });
}

/** What happened: the bot's replies, plus a form if the command opened one. */
function resultPage(user, guild, csrf, command, result, { channel, post, again }) {
  const replies = result.outputs.map((o) => bubble(guild, o, post)).join('');
  let form = '';
  if (result.modal) {
    const m = result.modal;
    const fields = m.fields.map((f) => {
      if (f.kind === 'text') return `<p class="help">${md(guild, f.content)}</p>`;
      const label = `<label>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}${f.description ? `<small class="muted"> ${esc(f.description)}</small>` : ''}</label>`;
      if (f.kind === 'select') return `<div class="optrow">${label}<select name="f_${esc(f.id)}"${f.multi ? ' multiple' : ''}${f.required ? ' required' : ''}>${f.multi ? '' : '<option value="">Pick one…</option>'}${f.options.map((o) => `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
      return `<div class="optrow">${label}${f.long ? `<textarea name="f_${esc(f.id)}" rows="5"${f.max ? ` maxlength="${f.max}"` : ''}${f.required ? ' required' : ''} placeholder="${esc(f.placeholder)}">${esc(f.value)}</textarea>` : `<input name="f_${esc(f.id)}" value="${esc(f.value)}"${f.max ? ` maxlength="${f.max}"` : ''}${f.required ? ' required' : ''} placeholder="${esc(f.placeholder)}">`}</div>`;
    }).join('');
    form = `<form class="card runform" method="post" action="/g/${esc(guild.id)}/run/${esc(command.name)}/form">${hidden('csrf', csrf)}${hidden('customId', m.customId ?? '')}${hidden('where', channel?.id ?? '')}${post ? hidden('post', '1') : ''}
<h2>📝 ${esc(m.title)}</h2><p class="sub">In Discord this pops up as a form. Fill it in here instead.</p>${fields}<button type="submit">Submit</button></form>`;
  }
  const nothing = !replies && !form && !result.error ? '<p class="sub">Done. The bot didn\'t say anything back.</p>' : '';
  return page({
    title: `/${command.name}`,
    user,
    body: `${header(guild, `/${command.name}`, `Ran in #${esc(channel?.name ?? 'unknown')} as ${esc(user.username)}.`)}
${result.error ? `<div class="flash bad">${esc(result.error)}</div>` : ''}
${replies ? `<div class="card chat">${replies}</div>` : ''}${form}${nothing}
<p><a class="button secondary" href="${esc(again)}">↻ Run it again</a> <a class="linky" href="/g/${esc(guild.id)}/run">All commands</a></p>`,
  });
}

module.exports = { listPage, commandPage, resultPage, md };
