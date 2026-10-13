// AFK, done properly (Discord's own "inactive channel" only notices people who
// stop talking, so it moves the wrong people and never brings anyone back).
//
// Voice: someone deafened for a while (or sitting alone) is moved to an AFK room,
// and moved straight back to where they were when they undeafen.
// Text: /afk [reason] tells anyone who pings you that you're away.
const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const { ephemeral, truncate } = require('../lib/ui');
const { sendLog, logEntry } = require('../lib/log');

const store = (guildId) => features.data(guildId, 'afk', () => ({ users: {}, movedFrom: {} }));
const since = new Map(); // `${guild}:${member}:deaf|alone` -> when it started

const key = (member, what) => `${member.guild.id}:${member.id}:${what}`;
function timer(member, what, active) {
  const k = key(member, what);
  if (!active) {
    since.delete(k);
    return 0;
  }
  if (!since.has(k)) since.set(k, Date.now());
  return Date.now() - since.get(k);
}

/** Moves (or disconnects) an AFK member. */
async function sendAway(member, why) {
  const cfg = features.config(member.guild.id, 'afk');
  const from = member.voice.channel;
  if (cfg.action === 'disconnect') {
    await member.voice.disconnect(`AFK: ${why}`).catch(() => {});
  } else {
    const room = member.guild.channels.cache.get(cfg.room);
    if (!room || from?.id === room.id) return;
    store(member.guild.id).movedFrom[member.id] = from?.id ?? '';
    db.saveSoon();
    await member.voice.setChannel(room, `AFK: ${why}`).catch(() => {});
  }
  since.delete(key(member, 'deaf'));
  since.delete(key(member, 'alone'));
  if (cfg.log) await sendLog(member.guild, logEntry({ user: member.user, description: `💤 ${member} was ${cfg.action === 'disconnect' ? 'disconnected' : 'moved to the AFK room'} (${why})` })).catch(() => {});
}

/** Every 30 seconds: look for people who've gone AFK in voice. */
async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!features.isOn(guild.id, 'afk')) continue;
    const cfg = features.config(guild.id, 'afk');
    if (cfg.action !== 'disconnect' && !guild.channels.cache.get(cfg.room)) continue;
    const deafMs = Number(cfg.deafMinutes ?? 5) * 60_000;
    const aloneMs = Number(cfg.aloneMinutes ?? 0) * 60_000;
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased?.() || channel.id === cfg.room || channel.id === guild.afkChannelId) continue;
      for (const member of channel.members.values()) {
        if (member.user.bot || (cfg.ignoreRoles ?? []).some((id) => member.roles.cache.has(id))) continue;
        const deaf = Boolean(member.voice.selfDeaf || member.voice.serverDeaf);
        const alone = channel.members.filter((m) => !m.user.bot).size === 1;
        const deafFor = timer(member, 'deaf', deafMs > 0 && deaf);
        const aloneFor = timer(member, 'alone', aloneMs > 0 && alone);
        if (deafMs > 0 && deafFor >= deafMs) await sendAway(member, `deafened for ${cfg.deafMinutes} min`);
        else if (aloneMs > 0 && aloneFor >= aloneMs) await sendAway(member, `alone for ${cfg.aloneMinutes} min`);
      }
    }
  }
}

/** Undeafened in the AFK room: back to where they were. */
async function onVoice(before, after) {
  const member = after.member ?? before.member;
  if (!member) return;
  const cfg = features.config(member.guild.id, 'afk');
  const st = store(member.guild.id);
  if (!after.channelId || after.channelId !== cfg.room) {
    if (st.movedFrom[member.id] !== undefined && after.channelId !== cfg.room) {
      delete st.movedFrom[member.id];
      db.saveSoon();
    }
    return;
  }
  const woke = (before.selfDeaf || before.serverDeaf) && !after.selfDeaf && !after.serverDeaf;
  if (!woke || cfg.returnBack === false) return;
  const back = member.guild.channels.cache.get(st.movedFrom[member.id]);
  delete st.movedFrom[member.id];
  db.saveSoon();
  if (back) await member.voice.setChannel(back, 'Back from AFK').catch(() => {});
}

