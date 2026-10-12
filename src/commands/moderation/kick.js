const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { checkTarget, auditReason } = require('../../lib/moderation');
const { sendLog, logEntry } = require('../../lib/log');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Remove a member from the server (they can rejoin with an invite)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Who to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setMaxLength(400)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason given';

    const problem = checkTarget(interaction, target, 'kickable', 'kick');
    if (problem) return interaction.reply(ephemeral(problem));

    await target.kick(auditReason(interaction, reason));
    await sendLog(interaction.guild, logEntry({ user: target.user, description: `👢 **${target.user.tag}** was kicked by ${interaction.user}\n**Reason:** ${reason}`, footer: `ID: ${target.id}` }));
    await interaction.reply(`👢 **${target.user.tag}** was kicked. Reason: ${reason}`);
  },
};
