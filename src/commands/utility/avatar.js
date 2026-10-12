const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../lib/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user\'s profile picture, full size')
    .addUserOption((option) => option.setName('user').setDescription('Whose avatar (default: yours)')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });

    await interaction.reply({
      embeds: [embed().setTitle(`${user.username}'s avatar`).setImage(url).setURL(url)],
    });
  },
};
