const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { embed, ephemeral, pick, COLORS } = require('../../lib/ui');

const TIME_LIMIT_SECONDS = 20;

// Add your own questions! The FIRST answer is the correct one;
// the bot shuffles them before showing them.
const QUESTIONS = [
  { q: 'Which planet is known as the Red Planet?', a: ['Mars', 'Venus', 'Jupiter', 'Mercury'] },
  { q: 'How many bits are in a byte?', a: ['8', '4', '16', '32'] },
  { q: 'What is the largest ocean on Earth?', a: ['Pacific', 'Atlantic', 'Indian', 'Arctic'] },
  { q: 'Which element has the chemical symbol "O"?', a: ['Oxygen', 'Gold', 'Osmium', 'Iron'] },
  { q: 'In what year did humans first land on the Moon?', a: ['1969', '1965', '1972', '1959'] },
  { q: 'Which company created Mario?', a: ['Nintendo', 'Sega', 'Sony', 'Atari'] },
  { q: 'What is the hardest natural substance?', a: ['Diamond', 'Quartz', 'Granite', 'Iron'] },
  { q: 'How many sides does a hexagon have?', a: ['6', '5', '7', '8'] },
  { q: 'What is the capital of Japan?', a: ['Tokyo', 'Kyoto', 'Osaka', 'Seoul'] },
  { q: 'What is the largest animal alive today?', a: ['Blue whale', 'African elephant', 'Giraffe', 'Whale shark'] },
  { q: 'What does "HTML" stand for?', a: ['HyperText Markup Language', 'High Transfer Machine Language', 'Home Tool Markup Language', 'Hyperlink Text Mode Language'] },
  { q: 'Which gas do plants take in from the air to make food?', a: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'] },
  { q: 'How many players does a soccer team have on the field?', a: ['11', '9', '10', '12'] },
  { q: 'Who painted the Mona Lisa?', a: ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Vincent van Gogh'] },
  { q: 'What is the smallest prime number?', a: ['2', '0', '1', '3'] },
  { q: 'In Minecraft, which pickaxe do you need at minimum to mine obsidian?', a: ['Diamond', 'Iron', 'Stone', 'Gold'] },
  { q: 'At what temperature does water freeze, in Celsius?', a: ['0', '32', '100', '-10'] },
  { q: 'Which instrument has 88 keys?', a: ['Piano', 'Accordion', 'Harp', 'Organ'] },
  { q: 'What colour do you get by mixing blue and yellow paint?', a: ['Green', 'Purple', 'Orange', 'Brown'] },
  { q: 'Which is the largest planet in our solar system?', a: ['Jupiter', 'Saturn', 'Neptune', 'Earth'] },
  { q: 'What is the square root of 144?', a: ['12', '14', '11', '16'] },
  { q: 'Which programming language runs natively in web browsers?', a: ['JavaScript', 'Python', 'Java', 'C#'] },
  { q: 'How many pixels wide is a "1080p" video?', a: ['1920', '1080', '1280', '2560'] },
  { q: 'How many colours are in a rainbow?', a: ['7', '5', '6', '8'] },
  { q: 'What do bees collect from flowers to make honey?', a: ['Nectar', 'Pollen', 'Sap', 'Dew'] },
];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Builds the row of answer buttons. Once `chosen` is set, the buttons lock and show the result. */
function buildButtons(answers, correct, chosen = null, locked = false) {
  const row = new ActionRowBuilder();
  answers.forEach((answer, index) => {
    let style = ButtonStyle.Primary;
    if (locked) {
      if (answer === correct) style = ButtonStyle.Success;
      else if (answer === chosen) style = ButtonStyle.Danger;
      else style = ButtonStyle.Secondary;
    }
    row.addComponents(
      new ButtonBuilder().setCustomId(`trivia_${index}`).setLabel(answer).setStyle(style).setDisabled(locked),
    );
  });
  return row;
}

module.exports = {
  QUESTIONS,
  data: new SlashCommandBuilder().setName('trivia').setDescription('Answer a trivia question'),

  async execute(interaction) {
    const question = pick(QUESTIONS);
    const correct = question.a[0];
    const answers = shuffle(question.a);

    const card = embed()
      .setTitle('🧠 Trivia')
      .setDescription(question.q)
      .setFooter({ text: `${interaction.user.username}, you have ${TIME_LIMIT_SECONDS} seconds` });

    await interaction.reply({ embeds: [card], components: [buildButtons(answers, correct)] });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: TIME_LIMIT_SECONDS * 1000,
    });

    let answered = false;

    collector.on('collect', async (click) => {
      try {
        if (click.user.id !== interaction.user.id) {
          await click.reply(ephemeral('This question is for someone else. Use `/trivia` to get your own!'));
          return;
        }

        if (answered) return; // ignore a second click that arrives at the same moment
        answered = true;
        const chosen = answers[Number(click.customId.split('_')[1])];
        const right = chosen === correct;

        card
          .setColor(right ? COLORS.success : COLORS.danger)
          .setFooter({ text: right ? `✅ Correct, ${click.user.username}!` : `❌ Not quite. The answer was ${correct}.` });

        await click.update({ embeds: [card], components: [buildButtons(answers, correct, chosen, true)] });
        collector.stop('answered');
      } catch (error) {
        console.error('Error handling a trivia answer:', error);
      }
    });

    collector.on('end', async () => {
      if (answered) return;
      card.setColor(COLORS.warning).setFooter({ text: `⏱️ Time's up! The answer was ${correct}.` });
      await interaction
        .editReply({ embeds: [card], components: [buildButtons(answers, correct, null, true)] })
        .catch(() => {});
    });
  },
};
