const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const db = require('../../lib/storage');

const MAX_WORDS = 200;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Automatically delete messages that contain certain words')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a word or phrase to the filter')
        .addStringOption((option) =>
          option.setName('word').setDescription('The word or phrase to block').setRequired(true).setMinLength(2).setMaxLength(50),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Take a word or phrase off the filter')
        .addStringOption((option) =>
          option.setName('word').setDescription('The word or phrase to allow again').setRequired(true).setMaxLength(50),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show every filtered word (only you can see the reply)')),

  async execute(interaction) {
    const settings = db.guild(interaction.guildId);
    const action = interaction.options.getSubcommand();

    if (action === 'list') {
      if (settings.filter.length === 0) {
        return interaction.reply(ephemeral('The filter is empty. Add a word with `/filter add`.'));
      }
      const words = settings.filter.map((word) => `\`${word}\``).join(', ');
      return interaction.reply(ephemeral(`**Filtered words (${settings.filter.length}):** ${words}`.slice(0, 2000)));
    }

    const word = interaction.options.getString('word').trim().toLowerCase().replace(/\s+/g, ' ');
    if (word.length < 2) return interaction.reply(ephemeral('Filtered words need at least 2 characters.'));

    if (action === 'add') {
      if (settings.filter.includes(word)) return interaction.reply(ephemeral('That word is already filtered.'));
      if (settings.filter.length >= MAX_WORDS) return interaction.reply(ephemeral(`The filter is full (${MAX_WORDS} words).`));
      settings.filter.push(word);
      db.save();
      return interaction.reply(
        ephemeral('✅ Added. Messages containing it will be deleted. Members with the Manage Messages permission are exempt.'),
      );
    }

    // remove
    if (!settings.filter.includes(word)) return interaction.reply(ephemeral("That word isn't on the filter."));
    settings.filter = settings.filter.filter((entry) => entry !== word);
    db.save();
    return interaction.reply(ephemeral('✅ Removed.'));
  },
};
