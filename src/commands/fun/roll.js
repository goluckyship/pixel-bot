const { SlashCommandBuilder } = require('discord.js');
const { ephemeral } = require('../../lib/ui');

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** "2d6+3" -> { count: 2, sides: 6, bonus: 3 }, or null if it isn't dice notation. */
function parseDice(text) {
  const match = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(text.replace(/\s+/g, ''));
  if (!match) return null;
  return {
    count: match[1] === '' ? 1 : Number(match[1]),
    sides: Number(match[2]),
    bonus: match[3] ? Number(match[3]) : 0,
  };
}

module.exports = {
  parseDice,
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice, like 1d20 or 2d6+3')
    .addStringOption((option) =>
      option.setName('dice').setDescription('What to roll (default: 1d6)').setMaxLength(20),
    ),

  async execute(interaction) {
    const input = interaction.options.getString('dice') ?? '1d6';
    const dice = parseDice(input);

    if (!dice) {
      return interaction.reply(ephemeral('I didn\'t understand that. Try something like `1d20`, `2d6` or `3d8+2`.'));
    }
    if (dice.count < 1 || dice.count > MAX_DICE || dice.sides < 2 || dice.sides > MAX_SIDES) {
      return interaction.reply(ephemeral(`You can roll 1 to ${MAX_DICE} dice with 2 to ${MAX_SIDES} sides each.`));
    }

    const rolls = Array.from({ length: dice.count }, () => 1 + Math.floor(Math.random() * dice.sides));
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + dice.bonus;

    const bonusText = dice.bonus === 0 ? '' : ` ${dice.bonus > 0 ? '+' : '-'} ${Math.abs(dice.bonus)}`;
    const label = `${dice.count}d${dice.sides}${bonusText.replace(/\s/g, '')}`;
    // Only list each die when there's more than one result to show and it stays readable.
    const showRolls = (rolls.length > 1 || dice.bonus !== 0) && rolls.length <= 30;
    const detail = showRolls ? ` (${rolls.join(' + ')}${bonusText})` : '';

    await interaction.reply(`🎲 **${label}** → **${total}**${detail}`);
  },
};
