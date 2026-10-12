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
  return commands;
}

function loadEvents(client) {
  const root = path.join(__dirname, '..', 'events');
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.js'))) {
    const loaded = require(path.join(root, file));
    for (const event of Array.isArray(loaded) ? loaded : [loaded]) attachEvent(client, event);
  }
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
  return handlers;
}

module.exports = { loadCommands, loadEvents, collectComponents };
