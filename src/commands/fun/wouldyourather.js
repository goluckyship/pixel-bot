const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { embed, ephemeral, pick } = require('../../lib/ui');

// Add your own! Each one is [option A, option B].
const QUESTIONS = [
  ['be able to fly', 'be invisible'],
  ['only play one game forever', 'never play the same game twice'],
  ['have unlimited Robux', 'have unlimited V-Bucks'],
  ['live in Minecraft', 'live in Roblox'],
  ['always be 10 minutes late', 'always be 20 minutes early'],
  ['have a pet dragon', 'have a pet dinosaur'],
  ['never use your phone again', 'never play video games again'],
  ['be the best player on a bad team', 'the worst player on a great team'],
  ['have 1 million followers', 'have $1 million'],
  ['only eat pizza forever', 'never eat pizza again'],
  ['explore space', 'explore the deep ocean'],
  ['have super speed', 'have super strength'],
  ['be famous', 'be rich but unknown'],
  ['talk to animals', 'speak every human language'],
  ['have no internet for a month', 'no music for a year'],
  ['be stuck in a horror game', 'be stuck in a racing game'],
  ['have lag forever', 'have 1 FPS forever'],
  ['win every argument', 'win every game'],
  ['live without music', 'live without movies'],
  ['have a rewind button', 'have a pause button for life'],
  ['be a pro gamer', 'be a pro athlete'],
  ['only use a keyboard', 'only use a controller'],
  ['fight 100 duck-sized horses', 'one horse-sized duck'],
  ['never sleep', 'never eat'],
  ['always know when someone is lying', 'always get away with lying'],
  ['have a personal chef', 'have a personal driver'],
  ['go back in time', 'go to the future'],
  ['be a wizard', 'be a superhero'],
  ['have unlimited snacks', 'unlimited drinks'],
  ['play in the dark forever', 'play with the volume muted forever'],
];

// Votes are kept in memory: messageId -> { a: Set(userIds), b: Set(userIds) }
const votes = new Map();

function buttons(counts = { a: 0, b: 0 }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pb:wyr:a').setLabel(`🅰️ ${counts.a}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pb:wyr:b').setLabel(`🅱️ ${counts.b}`).setStyle(ButtonStyle.Danger),
  );
}

async function onVote(interaction, choice) {
  if (choice !== 'a' && choice !== 'b') return null;
  const id = interaction.message.id;
  if (!votes.has(id)) votes.set(id, { a: new Set(), b: new Set() });
  const tally = votes.get(id);
  const other = choice === 'a' ? 'b' : 'a';

  if (tally[choice].has(interaction.user.id)) {
    return interaction.reply(ephemeral('You already voted for that one. Click the other button to change your vote.'));
  }
  tally[other].delete(interaction.user.id);
  tally[choice].add(interaction.user.id);
  return interaction.update({ components: [buttons({ a: tally.a.size, b: tally.b.size })] });
}

module.exports = {
  QUESTIONS,
  votes,
  components: { wyr: onVote },
  data: new SlashCommandBuilder().setName('wouldyourather').setDescription('Would you rather...? Everyone can vote'),

  async execute(interaction) {
    const [a, b] = pick(QUESTIONS);
    await interaction.reply({
      embeds: [embed().setTitle('🤔 Would you rather...').setDescription(`🅰️ **${a}**\n\n*or*\n\n🅱️ **${b}**`)],
      components: [buttons()],
    });
  },
};
