const { SlashCommandBuilder } = require('discord.js');
const { pick } = require('../../lib/ui');

const MOVES = {
  rock: { emoji: '🪨', beats: 'scissors' },
  paper: { emoji: '📄', beats: 'rock' },
  scissors: { emoji: '✂️', beats: 'paper' },
};

/** 'win', 'lose' or 'tie' from the player's point of view. */
function outcome(player, bot) {
  if (player === bot) return 'tie';
  return MOVES[player].beats === bot ? 'win' : 'lose';
}

module.exports = {
  outcome,
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Play rock, paper, scissors against Pixel Bot')
    .addStringOption((option) =>
      option
        .setName('move')
        .setDescription('Your move')
        .setRequired(true)
        .addChoices(
          { name: 'Rock', value: 'rock' },
          { name: 'Paper', value: 'paper' },
          { name: 'Scissors', value: 'scissors' },
        ),
    ),

  async execute(interaction) {
    const player = interaction.options.getString('move');
    const bot = pick(Object.keys(MOVES));
    const text = { win: 'You win! 🎉', lose: 'I win! 😎', tie: 'It\'s a tie!' }[outcome(player, bot)];

    await interaction.reply(`You chose ${MOVES[player].emoji} **${player}**, I chose ${MOVES[bot].emoji} **${bot}**. ${text}`);
  },
};
