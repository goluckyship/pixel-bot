const { SlashCommandBuilder } = require('discord.js');
const { pick } = require('../../lib/ui');

// Add your own! Each joke is [setup, punchline].
const JOKES = [
  ['Why did the pixel go to school?', 'It wanted to be a little brighter.'],
  ['Why do programmers mix up Halloween and Christmas?', 'Because Oct 31 equals Dec 25.'],
  ['What do you call a fish with no eyes?', 'A fsh.'],
  ['Why did the scarecrow win an award?', 'It was outstanding in its field.'],
  ['What do you call fake spaghetti?', 'An impasta.'],
  ['Why don\'t skeletons fight each other?', 'They don\'t have the guts.'],
  ['Why did the computer go to the doctor?', 'It had a virus.'],
  ['Why was the computer cold?', 'It left its Windows open.'],
  ['What\'s a robot\'s favourite snack?', 'Computer chips.'],
  ['Why did the bicycle fall over?', 'It was two-tired.'],
  ['What do you call a bear with no teeth?', 'A gummy bear.'],
  ['Why did the gamer bring a ladder?', 'To reach the next level.'],
  ['What did the ocean say to the beach?', 'Nothing, it just waved.'],
  ['Why can\'t you trust stairs?', 'They\'re always up to something.'],
  ['What kind of music do planets like?', 'Neptunes.'],
];

module.exports = {
  JOKES,
  data: new SlashCommandBuilder().setName('joke').setDescription('Hear a joke'),

  async execute(interaction) {
    const [setup, punchline] = pick(JOKES);
    // The ||bars|| hide the punchline until someone clicks it.
    await interaction.reply(`${setup}\n||${punchline}||`);
  },
};
