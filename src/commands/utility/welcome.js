const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const db = require('../../lib/storage');
const { welcomeMessage } = require('../../events/guildMemberAdd');

const DEFAULT_MESSAGE = require('../../config').welcome.message;

module.exports = {
  DEFAULT_MESSAGE,
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Greet new members automatically')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Turn on welcome messages')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where to post the welcome')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Use {user}, {username}, {server} and {count}. Leave empty for the default.')
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) => sub.setName('off').setDescription('Turn off welcome messages'))
    .addSubcommand((sub) => sub.setName('test').setDescription('Preview the welcome message (only you can see it)')),

  async execute(interaction) {
    const settings = db.guild(interaction.guildId);
    const action = interaction.options.getSubcommand();

    if (action === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message') ?? require('../../lib/settings').get(interaction.guild.id).welcome.message;

      // Make sure I can actually post there before saving.
      const me = interaction.guild.members.me;
      const canPost = channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
      if (!canPost) {
        return interaction.reply(ephemeral(`I can't send messages in <#${channel.id}>. Give me access to that channel first.`));
      }

      settings.welcome = { ...(settings.welcome ?? {}), channelId: channel.id, message };
      db.save();
      return interaction.reply(
        ephemeral(`✅ New members will be welcomed in <#${channel.id}>. Use \`/welcome test\` to preview it.`),
      );
    }

    if (action === 'off') {
      if (!settings.welcome) return interaction.reply(ephemeral('Welcome messages are already off.'));
      settings.welcome = null;
      db.save();
      return interaction.reply(ephemeral('✅ Welcome messages are off.'));
    }

    // test
    if (!settings.welcome) {
      return interaction.reply(ephemeral('Welcome messages are off. Turn them on with `/welcome set`.'));
    }
    const preview = welcomeMessage(settings.welcome, interaction.member);
    return interaction.reply({
      ...ephemeral(`**Preview** (posts in <#${settings.welcome.channelId}>):${preview.embeds ? '' : `\n\n${preview.content}`}`),
      embeds: preview.embeds ?? [],
    });
  },
};
