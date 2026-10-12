const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { checkTarget, auditReason } = require('../../lib/moderation');
const { parseDuration, formatDuration } = require('../../lib/duration');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord's limit is 28 days

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Mute a member for a while (they can\'t chat, react or join voice)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Who to time out').setRequired(true))
    .addStringOption((option) =>
      option.setName('duration').setDescription('How long, like 10m, 2h or 1d (max 28d)').setRequired(true).setMaxLength(40),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Why').setMaxLength(400)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason given';
    const duration = parseDuration(interaction.options.getString('duration'));

    if (!duration) {
      return interaction.reply(ephemeral('I didn\'t understand that duration. Try `10m`, `2h`, `1d` or `1h 30m`.'));
    }
    if (duration > MAX_TIMEOUT_MS) {
      return interaction.reply(ephemeral('Timeouts can last 28 days at most.'));
    }

    const problem = checkTarget(interaction, target, 'moderatable', 'time out');
    if (problem) return interaction.reply(ephemeral(problem));

    await target.timeout(duration, auditReason(interaction, reason));
    await interaction.reply(`🔇 **${target.user.tag}** was timed out for ${formatDuration(duration)}. Reason: ${reason}`);
  },
};
