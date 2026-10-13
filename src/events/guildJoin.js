// When Pixel Bot is added to (or removed from) a server.
const { Events } = require('discord.js');
const panels = require('../lib/panels');
const customCommands = require('../lib/customcommands');

module.exports = [
  {
    name: Events.GuildCreate,
    async execute(guild) {
      console.log(`Pixel Bot was added to ${guild.name} (${guild.memberCount} members). Set it up in the dashboard.`);
      require('./ready').seedWelcome(guild);
      panels.store(guild.id);
      await customCommands.register(guild).catch(() => {});
    },
  },
  {
    name: Events.GuildDelete,
    execute(guild) {
      if (guild.available === false) return; // a Discord outage, not a removal
      console.log(`Pixel Bot was removed from ${guild.name ?? guild.id}. Its settings there are kept in case it's added back.`);
    },
  },
];
