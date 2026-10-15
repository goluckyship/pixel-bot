// Levels from voice chat: members earn XP for every minute they spend in voice
// (not while AFK, deafened or sitting alone), level up, and climb a voice-hours
// leaderboard that Pixel Bot keeps up to date in a channel.
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const { embed, fill, truncate, ephemeral, hexColor } = require('../lib/ui');

/** XP needed to go from `level` to the next one. */
const xpFor = (level) => 5 * level * level + 50 * level + 100;

/** Total XP -> { level, into, needed }. */
function levelOf(total) {
  let level = 0;
  let left = Math.floor(total);
  while (left >= xpFor(level)) {
    left -= xpFor(level);
    level += 1;
  }
  return { level, into: left, needed: xpFor(level) };
}

/** Week number (weeks start on Monday). */
const weekKey = (ms = Date.now()) => Math.floor((ms - 4 * 86_400_000) / 604_800_000);

const store = (guildId) => features.data(guildId, 'levels', () => ({ users: {}, lastTick: 0, boardMessage: '', boardAt: 0 }));
function userOf(guildId, userId) {
  const u = (store(guildId).users[userId] ??= { xp: 0, voice: 0, week: 0, weekKey: weekKey(), last: 0 });
  u.voice ??= 0;
  if (u.weekKey !== weekKey()) {
    u.weekKey = weekKey();
    u.week = 0;
  }
  return u;
}

