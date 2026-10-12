const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { embed } = require('../../lib/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show details about this server')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { guild } = interaction;
    const created = Math.floor(guild.createdTimestamp / 1000);

    const card = embed()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Members', value: guild.memberCount.toLocaleString('en-US'), inline: true },
        { name: 'Boosts', value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
        { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
        { name: 'Roles', value: String(guild.roles.cache.size - 1), inline: true }, // -1 skips @everyone
        { name: 'Created', value: `<t:${created}:D> (<t:${created}:R>)` },
      );

    await interaction.reply({ embeds: [card] });
  },
};
