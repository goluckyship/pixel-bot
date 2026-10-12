const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check that Pixel Bot is awake and how fast it responds'),

  async execute(interaction) {
    await interaction.reply('🏓 Pinging…');
    const sent = await interaction.fetchReply();
    const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Reply took ${roundTrip}ms.`);
  },
};
