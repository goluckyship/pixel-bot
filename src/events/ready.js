// Runs once, when Pixel Bot has connected to Discord.
const { Events } = require('discord.js');
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
  if (!require('../lib/settings').isHome(guild.id)) return; // other servers turn welcomes on in the dashboard
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
  seedWelcome,
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`\nPixel Bot is online as ${client.user.tag}`);
    await client.application.fetch?.().catch(() => {}); // learns who owns the bot (for owner-only controls)
    const ownerId = require('../lib/owner').ownerId(client);
    if (ownerId) console.log(`Owner controls belong to Discord user ${ownerId}.`);

    // Tell Discord which slash commands exist. This runs on every start, so
    // adding or editing a command only takes a restart.
    const commands = client.commands.map((command) => command.data.toJSON());
    await client.application.commands.set(commands);
    console.log(`Registered ${commands.length} slash commands.`);

    appearance.applyPresence(client);
    console.log(require('../lib/questions').MODERN
      ? 'Ticket forms: all question types available.'
      : 'Ticket forms: this discord.js is too old for dropdown/tick box/upload questions, so they show as text boxes. Run "npm update" to get them.');
    reminders.start(client);
    schedules.start(client);
    if (!client.dashboard) client.dashboard = dashboard.start(client);
    if (!client.featureTimer) client.featureTimer = require('../lib/features').startTicks(client);

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

    const invite = require('../lib/invite').inviteLink(client);

    const serverCount = client.guilds.cache.size;
    console.log(`In ${serverCount} server${serverCount === 1 ? '' : 's'}.`);
    console.log(`\nTo add Pixel Bot to a server, open this link in your browser:\n${invite}\n`);
    console.log('Leave this window open to keep the bot online. Press Ctrl+C to stop it.\n');
  },
};
