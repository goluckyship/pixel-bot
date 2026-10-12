const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { auditReason } = require('../../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Lift a ban so the user can rejoin')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName('user_id')
        .setDescription("The banned user's ID (a long number)")
        .setRequired(true)
        .setMaxLength(25),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Why').setMaxLength(400)),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id').trim();
    const reason = interaction.options.getString('reason') ?? 'No reason given';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply(ephemeral('That doesn\'t look like a user ID. It should be a long number, like `123456789012345678`.'));
    }

    try {
      const user = await interaction.guild.members.unban(userId, auditReason(interaction, reason));
      await interaction.reply(`✅ **${user?.tag ?? userId}** was unbanned.`);
    } catch (error) {
      // 10026 = Unknown Ban, 10013 = Unknown User
      if (error.code === 10026 || error.code === 10013) {
        return interaction.reply(ephemeral("That user isn't banned from this server."));
      }
      throw error;
    }
  },
};
