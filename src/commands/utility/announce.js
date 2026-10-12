const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const { ephemeral, embed, COLORS } = require('../../lib/ui');
const { form, value, parseColor, isHttpsUrl } = require('../../lib/forms');

const PING_NAMES = { none: null, everyone: '@everyone', here: '@here' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a styled announcement as Pixel Bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Where to post it').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option
        .setName('ping')
        .setDescription('Who to ping (default: nobody)')
        .addChoices({ name: 'Nobody', value: 'none' }, { name: '@everyone', value: 'everyone' }, { name: '@here', value: 'here' }),
    )
    .addRoleOption((option) => option.setName('role').setDescription('Or ping a role')),

  components: {
    announce: async (interaction, channelId, ping, roleId) => {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply(ephemeral('That channel no longer exists.'));
      const color = parseColor(value(interaction, 'color'));
      const image = value(interaction, 'image');
      if (Number.isNaN(color)) return interaction.reply(ephemeral('The colour should look like `#7c5cff`. Nothing was posted.'));
      if (image && !isHttpsUrl(image)) return interaction.reply(ephemeral('The image link must start with https://. Nothing was posted.'));

      const card = embed(color ?? COLORS.brand).setDescription(value(interaction, 'message')).setTimestamp()
        .setFooter({ text: `Posted by ${interaction.user.username}` });
      const title = value(interaction, 'title');
      if (title) card.setTitle(title);
      if (image) card.setImage(image);

      const mention = roleId && roleId !== '-' ? `<@&${roleId}>` : PING_NAMES[ping];
      await channel.send({
        content: mention ?? undefined,
        embeds: [card],
        allowedMentions: mention ? (roleId && roleId !== '-' ? { roles: [roleId] } : { parse: ['everyone'] }) : { parse: [] },
      });
      return interaction.reply(ephemeral(`📢 Announcement posted in ${channel}.`));
    },
  },

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const ping = interaction.options.getString('ping') ?? 'none';
    const role = interaction.options.getRole('role');
    const pingsEveryone = ping !== 'none' || (role && !role.mentionable);
    if (pingsEveryone && !interaction.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      return interaction.reply(ephemeral('You need the Mention @everyone permission to ping that.'));
    }
    if (!channel.permissionsFor(interaction.guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply(ephemeral(`I can't post in ${channel}. Give my role access there first.`));
    }
    await interaction.showModal(
      form(`pb:announce:${channel.id}:${ping}:${role?.id ?? '-'}`, 'New announcement', [
        { id: 'title', label: 'Title (optional)', max: 256 },
        { id: 'message', label: 'Announcement', long: true, required: true, max: 4000 },
        { id: 'color', label: 'Colour (optional, like #7c5cff)', max: 7 },
        { id: 'image', label: 'Image link (optional, https://...)', max: 500 },
      ]),
    );
  },
};
