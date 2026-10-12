const { SlashCommandBuilder } = require('discord.js');
const { embed, pick, truncate } = require('../../lib/ui');

const ANSWERS = [
  // yes
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You can count on it.',
  'Most likely.', 'Looks good to me.', 'Signs point to yes.',
  // maybe
  'Hard to say. Ask again.', 'Ask me later.', 'I can\'t tell right now.', 'Focus and ask again.',
  // no
  'Don\'t count on it.', 'My answer is no.', 'Not looking good.', 'Very doubtful.', 'Absolutely not.',
];

module.exports = {
  ANSWERS,
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a yes or no question')
    .addStringOption((option) =>
      option.setName('question').setDescription('What do you want to know?').setRequired(true).setMaxLength(200),
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    await interaction.reply({
      embeds: [
        embed().addFields(
          { name: 'Question', value: truncate(question, 1024) },
          { name: '🎱 Answer', value: pick(ANSWERS) },
        ),
      ],
    });
  },
};
