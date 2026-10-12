const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { embed } = require('../../lib/ui');
const db = require('../../lib/storage');
const automod = require('../../lib/automod');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Automatic moderation for invite links, mass mentions and spam')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName('show').setDescription('See which automod rules are on'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Turn an automod rule on or off')
        .addStringOption((option) =>
          option
            .setName('rule')
            .setDescription('Which rule')
            .setRequired(true)
            .addChoices(
              { name: 'Invite links', value: 'invites' },
              { name: 'Mass mentions', value: 'mentions' },
              { name: 'Spam', value: 'spam' },
            ),
        )
        .addBooleanOption((option) => option.setName('on').setDescription('On or off').setRequired(true)),
    ),

  async execute(interaction) {
    const rules = automod.settings(interaction.guildId);
    if (interaction.options.getSubcommand() === 'set') {
      const rule = interaction.options.getString('rule');
      rules[rule] = interaction.options.getBoolean('on');
      db.save();
    }
    const lines = Object.entries(automod.FEATURES).map(([key, text]) => `${rules[key] ? '🟢 **On**' : '⚪ Off'} · ${text}`);
    await interaction.reply({
      embeds: [embed().setTitle('Automod').setDescription(`${lines.join('\n')}\n\nMembers with Manage Messages are never affected.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
