const { SlashCommandBuilder } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const { parseDuration } = require('../../lib/duration');
const reminders = require('../../lib/reminders');

const MIN_MS = 10 * 1000;
const MAX_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PER_USER = 25;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Have Pixel Bot remind you about something later')
    .addStringOption((option) =>
      option.setName('in').setDescription('How long from now, like 10m, 2h or 3d').setRequired(true).setMaxLength(40),
    )
    .addStringOption((option) =>
      option.setName('about').setDescription('What should I remind you about?').setRequired(true).setMaxLength(300),
    ),

  async execute(interaction) {
    const delay = parseDuration(interaction.options.getString('in'));
    const text = interaction.options.getString('about');

    if (!delay) {
      return interaction.reply(ephemeral('I didn\'t understand that time. Try `10m`, `2h`, `3d` or `1h 30m`.'));
    }
    if (delay < MIN_MS || delay > MAX_MS) {
      return interaction.reply(ephemeral('Reminders can be set from 10 seconds to 1 year from now.'));
    }
    if (reminders.forUser(interaction.user.id).length >= MAX_PER_USER) {
      return interaction.reply(ephemeral(`You already have ${MAX_PER_USER} reminders waiting. Let a few go off first.`));
    }

    const dueAt = Date.now() + delay;
    reminders.add({
      userId: interaction.user.id,
      channelId: interaction.channelId,
      text,
      dueAt,
    });

    const when = Math.floor(dueAt / 1000);
    await interaction.reply(ephemeral(`⏰ Got it. I'll remind you <t:${when}:R> (<t:${when}:f>) about: **${text}**`));
  },
};
