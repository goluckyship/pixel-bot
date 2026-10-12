const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { canManageRanks, changeRank } = require('../../lib/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Move a staff member up one rank')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('member').setDescription('Who to promote').setRequired(true)),

  async execute(interaction) {
    if (!canManageRanks(interaction.member)) {
      return interaction.reply(ephemeral('Only Staff Management and the server owner can promote staff.'));
    }
    const target = interaction.options.getMember('member');
    if (!target) return interaction.reply(ephemeral("That user isn't in this server."));

    const result = await changeRank(interaction.member, target, 1);
    await interaction.reply(result.ok ? { content: result.message, allowedMentions: { parse: [] } } : ephemeral(result.message));
  },
};
