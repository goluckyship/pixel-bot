const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { sendLog, logEntry } = require('../../lib/log');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete the most recent messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('How many messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');

    // Deleting can take a moment, so tell Discord we're working on it.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // "true" skips messages older than 14 days, which Discord won't bulk-delete.
    const deleted = await interaction.channel.bulkDelete(amount, true);

    await sendLog(interaction.guild, logEntry({ user: interaction.user, description: `🧹 ${interaction.user} purged ${deleted.size} message(s) in ${interaction.channel}` }));
    const skipped = amount - deleted.size;
    const note = skipped > 0 ? ` (${skipped} couldn't be deleted: either there weren't that many, or they're over 14 days old.)` : '';
    await interaction.editReply(`🧹 Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'}.${note}`);
  },
};
