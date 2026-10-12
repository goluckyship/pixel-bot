const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');

const OPTION_NAMES = ['option1', 'option2', 'option3', 'option4', 'option5', 'option6'];

const builder = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Start a poll for people to vote on')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option.setName('question').setDescription('What are you asking?').setRequired(true).setMaxLength(300),
  );

// option1 and option2 are required; the rest are optional.
OPTION_NAMES.forEach((name, index) => {
  builder.addStringOption((option) =>
    option
      .setName(name)
      .setDescription(`Choice ${index + 1}`)
      .setRequired(index < 2)
      .setMaxLength(55),
  );
});

builder
  .addIntegerOption((option) =>
    option
      .setName('duration')
      .setDescription('How long voting stays open (default: 1 day)')
      .addChoices(
        { name: '1 hour', value: 1 },
        { name: '4 hours', value: 4 },
        { name: '8 hours', value: 8 },
        { name: '1 day', value: 24 },
        { name: '3 days', value: 72 },
        { name: '1 week', value: 168 },
      ),
  )
  .addBooleanOption((option) => option.setName('multiple').setDescription('Let people pick more than one choice'));

module.exports = {
  data: builder,

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const choices = OPTION_NAMES.map((name) => interaction.options.getString(name)?.trim()).filter(Boolean);

    if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) {
      return interaction.reply(ephemeral('Each choice needs to be different.'));
    }
    if (choices.length < 2) {
      return interaction.reply(ephemeral('A poll needs at least two choices.'));
    }

    // This uses Discord's built-in polls, so votes and results are handled by Discord.
    await interaction.reply({
      poll: {
        question: { text: question },
        answers: choices.map((text) => ({ text })),
        duration: interaction.options.getInteger('duration') ?? 24, // hours
        allowMultiselect: interaction.options.getBoolean('multiple') ?? false,
      },
    });
  },
};
