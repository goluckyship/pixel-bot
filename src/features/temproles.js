// Temp roles: give someone a role that takes itself away later.
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const { ephemeral } = require('../lib/ui');
const { parseDuration, formatDuration } = require('../lib/duration');

const store = (guildId) => features.data(guildId, 'temproles', () => ({ items: [] })); // [{ userId, roleId, until, by }]

const temprole = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Give a role that removes itself later')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('give').setDescription('Give someone a role for a while')
        .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Which role').setRequired(true))
        .addStringOption((o) => o.setName('duration').setDescription('How long, like 2h, 3d or 1w').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('See temporary roles and when they end')),
  async execute(interaction) {
    const st = store(interaction.guildId);
    if (interaction.options.getSubcommand() === 'list') {
      if (!st.items.length) return interaction.reply(ephemeral('No temporary roles right now.'));
      return interaction.reply(ephemeral(st.items.map((t) => `<@${t.userId}> has <@&${t.roleId}> until <t:${Math.floor(t.until / 1000)}:f> (<t:${Math.floor(t.until / 1000)}:R>)`).join('\n').slice(0, 2000)));
    }
    const member = interaction.options.getMember('member');
    const role = interaction.options.getRole('role');
    const ms = parseDuration(interaction.options.getString('duration'));
    if (!member) return interaction.reply(ephemeral('That person isn\'t in this server.'));
    if (!ms) return interaction.reply(ephemeral('I didn\'t understand that duration. Try 30m, 2h, 3d or 1w.'));
    if (role.managed || role.id === interaction.guildId || !role.editable) return interaction.reply(ephemeral(`I can't hand out ${role}. My role needs to be above it.`));
    if (interaction.member.roles.highest && role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply(ephemeral('You can only hand out roles below your own highest role.'));
    }
    await member.roles.add(role, `Temp role from ${interaction.user.tag} for ${formatDuration(ms)}`);
    st.items = st.items.filter((t) => !(t.userId === member.id && t.roleId === role.id));
    st.items.push({ userId: member.id, roleId: role.id, until: Date.now() + ms, by: interaction.user.id });
    db.save();
    return interaction.reply({ content: `⏳ ${member} has ${role} for ${formatDuration(ms)} (until <t:${Math.floor((Date.now() + ms) / 1000)}:f>).`, allowedMentions: { parse: [] } });
  },
};

async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    const st = store(guild.id);
    const due = st.items.filter((t) => t.until <= Date.now());
    if (!due.length) continue;
    for (const t of due) {
      const member = guild.members.cache.get(t.userId) ?? (await guild.members.fetch(t.userId).catch(() => null));
      const role = guild.roles.cache.get(t.roleId);
      if (member && role?.editable) await member.roles.remove(role, 'Temp role ended').catch(() => {});
    }
    st.items = st.items.filter((t) => t.until > Date.now());
    db.save();
  }
}

module.exports = {
  id: 'temproles',
  emoji: '⏳',
  title: 'Temp roles',
  group: 'safety',
  order: 62,
  help: 'Give someone a role for a set time with /temprole give, like a 3-day "Event Winner" or a week of "Muted". It comes off by itself.',
  fields: [{ key: 'enabled', type: 'toggle', label: 'Turn temp roles on', default: true }],
  status(cfg, guild, ui) {
    const n = store(guild.id).items.length;
    return ui.on(n ? `${ui.plural(n, 'temp role')} active` : 'Ready');
  },
  commands: [temprole],
  tick,
};
