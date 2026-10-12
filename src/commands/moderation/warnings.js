const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { embed, truncate, COLORS } = require('../../lib/ui');
const db = require('../../lib/storage');

const SHOWN = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('See a member\'s warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Whose warnings to show').setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const list = db.guild(interaction.guildId).warnings[user.id] ?? [];

    if (list.length === 0) {
      return interaction.reply(`✅ **${user.tag}** has no warnings.`);
    }

    const recent = list.slice(-SHOWN).reverse(); // newest first
    const lines = recent.map(
      (warning) =>
        `**#${warning.id}** · <t:${Math.floor(warning.at / 1000)}:d> · by <@${warning.moderatorId}>\n${truncate(warning.reason, 300)}`,
    );

    const card = embed(COLORS.warning)
      .setTitle(`Warnings for ${user.tag}`)
      .setDescription(lines.join('\n\n'))
      .setFooter({
        text: list.length > SHOWN ? `Showing the latest ${SHOWN} of ${list.length}` : `${list.length} total`,
      });

    await interaction.reply({ embeds: [card] });
  },
};