const afk = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Let people know you\'re away')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(200)),
  async execute(interaction) {
    const cfg = features.config(interaction.guildId, 'afk');
    if (cfg.textAfk === false) return interaction.reply(ephemeral('/afk is switched off here.'));
    const reason = interaction.options.getString('reason') ?? '';
    store(interaction.guildId).users[interaction.user.id] = { reason, since: Date.now() };
    db.save();
    if (cfg.nickname && interaction.member.manageable && !interaction.member.displayName.startsWith('[AFK]')) {
      await interaction.member.setNickname(truncate(`[AFK] ${interaction.member.displayName}`, 32), 'AFK').catch(() => {});
    }
    return interaction.reply({ content: `💤 ${interaction.user} is now AFK${reason ? `: ${reason}` : ''}`, allowedMentions: { parse: [] } });
  },
};

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  const st = store(message.guildId);
  if (st.users[message.author.id]) {
    const was = st.users[message.author.id];
    delete st.users[message.author.id];
    db.saveSoon();
    const member = message.member;
    if (member?.manageable && member.nickname?.startsWith('[AFK] ')) await member.setNickname(member.nickname.slice(6) || null, 'Back from AFK').catch(() => {});
    if (Date.now() - was.since > 15_000) {
      const note = await message.reply({ content: `👋 Welcome back ${message.author}! I took off your AFK.`, allowedMentions: { repliedUser: false } }).catch(() => null);
      if (note) setTimeout(() => note.delete().catch(() => {}), 8000).unref?.();
    }
  }
  const mentioned = [...(message.mentions?.users?.values?.() ?? [])].filter((u) => st.users[u.id]).slice(0, 5);
  if (!mentioned.length) return;
  const lines = mentioned.map((u) => `💤 **${u.username}** is AFK${st.users[u.id].reason ? `: ${st.users[u.id].reason}` : ''} (since <t:${Math.floor(st.users[u.id].since / 1000)}:R>)`);
  await message.reply({ content: lines.join('\n'), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
}

module.exports = {
  id: 'afk',
  emoji: '💤',
  title: 'AFK',
  group: 'community',
  order: 5,
  help: 'A smarter AFK than Discord\'s inactive channel. Anyone deafened for a while is moved to your AFK room, and moved straight back when they undeafen. AFK time never counts towards levels. Members can also use /afk to leave an away note. Tip: turn off Discord\'s own Inactive Channel (Server Settings → Overview) so the two don\'t fight.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn AFK on', default: true },
    { key: 'room', type: 'voice', label: 'AFK room', blank: '— pick a voice channel —' },
    { key: 'deafMinutes', type: 'number', label: 'Move people who are deafened for this many minutes (0 = never)', default: 5, min: 0 },
    { key: 'returnBack', type: 'toggle', label: 'Move them back when they undeafen', default: true },
    { key: 'aloneMinutes', type: 'number', label: 'Also move people sitting alone for this many minutes (0 = never)', default: 0, min: 0, more: true },
    { key: 'action', type: 'select', label: 'What to do with AFK people', options: { move: 'Move them to the AFK room', disconnect: 'Disconnect them from voice' }, default: 'move', more: true },
    { key: 'ignoreRoles', type: 'roles', label: 'Never move people with these roles', more: true },
    { key: 'log', type: 'toggle', label: 'Note it in the staff log', default: false, more: true },
    { key: 'textAfk', type: 'toggle', label: 'Allow /afk away notes', default: true, more: true },
    { key: 'nickname', type: 'toggle', label: 'Add [AFK] to nicknames while using /afk', default: false, more: true },
  ],
  status(cfg, guild, ui) {
    if (cfg.action !== 'disconnect' && !cfg.room) return ui.off('Pick an AFK room');
    return ui.on(cfg.action === 'disconnect' ? `Disconnects after ${cfg.deafMinutes} min deafened` : `Deafened ${cfg.deafMinutes} min → ${ui.chan(guild, cfg.room)}`);
  },
  commands: [afk],
  events: [
    { name: 'voiceStateUpdate', execute: onVoice },
    { name: 'messageCreate', execute: onMessage },
  ],
  tick,
  sendAway, store,
};
