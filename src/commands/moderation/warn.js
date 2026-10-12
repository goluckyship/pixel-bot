const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { checkTarget } = require('../../lib/moderation');
const db = require('../../lib/storage');
const { sendLog, logEntry } = require('../../lib/log');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Give a member a warning (saved to their record)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('user').setDescription('Who to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    const problem = checkTarget(interaction, target, null, 'warn');
    if (problem) return interaction.reply(ephemeral(problem));
    if (target.user.bot) return interaction.reply(ephemeral("Bots can't be warned."));

    const settings = db.guild(interaction.guildId);
    settings.warnCounter += 1;
    const list = (settings.warnings[target.id] ??= []);
    list.push({ id: settings.warnCounter, reason, moderatorId: interaction.user.id, at: Date.now() });
    db.save();

    // Let them know privately. This fails if their DMs are closed, which is fine.
    const dmSent = await target
      .send(`⚠️ You received a warning in **${interaction.guild.name}**: ${reason}`)
      .then(() => true)
      .catch(() => false);

    await sendLog(interaction.guild, logEntry({ user: target.user, description: `⚠️ **${target.user.tag}** was warned by ${interaction.user} (warning #${settings.warnCounter})\n**Reason:** ${reason}`, footer: `ID: ${target.id}` }));
    await interaction.reply(
      `⚠️ **${target.user.tag}** was warned. Reason: ${reason}\n` +
        `They now have ${list.length} warning${list.length === 1 ? '' : 's'}.` +
        (dmSent ? '' : " (I couldn't DM them.)"),
    );
  },
};
