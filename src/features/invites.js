// Invite tracking: see who invited each new member, and who's brought in the most.
const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const { embed, ephemeral, fill, truncate } = require('../lib/ui');

const uses = new Map(); // guild -> Map(code -> { uses, inviterId })
const store = (guildId) => features.data(guildId, 'invites', () => ({ inviters: {}, joinedBy: {} })); // inviters: id -> { joins, left }

async function snapshot(guild) {
  const list = await guild.invites.fetch().catch(() => null);
  if (!list) return null;
  const map = new Map();
  for (const inv of list.values()) map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id ?? inv.inviterId ?? null });
  uses.set(guild.id, map);
  return map;
}

async function onJoin(member) {
  if (member.user.bot) return;
  const before = uses.get(member.guild.id) ?? new Map();
  const after = await snapshot(member.guild);
  if (!after) return;
  let inviterId = null;
  let code = null;
  for (const [c, now] of after) {
    if (now.uses > (before.get(c)?.uses ?? 0)) {
      inviterId = now.inviterId;
      code = c;
      break;
    }
  }
  if (!code && member.guild.vanityURLCode) code = member.guild.vanityURLCode;
  const st = store(member.guild.id);
  if (inviterId) {
    const inv = (st.inviters[inviterId] ??= { joins: 0, left: 0 });
    inv.joins += 1;
    st.joinedBy[member.id] = inviterId;
    db.saveSoon();
  }
  const cfg = features.config(member.guild.id, 'invites');
  const channel = member.guild.channels.cache.get(cfg.channel);
  if (!channel) return;
  const count = inviterId ? st.inviters[inviterId].joins - st.inviters[inviterId].left : 0;
  const text = inviterId
    ? fill(cfg.message || '📨 {user} joined, invited by {inviter} ({invites} invites)', { member }).replaceAll('{inviter}', `<@${inviterId}>`).replaceAll('{invites}', String(count))
    : fill(cfg.unknown || '📨 {user} joined (I couldn\'t tell who invited them)', { member });
  await channel.send({ content: truncate(text, 2000), allowedMentions: { parse: [] } }).catch(() => {});
}

function onLeave(member) {
  const st = store(member.guild.id);
  const inviterId = st.joinedBy[member.id];
  if (!inviterId) return;
  st.inviters[inviterId] ??= { joins: 0, left: 0 };
  st.inviters[inviterId].left += 1;
  delete st.joinedBy[member.id];
  db.saveSoon();
}

const invites = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('See how many people someone invited, or the top inviters')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('member').setDescription('Whose invites (leave empty for the top inviters)')),
  async execute(interaction) {
    const st = store(interaction.guildId);
    const user = interaction.options.getUser?.('member');
    if (user) {
      const i = st.inviters[user.id] ?? { joins: 0, left: 0 };
      return interaction.reply({ embeds: [embed().setDescription(`📨 <@${user.id}> has **${i.joins - i.left}** invites (${i.joins} joined, ${i.left} left).`)], allowedMentions: { parse: [] } });
    }
    const top = Object.entries(st.inviters).map(([id, i]) => [id, i.joins - i.left]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return interaction.reply(ephemeral('No tracked invites yet.'));
    return interaction.reply({ embeds: [embed().setTitle('📨 Top inviters').setDescription(top.map(([id, n], k) => `**${k + 1}.** <@${id}> · ${n}`).join('\n'))], allowedMentions: { parse: [] } });
  },
};

async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (features.isOn(guild.id, 'invites') && !uses.has(guild.id)) await snapshot(guild);
  }
}

module.exports = {
  id: 'invites',
  emoji: '📨',
  title: 'Invite tracking',
  group: 'safety',
  order: 64,
  help: 'Shows who invited each new member and keeps score with /invites. Pixel Bot needs the Manage Server permission to see invites.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Track invites', default: false },
    { key: 'channel', type: 'channel', label: 'Post "who invited who" here (optional)', blank: '— don\'t post —' },
    { key: 'message', type: 'text', label: 'Message', default: '📨 {user} joined, invited by {inviter} ({invites} invites)', more: true },
    { key: 'unknown', type: 'text', label: 'Message when the inviter is unknown', default: '📨 {user} joined (I couldn\'t tell who invited them)', more: true },
  ],
  status(cfg, guild, ui) {
    const n = Object.keys(store(guild.id).inviters).length;
    return ui.on(n ? `${ui.plural(n, 'inviter')} tracked` : 'On');
  },
  commands: [invites],
  events: [
    { name: 'guildMemberAdd', execute: onJoin },
    { name: 'guildMemberRemove', execute: onLeave },
    { name: 'inviteCreate', execute: (invite) => invite.guild && snapshot(invite.guild) },
    { name: 'inviteDelete', execute: (invite) => invite.guild && snapshot(invite.guild) },
  ],
  tick,
};
