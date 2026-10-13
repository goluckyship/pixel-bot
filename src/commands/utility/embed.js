const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const { ephemeral, embed, COLORS } = require('../../lib/ui');
const { form, value, parseColor, isHttpsUrl } = require('../../lib/forms');

const FIELDS = (existing = {}) => [
  { id: 'title', label: 'Title', max: 256, value: existing.title },
  { id: 'description', label: 'Text', long: true, max: 4000, value: existing.description },
  { id: 'color', label: 'Colour (like #7c5cff)', max: 7, value: existing.color },
  { id: 'image', label: 'Image link (https://...)', max: 500, value: existing.image },
  { id: 'footer', label: 'Footer (small text at the bottom)', max: 2048, value: existing.footer },
];

/** Builds the embed from the form, or returns an error message. */
function fromForm(interaction) {
  const title = value(interaction, 'title');
  const description = value(interaction, 'description');
  const color = parseColor(value(interaction, 'color'));
  const image = value(interaction, 'image');
  const footer = value(interaction, 'footer');
  if (!title && !description && !image) return { error: 'Add at least a title, some text or an image.' };
  if (Number.isNaN(color)) return { error: 'The colour should look like `#7c5cff`.' };
  if (image && !isHttpsUrl(image)) return { error: 'The image link must start with https://' };
  const card = embed(color);
  if (title) card.setTitle(title);
  if (description) card.setDescription(description);
  if (image) card.setImage(image);
  if (footer) card.setFooter({ text: footer });
  return { card };
}

/** "https://discord.com/channels/guild/channel/message" -> { channelId, messageId } */
function parseLink(link) {
  const match = /channels\/(\d+)\/(\d+)\/(\d+)/.exec(link ?? '');
  return match ? { guildId: match[1], channelId: match[2], messageId: match[3] } : null;
}

module.exports = {
  parseLink,
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Make or edit a styled message, no code needed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Make a new styled message')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Where to post it (default: here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Change a styled message Pixel Bot posted')
        .addStringOption((option) =>
          option.setName('message_link').setDescription('Right-click the message → Copy Message Link').setRequired(true).setMaxLength(200),
        ),
    ),

  components: {
    embed: async (interaction, action, channelId, messageId) => {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply(ephemeral('That channel no longer exists.'));
      const { card, error } = fromForm(interaction);
      if (error) return interaction.reply(ephemeral(`${error} Nothing was changed.`));
      if (action === 'edit') {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return interaction.reply(ephemeral("I couldn't find that message any more."));
        await message.edit({ embeds: [card] });
        return interaction.reply(ephemeral(`✏️ Updated: ${message.url}`));
      }
      const sent = await channel.send({ embeds: [card] });
      return interaction.reply(ephemeral(`✅ Posted in ${channel}: ${sent.url}`));
    },
  },

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'create') {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!channel.permissionsFor(interaction.guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply(ephemeral(`I can't post in ${channel}. Give my role access there first.`));
      }
      return interaction.showModal(form(`pb:embed:create:${channel.id}`, 'New styled message', FIELDS()));
    }

    const link = parseLink(interaction.options.getString('message_link'));
    if (!link || link.guildId !== interaction.guildId) {
      return interaction.reply(ephemeral('That isn\'t a message link from this server. Right-click the message → **Copy Message Link**.'));
    }
    const channel = interaction.guild.channels.cache.get(link.channelId);
    const message = await channel?.messages.fetch(link.messageId).catch(() => null);
    if (!message) return interaction.reply(ephemeral("I couldn't find that message."));
    if (message.author.id !== interaction.client.user.id) {
      return interaction.reply(ephemeral('I can only edit messages that Pixel Bot posted.'));
    }
    const old = message.embeds[0];
    const existing = old
      ? { title: old.title, description: old.description, color: old.hexColor ?? (old.color != null ? `#${old.color.toString(16).padStart(6, '0')}` : ''), image: old.image?.url, footer: old.footer?.text }
      : {};
    return interaction.showModal(form(`pb:embed:edit:${channel.id}:${message.id}`, 'Edit styled message', FIELDS(existing)));
  },
};
