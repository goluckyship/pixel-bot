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

// What a server other than the home server starts with: nothing automatic.
const FRESH = {
  ...config,
  autoroles: [],
  staffRole: '',
  staffSourceRoles: [],
  ranks: [],
  rankManagers: [],
  logChannel: '',
  welcome: { channel: 'welcome', message: 'Welcome to {server}, {user}!' },
  tickets: {
    ...config.tickets,
    staffRoles: [],
    panelText: 'Need help? Click the button below to open a private ticket with the staff team.',
  },
};

const isHome = (guildId) => !guildId || !config.homeServer || String(guildId) === String(config.homeServer);
const defaultsFor = (guildId) => (isHome(guildId) ? config : FRESH);

/** The settings in effect for a server. */
function get(guildId) {
  const saved = guildId ? overrides(guildId) : {};
  const base = defaultsFor(guildId);
  return {
    ...base,
    ...Object.fromEntries(EDITABLE.filter((key) => key !== 'tickets' && saved[key] !== undefined).map((key) => [key, saved[key]])),
    tickets: { ...base.tickets, ...(saved.tickets ?? {}) },
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

module.exports = { get, update, isHome, defaultsFor, EDITABLE, TICKET_KEYS };
