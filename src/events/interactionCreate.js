// Runs every time someone uses a slash command.
const { Events } = require('discord.js');
const { ephemeral } = require('../lib/ui');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    let run;
    let label;
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      run = () => command.execute(interaction);
      label = `/${interaction.commandName}`;
    } else if ((interaction.isButton?.() || interaction.isModalSubmit?.()) && interaction.customId.startsWith('pb:')) {
      // Buttons and forms made by Pixel Bot: "pb:<feature>:<extra>"
      const [, key, ...rest] = interaction.customId.split(':');
      const handler = interaction.client.components?.get(key);
      if (!handler) return;
      run = () => handler(interaction, ...rest);
      label = `button ${interaction.customId}`;
    } else {
      return;
    }

    try {
      await run();
    } catch (error) {
      console.error(`Error in ${label}:`, error);

      // 50013 is Discord's code for "the bot isn't allowed to do that".
      const message =
        error.code === 50013
          ? "I don't have permission to do that here. Check my role's permissions, and that my role is high enough in the role list."
          : 'Something went wrong running that command.';

      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(ephemeral(message));
        else await interaction.reply(ephemeral(message));
      } catch {
        // The interaction expired; nothing more we can do.
      }
    }
  },
};
