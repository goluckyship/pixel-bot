const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const codes = require('../../lib/logincodes');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('Log in to the Pixel Bot dashboard on a computer where Discord is blocked')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((option) =>
      option.setName('code').setDescription('The code shown on the dashboard page').setRequired(true).setMinLength(4).setMaxLength(12),
    ),

  async execute(interaction) {
    const u = interaction.user;
    const result = codes.claim(interaction.options.getString('code'), {
      id: u.id,
      username: u.globalName || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
    });
    if (result === 'ok') {
      return interaction.reply(ephemeral('✅ Done! The dashboard page will log you in within a few seconds.\nOnly ever enter a code that\'s on a screen right in front of you.'));
    }
    if (result === 'slow down') return interaction.reply(ephemeral('Too many wrong codes. Wait 10 minutes and get a new code on the dashboard.'));
    return interaction.reply(ephemeral('That code didn\'t match. Check the code on the dashboard page (they last 10 minutes), or click "Get a new code" there.'));
  },
};
