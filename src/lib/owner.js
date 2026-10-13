// Owner-only controls. "The owner" is whoever owns Pixel Bot in the Discord
// Developer Portal (you), or the account in OWNER_ID if that's set.
const db = require('./storage');

function settings() {
  db.data.owner ??= {};
  const o = db.data.owner;
  o.maintenance ??= false;
  o.maintenanceText ??= '🛠️ Pixel Bot is having a quick tune-up. Back soon!';
  o.disabledCommands ??= [];
  o.blocked ??= [];
  o.onlyMe ??= false;
  o.extraAccess ??= [];
  o.audit ??= [];
  return o;
}

/** The owner's Discord user ID. */
function ownerId(client) {
  if (process.env.OWNER_ID) return String(process.env.OWNER_ID).trim();
  const owner = client?.application?.owner;
  return owner?.ownerId ?? owner?.owner?.id ?? owner?.id ?? null; // a team's owner, or the user
}

const isOwner = (client, userId) => Boolean(userId) && ownerId(client) === String(userId);

/** Notes a dashboard change in the history (last 300 kept). */
function audit(entry) {
  const o = settings();
  o.audit.unshift({ at: Date.now(), ...entry });
  o.audit.length = Math.min(o.audit.length, 300);
  db.saveSoon();
}

/**
 * Should this interaction be stopped? Returns the reason to show, or null.
 * The owner is never stopped.
 */
function gate(interaction) {
  if (isOwner(interaction.client, interaction.user?.id)) return null;
  const o = settings();
  if (o.blocked.includes(interaction.user?.id)) return 'You\'ve been blocked from using Pixel Bot.';
  if (o.maintenance) return o.maintenanceText;
  if (interaction.isChatInputCommand?.() && o.disabledCommands.includes(interaction.commandName)) return `/${interaction.commandName} is switched off right now.`;
  return null;
}

module.exports = { settings, ownerId, isOwner, audit, gate };
