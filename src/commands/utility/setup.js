const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const settings = require('../../lib/settings');
const db = require('../../lib/storage');
const { findRole, findRoles, findChannel, findCategory } = require('../../lib/resolve');
const { embed, truncate, COLORS } = require('../../lib/ui');
const automod = require('../../lib/automod');

const NEEDED = [
  ['ManageRoles', 'Manage Roles (auto roles, Staff role, promote, role buttons)'],
  ['ManageChannels', 'Manage Channels (tickets)'],
  ['KickMembers', 'Kick Members'],
  ['BanMembers', 'Ban Members'],
  ['ModerateMembers', 'Timeout Members'],
  ['ManageMessages', 'Manage Messages (purge, filter, automod)'],
  ['ManageGuildExpressions', 'Manage Expressions (/addemoji)'],
  ['AttachFiles', 'Attach Files (ticket transcripts)'],
];

/** Checks every setting and returns lines for the report. */
function report(guild) {
  const config = settings.get(guild.id);
  const problems = [];
  const show = (thing, label) => (thing ? `${thing}` : `❌ not found (${label})`);
  const roleLine = (entry) => {
    const role = findRole(guild, entry);
    if (!role) {
      problems.push(`Role **${entry}** in the settings wasn't found.`);
      return `❌ ${entry}`;
    }
    if (!role.editable) problems.push(`My role must be above ${role} to manage it.`);
    return `${role}`;
  };

  const welcome = db.guild(guild.id).welcome;
  const logs = findChannel(guild, config.logChannel);
  const category = findCategory(guild, config.tickets.category);
  const transcripts = findChannel(guild, config.tickets.transcriptChannel);
  if (!logs) problems.push(`Log channel **${config.logChannel}** wasn't found.`);
  if (!category) problems.push(`Ticket category **${config.tickets.category}** wasn't found, so tickets will be created without a category.`);
  if (!transcripts) problems.push(`Transcript channel **${config.tickets.transcriptChannel}** wasn't found, so transcripts will go to the log.`);

  const me = guild.members.me;
  for (const [flag, label] of NEEDED) {
    if (!me.permissions.has(PermissionFlagsBits[flag])) problems.push(`I'm missing the **${label}** permission.`);
  }

  const rules = automod.settings(guild.id);
  const fields = [
    { name: 'Join roles', value: config.autoroles.map(roleLine).join(' ') || 'None' },
    { name: 'Staff role', value: `${roleLine(config.staffRole)} for anyone with: ${config.staffSourceRoles.map(roleLine).join(' ')}` },
    { name: 'Rank ladder (lowest first)', value: config.ranks.map(roleLine).join(' → ') },
    { name: 'Who can promote', value: `Server owner, Administrators, ${findRoles(guild, config.rankManagers).join(' ') || '❌ none found'}` },
    { name: 'Staff log', value: show(logs, config.logChannel), inline: true },
    { name: 'Welcome', value: welcome ? `<#${welcome.channelId}>` : 'Off (/welcome set)', inline: true },
    { name: 'Tickets', value: `Category: ${show(category, config.tickets.category)}\nTranscripts: ${show(transcripts, config.tickets.transcriptChannel)}\nStaff: ${config.tickets.staffRoles.map(roleLine).join(' ')}` },
    { name: 'Automod', value: Object.keys(automod.FEATURES).map((key) => `${key}: ${rules[key] ? 'on' : 'off'}`).join(' · ') },
  ];
  return { fields, problems: [...new Set(problems)] };
}

module.exports = {
  report,
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription("Check Pixel Bot's setup for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName('show').setDescription('Show every setting and anything that needs fixing')),

  async execute(interaction) {
    const { fields, problems } = report(interaction.guild);
    const card = embed(problems.length ? COLORS.warning : COLORS.success)
      .setTitle('Pixel Bot setup')
      .addFields(fields.map((field) => ({ ...field, value: truncate(field.value, 1024) })))
      .addFields({
        name: problems.length ? `⚠️ ${problems.length} thing(s) to fix` : '✅ Everything looks good',
        value: truncate(problems.length ? problems.map((p) => `• ${p}`).join('\n') : 'Change settings in the dashboard or src/config.js.', 1024),
      });
    await interaction.reply({ embeds: [card], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
};
