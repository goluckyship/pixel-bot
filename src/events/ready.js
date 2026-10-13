// Runs once, when Pixel Bot has connected to Discord.
const { Events, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
const reminders = require('../lib/reminders');
const schedules = require('../lib/schedules');
const dashboard = require('../dashboard/server');
const config = require('../config');
const db = require('../lib/storage');
const { findChannel } = require('../lib/resolve');
const { syncStaffRole } = require('../lib/roles');
const appearance = require('../lib/appearance');
const customCommands = require('../lib/customcommands');
const panels = require('../lib/panels');

/** First run in a server: switch on the welcome message from src/config.js. */
function seedWelcome(guild) {
  const settings = db.guild(guild.id);
  if (settings.welcomeSeeded) return;
  const channel = findChannel(guild, config.welcome.channel);
  if (channel && !settings.welcome) settings.welcome = { channelId: channel.id, message: config.welcome.message };
  settings.welcomeSeeded = true;
  db.save();
}

/** Brings everyone's Staff role up to date (in case roles changed while the bot was offline). */
async function syncAllStaff(guild) {
  const members = await guild.members.fetch();
  let changed = 0;
  for (const member of members.values()) {
    if (await syncStaffRole(member).catch(() => null)) changed += 1;
  }
  return changed;
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`\nPixel Bot is online as ${client.user.tag}`);

    // Tell Discord which slash commands exist. This runs on every start, so
    // adding or editing a command only takes a restart.
    const commands = client.commands.map((command) => command.data.toJSON());
    await client.application.commands.set(commands);
    console.log(`Registered ${commands.length} slash commands.`);

    appearance.applyPresence(client);
    reminders.start(client);
    schedules.start(client);
    if (!client.dashboard) client.dashboard = dashboard.start(client);

    for (const guild of client.guilds.cache.values()) {
      seedWelcome(guild);
      panels.store(guild.id); // turns the old ticket settings into Panel #1 the first time
      await customCommands.register(guild).catch((error) => console.warn(`Could not register custom commands in ${guild.name}: ${error.message}`));
      const changed = await syncAllStaff(guild).catch((error) => {
        console.warn(`Could not check Staff roles in ${guild.name}: ${error.message}`);
        return 0;
      });
      if (changed) console.log(`Updated the Staff role for ${changed} member(s) in ${guild.name}.`);
    }

    const invite = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendPolls,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageGuildExpressions,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.MentionEveryone,
      ],
    });

    const serverCount = client.guilds.cache.size;
    console.log(`In ${serverCount} server${serverCount === 1 ? '' : 's'}.`);
    console.log(`\nTo add Pixel Bot to a server, open this link in your browser:\n${invite}\n`);
    console.log('Leave this window open to keep the bot online. Press Ctrl+C to stop it.\n');
  },
};
