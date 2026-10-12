const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const db = require('../../lib/storage');
const { sendLog, logEntry } = require('../../lib/log');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Remove one warning, or all of a member\'s warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Whose warnings to clear').setRequired(true))
    .addIntegerOption((option) =>
      option.setName('number').setDescription('A single warning number to remove (leave empty to clear all)').setMinValue(1),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const number = interaction.options.getInteger('number');
    const settings = db.guild(interaction.guildId);
    const list = settings.warnings[user.id] ?? [];

    if (list.length === 0) {
      return interaction.reply(ephemeral(`${user.tag} has no warnings to clear.`));
    }

    if (number === null) {
      delete settings.warnings[user.id];
      db.save();
    await sendLog(interaction.guild, logEntry({ user: interaction.user, description: `🧽 ${interaction.user} cleared all warnings for **${user.tag}**`, footer: `ID: ${user.id}` }));
      return interaction.reply(`🧽 Cleared all ${list.length} warning${list.length === 1 ? '' : 's'} for **${user.tag}**.`);
    }

    const remaining = list.filter((warning) => warning.id !== number);
    if (remaining.length === list.length) {
      return interaction.reply(ephemeral(`${user.tag} doesn't have a warning #${number}. Use \`/warnings\` to see their list.`));
    }

    if (remaining.length === 0) delete settings.warnings[user.id];
    else settings.warnings[user.id] = remaining;
    db.save();
    await sendLog(interaction.guild, logEntry({ user: interaction.user, description: `🧽 ${interaction.user} cleared warning #${number} for **${user.tag}**`, footer: `ID: ${user.id}` }));
    await interaction.reply(`🧽 Removed warning #${number} from **${user.tag}**.`);
  },
};