/** "3h 25m" */
function hours(seconds) {
  const m = Math.floor((seconds ?? 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** "3h 25m 07s" (live, down to the second) */
function clock(seconds) {
  const t = Math.floor(seconds ?? 0);
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const sec = t % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}h ${pad(m)}m ${pad(sec)}s` : m ? `${m}m ${pad(sec)}s` : `${sec}s`;
}

function ranked(guildId, by = 'xp') {
  const list = Object.entries(store(guildId).users).map(([id]) => [id, userOf(guildId, id)]);
  return list.filter(([, u]) => (by === 'week' ? u.week : by === 'voice' ? u.voice : u.xp) > 0)
    .sort((a, b) => (by === 'week' ? b[1].week - a[1].week : by === 'voice' ? b[1].voice - a[1].voice : b[1].xp - a[1].xp));
}

const bar = (into, needed, size = 12) => {
  const filled = Math.max(0, Math.min(size, Math.round((into / needed) * size)));
  return `${'🟪'.repeat(filled)}${'⬜'.repeat(size - filled)}`;
};

/** Gives level-reward roles for `level` (and removes lower ones unless they stack). */
async function applyRewards(member, level) {
  const cfg = features.config(member.guild.id, 'levelrewards');
  if (!cfg.enabled || !cfg.rewards?.length) return [];
  const earned = cfg.rewards.filter((r) => r.level <= level).sort((a, b) => a.level - b.level);
  const keep = cfg.stack ? earned : earned.slice(-1);
  const given = [];
  for (const r of keep) {
    const role = member.guild.roles.cache.get(r.role);
    if (role?.editable && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, `Level ${level} reward`).catch(() => {});
      given.push(role);
    }
  }
  if (!cfg.stack) {
    for (const r of earned.slice(0, -1)) {
      const role = member.guild.roles.cache.get(r.role);
      if (role?.editable && member.roles.cache.has(role.id)) await member.roles.remove(role, 'Replaced by a higher level reward').catch(() => {});
    }
  }
  return given;
}

/** Adds XP (and handles level-ups). Returns the new level if it went up. */
async function addXp(member, amount, fallbackChannel = null) {
  const u = userOf(member.guild.id, member.id);
  const before = levelOf(u.xp).level;
  u.xp = Math.max(0, u.xp + amount);
  db.saveSoon();
  const after = levelOf(u.xp).level;
  if (after <= before) return null;

  const cfg = features.config(member.guild.id, 'levels');
  const rewards = await applyRewards(member, after);
  const text = fill(cfg.message || '🎉 {user} reached **level {level}**!', { member }).replaceAll('{level}', String(after));
  const extra = rewards.length ? `\nUnlocked ${rewards.map((r) => `${r}`).join(', ')}!` : '';
  if (cfg.announce === 'dm') {
    await member.send({ content: truncate(`${text}${extra}`.replace(`<@${member.id}>`, 'You'), 2000) }).catch(() => {});
  } else if (cfg.announce !== 'off') {
    const target = member.guild.channels.cache.get(cfg.channel) ?? fallbackChannel;
    await target?.send({ content: truncate(text + extra, 2000), allowedMentions: { users: cfg.ping === false ? [] : [member.id] } }).catch(() => {});
  }
  return after;
}

/** Does this member's voice time count right now? */
function counts(member, cfg) {
  const voice = member.voice;
  const channel = voice?.channel;
  if (!channel || member.user.bot) return false;
  const afk = features.config(member.guild.id, 'afk');
  if (channel.id === member.guild.afkChannelId || (afk.enabled && channel.id === afk.room)) return false;
  if ([].concat(cfg.noXpChannels || []).includes(channel.id)) return false;
  if ((cfg.noXpRoles ?? []).some((id) => member.roles.cache.has(id))) return false;
  if (cfg.skipDeafened !== false && (voice.selfDeaf || voice.serverDeaf)) return false;
  if (cfg.skipMuted && (voice.selfMute || voice.serverMute)) return false;
  if (cfg.needCompany !== false) {
    const others = channel.members.filter((m) => !m.user.bot && m.id !== member.id && !m.voice.selfDeaf && !m.voice.serverDeaf);
    if (others.size === 0) return false;
  }
  return true;
}

/** Every second: add voice time and XP for everyone who's really hanging out in voice, and keep the board live. */
const reported = new Set();
async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!reported.has(guild.id)) {
      reported.add(guild.id);
      const c = features.config(guild.id, 'levels');
      const ch = c.board && guild.channels.cache.get(c.board);
      console.log(`Voice leaderboard in ${guild.name}: levels ${features.isOn(guild.id, 'levels') ? 'on' : 'OFF'}, board channel ${ch ? `#${ch.name}` : c.board ? 'missing' : 'not set'}, message ${store(guild.id).boardMessage || 'none yet'}`);
    }
    if (!features.isOn(guild.id, 'levels')) continue;
    const cfg = features.config(guild.id, 'levels');
    const st = store(guild.id);
    const now = Date.now();
    // Count the time since the last check (capped, so a restart doesn't hand out free hours).
    const seconds = st.lastTick ? Math.min(90, Math.max(0, (now - st.lastTick) / 1000)) : 1;
    st.lastTick = now;
    const perMinute = Number(cfg.xpPerMinute ?? 10) * (Number(cfg.multiplier) || 1);
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased?.()) continue;
      for (const member of channel.members.values()) {
        if (!counts(member, cfg)) continue;
        const u = userOf(guild.id, member.id);
        u.voice += seconds;
        u.week += seconds;
        await addXp(member, (perMinute * seconds) / 60);
      }
    }
    db.saveSoon();
    // The board refreshes every second while it changes (one edit at a time, so Discord never gets flooded).
    if (cfg.board && !boardBusy.has(guild.id) && now - (st.boardAt ?? 0) >= 1000) {
      boardBusy.add(guild.id);
      updateBoard(guild, cfg).catch((e) => console.warn(`Voice leaderboard: ${e.message}`)).finally(() => boardBusy.delete(guild.id));
    }
  }
}

const boardBusy = new Set();
const lastBoard = new Map(); // guild -> last text sent, so unchanged boards aren't re-sent

function boardCard(guild, cfg) {
  const line = (list, key) => list.slice(0, 10).map(([id, u], i) => `${['🥇', '🥈', '🥉'][i] ?? `**${i + 1}.**`} <@${id}> · ${clock(u[key])} · lvl ${levelOf(u.xp).level}`).join('\n') || 'Nobody yet. Hop in voice!';
  return embed(hexColor(cfg.color) ?? undefined)
    .setTitle('🎧 Voice hours')
    .addFields({ name: 'This week', value: truncate(line(ranked(guild.id, 'week'), 'week'), 1024), inline: true }, { name: 'All time', value: truncate(line(ranked(guild.id, 'voice'), 'voice'), 1024), inline: true })
    .setFooter({ text: 'Live · updates every second · AFK, deafened and alone time doesn\'t count' });
}

/** Keeps one leaderboard message up to date in the chosen channel. */
async function updateBoard(guild, cfg) {
  const st = store(guild.id);
  st.boardAt = Date.now();
  const channel = guild.channels.cache.get(cfg.board);
  if (!channel) return;
  const card = boardCard(guild, cfg);
  const text = JSON.stringify(card.toJSON ? card.toJSON() : card);
  if (st.boardMessage && lastBoard.get(guild.id) === text) return; // nothing changed
  const body = { embeds: [card], allowedMentions: { parse: [] } };
  const existing = st.boardMessage ? await channel.messages.fetch(st.boardMessage).catch(() => null) : null;
  if (existing) await existing.edit(body);
  else st.boardMessage = (await channel.send(body)).id;
  if (!lastBoard.has(guild.id)) console.log(`Voice leaderboard in ${guild.name}: ${existing ? 'updated' : 'posted a new'} board in #${channel.name}`);
  lastBoard.set(guild.id, text);
  db.saveSoon();
}

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot || !message.member) return;
  const cfg = features.config(message.guildId, 'levels');
  if (!cfg.chatXp) return;
  const u = userOf(message.guildId, message.author.id);
  if (Date.now() - u.last < 60_000) return;
  u.last = Date.now();
  await addXp(message.member, Number(cfg.chatXpAmount ?? 5), message.channel);
}

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('See your level and voice hours, or someone else\'s')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('member').setDescription('Whose (default: yours)')),
  async execute(interaction) {
    const user = interaction.options.getUser?.('member') ?? interaction.options.getMember?.('member')?.user ?? interaction.user;
    if (user.bot) return interaction.reply(ephemeral('Bots don\'t earn XP.'));
    const u = userOf(interaction.guildId, user.id);
    const { level, into, needed } = levelOf(u.xp);
    const position = ranked(interaction.guildId).findIndex(([id]) => id === user.id) + 1;
    const cfg = features.config(interaction.guildId, 'levels');
    const card = embed(hexColor(cfg.color) ?? undefined)
      .setTitle(`${user.username} · level ${level}`)
      .setDescription(`${bar(into, needed)}\n**${Math.floor(into)} / ${needed} XP** to level ${level + 1}`)
      .addFields(
        { name: 'Rank', value: position ? `#${position}` : 'Not ranked yet', inline: true },
        { name: 'Voice this week', value: hours(u.week), inline: true },
        { name: 'Voice all time', value: hours(u.voice), inline: true },
      );
    if (user.displayAvatarURL) card.setThumbnail(user.displayAvatarURL({ size: 128 }));
    return interaction.reply({ embeds: [card] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Who spends the most time in voice')
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const cfg = features.config(interaction.guildId, 'levels');
    return interaction.reply({ embeds: [boardCard(interaction.guild, cfg)], allowedMentions: { parse: [] } });
  },
};

const xp = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('Give or take XP (server managers)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('XP to add (use a minus number to take away)').setRequired(true)),
  async execute(interaction) {
    const member = interaction.options.getMember('member');
    if (!member) return interaction.reply(ephemeral('That person isn\'t in this server.'));
    await addXp(member, interaction.options.getInteger('amount'), interaction.channel);
    const total = userOf(interaction.guildId, member.id).xp;
    return interaction.reply(ephemeral(`✅ ${member} now has ${Math.floor(total)} XP (level ${levelOf(total).level}).`));
  },
};

module.exports = {
  id: 'levels',
  emoji: '⭐',
  title: 'Levels (voice time)',
  group: 'levels',
  order: 1,
  help: 'Members earn XP for time spent in voice chat and level up. Time spent AFK, deafened or alone doesn\'t count. /rank and /leaderboard show where everyone is.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn levels on', default: true },
    { key: 'board', type: 'channel', label: 'Voice-hours leaderboard channel (Pixel Bot keeps one message updated there)', blank: '— no leaderboard channel —' },
    { key: 'announce', type: 'select', label: 'Level-up messages', options: { channel: 'Post in a channel', dm: 'DM the member', off: 'Don\'t announce' }, default: 'channel' },
    { key: 'channel', type: 'channel', label: 'Level-up channel', blank: '— pick a channel —' },
    { key: 'message', type: 'text', label: 'Level-up message', default: '🎉 {user} reached **level {level}**!', more: true, help: '{user} pings them, {level} is the new level.' },
    { key: 'ping', type: 'toggle', label: 'Ping them in the level-up message', default: true, more: true },
    { key: 'xpPerMinute', type: 'number', label: 'XP per minute in voice', default: 10, min: 0, more: true },
    { key: 'multiplier', type: 'number', label: 'XP boost (1 = normal, 2 = double XP weekend!)', default: 1, min: 0, step: 0.1, more: true },
    { key: 'skipDeafened', type: 'toggle', label: 'Don\'t count time while deafened', default: true, more: true },
    { key: 'needCompany', type: 'toggle', label: 'Don\'t count time spent alone in a channel', default: true, more: true },
    { key: 'skipMuted', type: 'toggle', label: 'Don\'t count time while muted', default: false, more: true },
    { key: 'noXpChannels', type: 'voice', label: 'A voice channel that doesn\'t count', more: true },
    { key: 'noXpRoles', type: 'roles', label: 'Roles that don\'t earn XP', more: true },
    { key: 'chatXp', type: 'toggle', label: 'Also give a little XP for chatting (once a minute)', default: false, more: true },
    { key: 'chatXpAmount', type: 'number', label: 'XP per chat message', default: 5, min: 0, more: true },
    { key: 'color', type: 'color', label: 'Card colour', more: true },
  ],
  status(cfg, guild, ui) {
    const n = ranked(guild.id).length;
    return ui.on(`${n ? `${ui.plural(n, 'member')} ranked` : 'Counting voice time'}${cfg.board ? `, board in ${ui.chan(guild, cfg.board)}` : ''}`);
  },
  onSave(guild) {
    store(guild.id).boardAt = 0; // refresh the board on the next check
  },
  dashboard(ctx) {
    const top = ranked(ctx.guild.id, 'voice').slice(0, 5);
    const name = (id) => ctx.esc(ctx.guild.members.cache.get(id)?.displayName ?? 'Someone who left');
    const list = top.length
      ? `<div class="rows">${top.map(([id, u], i) => `<div class="row"><span class="emoji">${['🥇', '🥈', '🥉', '4', '5'][i]}</span><span class="t"><b>${name(id)}</b><small>${hours(u.voice)} in voice, level ${levelOf(u.xp).level}</small></span></div>`).join('')}</div>`
      : '<p class="empty">Nobody has voice time yet.</p>';
    return `<h2 class="minor">Most time in voice</h2>${list}${ctx.more(ctx.form('reset', '<label class="toggle"><input type="checkbox" name="confirm" value="1" required> Yes, set everyone back to level 0 and clear voice hours</label>', 'Reset all levels'), 'Reset everyone')}`;
  },
  actions: {
    reset({ guild, form }) {
      if (!form.confirm) return { ok: false, text: 'Tick the box to confirm.' };
      store(guild.id).users = {};
      store(guild.id).boardAt = 0;
      db.save();
      return { ok: true, text: 'Everyone is back to level 0.' };
    },
  },
  commands: [rank, leaderboard, xp],
  events: [{ name: 'messageCreate', execute: onMessage }],
  fastTick: tick,
  levelOf, xpFor, addXp, ranked, store, counts, hours, userOf, weekKey,
};
