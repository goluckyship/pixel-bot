const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { checkTarget, auditReason } = require('../../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Who to ban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setMaxLength(400))
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Also delete their messages from the last 0-7 days (default: 0)')
        .setMinValue(0)
        .setMaxValue(7),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const member = interaction.options.getMember('user'); // null if they aren't in the server
    const reason = interaction.options.getString('reason') ?? 'No reason given';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    if (member) {
      const problem = checkTarget(interaction, member, 'bannable', 'ban');
      if (problem) return interaction.reply(ephemeral(problem));
    } else if (user.id === interaction.user.id || user.id === interaction.client.user.id) {
      return interaction.reply(ephemeral("That's not someone I can ban."));
    }

    await interaction.guild.members.ban(user.id, {
      reason: auditReason(interaction, reason),
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });
    await interaction.reply(`🔨 **${user.tag}** was banned. Reason: ${reason}`);
  },
};
