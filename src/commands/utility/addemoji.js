const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addemoji')
    .setDescription('Add a custom emoji to the server from an image')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName('name').setDescription('Emoji name (letters, numbers and _)').setRequired(true).setMinLength(2).setMaxLength(32),
    )
    .addAttachmentOption((option) => option.setName('image').setDescription('The image (PNG, JPG or GIF under 256 KB)'))
    .addStringOption((option) => option.setName('url').setDescription('Or a link to the image').setMaxLength(500)),

  async execute(interaction) {
    const name = interaction.options.getString('name').trim();
    const image = interaction.options.getAttachment('image')?.url ?? interaction.options.getString('url')?.trim();

    if (!/^\w{2,32}$/.test(name)) {
      return interaction.reply(ephemeral('Emoji names can only use letters, numbers and underscores, like `pixel_heart`.'));
    }
    if (!image || !/^https:\/\//i.test(image)) {
      return interaction.reply(ephemeral('Attach an image, or give a link starting with https://'));
    }

    await interaction.deferReply();
    try {
      const emoji = await interaction.guild.emojis.create({ attachment: image, name, reason: `Added by ${interaction.user.tag}` });
      await interaction.editReply(`Added ${emoji} as \`:${emoji.name}:\``);
    } catch (error) {
      await interaction.editReply(
        `I couldn't add that emoji. Make sure it's a PNG, JPG or GIF under 256 KB and the server has free emoji slots. (${error.message})`,
      );
    }
  },
};
