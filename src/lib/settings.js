// Per-server settings. Defaults come from src/config.js; anything changed in
// the web dashboard is saved per server and takes priority over the defaults.
const config = require('../config');
const db = require('./storage');

// Settings the dashboard is allowed to change.
const EDITABLE = ['autoroles', 'staffRole', 'staffSourceRoles', 'ranks', 'rankManagers', 'logChannel', 'tickets'];
const TICKET_KEYS = ['category', 'transcriptChannel', 'staffRoles', 'question', 'panelTitle', 'panelText'];

function overrides(guildId) {
  const g = db.guild(guildId);
  g.settings ??= {};
  return g.settings;
}

/** The settings in effect for a server. */
function get(guildId) {
  const saved = guildId ? overrides(guildId) : {};
  return {
    ...config,
    ...Object.fromEntries(EDITABLE.filter((key) => key !== 'tickets' && saved[key] !== undefined).map((key) => [key, saved[key]])),
    tickets: { ...config.tickets, ...(saved.tickets ?? {}) },
  };
}

/** Saves changes from the dashboard. Unknown keys are ignored. */
function update(guildId, patch) {
  const saved = overrides(guildId);
  for (const [key, value] of Object.entries(patch)) {
    if (!EDITABLE.includes(key)) continue;
    if (key === 'tickets') {
      saved.tickets ??= {};
      for (const [tk, tv] of Object.entries(value ?? {})) if (TICKET_KEYS.includes(tk)) saved.tickets[tk] = tv;
    } else {
      saved[key] = value;
    }
  }
  db.save();
  return get(guildId);
}

module.exports = { get, update, EDITABLE, TICKET_KEYS };
