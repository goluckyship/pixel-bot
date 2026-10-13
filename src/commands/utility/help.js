const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../../lib/ui');

// How each folder under src/commands is titled in /help.
// A new folder shows up automatically; add it here to give it a nicer title.
const CATEGORY_TITLES = {
  fun: '🎮 Fun & Games',
  community: '🌸 Community',
  levels: '⭐ Levels',
  automation: '⚙️ Automation',
  safety: '🛡️ Staff & Safety',
  moderation: '🛡️ Moderation',
  utility: '🧰 Utility',
};

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('See everything Pixel Bot can do'),

  async execute(interaction) {
    const groups = new Map();
    for (const command of interaction.client.commands.values()) {
      if (!groups.has(command.category)) groups.set(command.category, []);
      groups.get(command.category).push(`\`/${command.data.name}\` · ${command.data.description}`);
    }

    const card = embed().setTitle('Pixel Bot commands');
    const order = [...Object.keys(CATEGORY_TITLES), ...[...groups.keys()].filter((key) => !(key in CATEGORY_TITLES))];
    for (const category of order) {
      const lines = groups.get(category);
      if (!lines) continue;
      // Discord fits 1024 characters per section, so long lists carry on in a second one.
      let chunk = [];
      let first = true;
      const flush = () => {
        if (!chunk.length) return;
        card.addFields({ name: first ? CATEGORY_TITLES[category] ?? category : '\u200b', value: chunk.join('\n') });
        first = false;
        chunk = [];
      };
      for (const line of lines.sort()) {
        if ([...chunk, line].join('\n').length > 1024) flush();
        chunk.push(line.slice(0, 1024));
      }
      flush();
    }
    card.setFooter({ text: 'Moderation commands only appear for members with the right permissions.' });

    await interaction.reply({ embeds: [card], flags: MessageFlags.Ephemeral });
  },
};
