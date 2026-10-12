const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { checkTarget, auditReason } = require('../../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('End a member\'s timeout early')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Who to un-mute').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');

    const problem = checkTarget(interaction, target, 'moderatable', 'un-mute');
    if (problem) return interaction.reply(ephemeral(problem));

    if (!target.isCommunicationDisabled()) {
      return interaction.reply(ephemeral(`${target.user.tag} isn't timed out.`));
    }

    await target.timeout(null, auditReason(interaction, 'Timeout removed'));
    await interaction.reply(`🔊 **${target.user.tag}** can chat again.`);
  },
};
