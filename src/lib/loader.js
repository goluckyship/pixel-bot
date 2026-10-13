// Finds every command and event file so index.js doesn't need to list them.
// To add a command, drop a new .js file in a folder under src/commands.
const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

function loadCommands() {
  const commands = new Collection();
  const root = path.join(__dirname, '..', 'commands');

  for (const category of fs.readdirSync(root)) {
    const folder = path.join(root, category);
    if (!fs.statSync(folder).isDirectory()) continue;

    for (const file of fs.readdirSync(folder).filter((name) => name.endsWith('.js'))) {
      const command = require(path.join(folder, file));
      if (!command.data || typeof command.execute !== 'function') {
        console.warn(`Skipped commands/${category}/${file}: it needs both "data" and "execute".`);
        continue;
      }
      if (commands.has(command.data.name)) {
        console.warn(`Skipped commands/${category}/${file}: another command is already named /${command.data.name}.`);
        continue;
      }
      command.category = category;
      commands.set(command.data.name, command);
    }
  }

  // Commands that belong to a feature in src/features. They politely refuse
  // while that feature is switched off in the dashboard.
  const features = require('./features');
  for (const feature of features.all()) {
    for (const command of feature.commands ?? []) {
      if (commands.has(command.data.name)) {
        console.warn(`Skipped /${command.data.name} from ${feature.title}: that name is already used.`);
        continue;
      }
      const run = command.execute;
      command.category = feature.group ?? 'community';
      command.feature = feature.id;
      command.execute = (interaction) => (features.isOn(interaction.guildId, feature.id) ? run(interaction) : features.offReply(interaction, feature));
      commands.set(command.data.name, command);
    }
  }
  return commands;
}

function loadEvents(client) {
  const root = path.join(__dirname, '..', 'events');
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.js'))) {
    const loaded = require(path.join(root, file));
    for (const event of Array.isArray(loaded) ? loaded : [loaded]) attachEvent(client, event);
  }
  // Events from feature modules only run while the feature is switched on
  // (unless the event says it always runs, e.g. to keep stats).
  const features = require('./features');
  for (const feature of features.all()) {
    for (const event of feature.events ?? []) {
      attachEvent(client, {
        ...event,
        execute: (...args) => {
          const guildId = guildOf(args[0]);
          if (!event.always && guildId && !features.isOn(guildId, feature.id)) return null;
          return event.execute(...args);
        },
      });
    }
  }
}

/** Works out which server an event belongs to, from its first argument. */
function guildOf(first) {
  return first?.guildId ?? first?.guild?.id ?? first?.message?.guildId ?? first?.message?.guild?.id ?? null;
}

function attachEvent(client, event) {
  const handler = (...args) => {
    // Never let one failed event crash the whole bot.
    Promise.resolve(event.execute(...args)).catch((error) => console.error(`Error in event ${event.name}:`, error));
  };
  if (event.once) client.once(event.name, handler);
  else client.on(event.name, handler);
}

/**
 * Buttons and forms use custom IDs like "pb:ticket:open". Commands can export
 * `components: { ticket: handler }` and the handler gets (interaction, ...rest).
 */
function collectComponents(commands) {
  const handlers = new Map();
  for (const command of commands.values()) {
    for (const [key, handler] of Object.entries(command.components ?? {})) handlers.set(key, handler);
  }
  for (const feature of require('./features').all()) {
    for (const [key, handler] of Object.entries(feature.components ?? {})) handlers.set(key, handler);
  }
  return handlers;
}

module.exports = { loadCommands, loadEvents, collectComponents };
