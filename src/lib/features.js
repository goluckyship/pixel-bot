// Pixel Bot's feature modules (src/features/*.js).
//
// Each feature file describes itself: its settings (which the dashboard turns
// into a fold-up section automatically), and any slash commands, buttons,
// events and timers it needs. Drop a new file in src/features and it just works.
//
// module.exports = {
//   id, emoji, title, group, help,
//   fields: [{ key, type, label, default, ... }],   // see dashboard/fields.js
//   status(cfg, guild) -> short HTML shown on the folded row,
//   commands: [ { data, execute, autocomplete? } ],
//   components: { key: (interaction, ...parts) => {} },  // custom IDs "pb:key:..."
//   events: [ { name, execute } ],
//   tick(client),                                        // runs every 30 seconds
// }
const fs = require('node:fs');
const path = require('node:path');
const db = require('./storage');
const { ephemeral } = require('./ui');

const GROUPS = {
  community: 'Fun and community',
  levels: 'Levels',
  automation: 'Channels and automation',
  safety: 'Staff and safety',
};

let cache = null;
function all() {
  if (cache) return cache;
  const dir = path.join(__dirname, '..', 'features');
  cache = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => require(path.join(dir, f)))
    : [];
  cache.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title));
  return cache;
}

const byId = (id) => all().find((f) => f.id === id) ?? null;

/** Default value of every field (rows fields default to []). */
function defaults(feature) {
  const out = {};
  for (const field of feature.fields ?? []) out[field.key] = field.default ?? (field.type === 'rows' || field.type === 'roles' || field.type === 'channels' ? [] : field.type === 'toggle' ? false : '');
  return out;
}

/** A feature's settings for a server: saved values on top of the defaults. */
function config(guildId, id) {
  const feature = byId(id);
  if (!feature || !guildId) return {};
  const g = db.guild(guildId);
  g.features ??= {};
  return { ...defaults(feature), ...(g.features[id] ?? {}) };
}

function saveConfig(guildId, id, values) {
  const g = db.guild(guildId);
  g.features ??= {};
  g.features[id] = { ...(g.features[id] ?? {}), ...values };
  db.save();
}

/** Per-server data a feature keeps (XP, coins, giveaways...). */
function data(guildId, id, initial = () => ({})) {
  const g = db.guild(guildId);
  g.featureData ??= {};
  g.featureData[id] ??= initial();
  return g.featureData[id];
}

const isOn = (guildId, id) => Boolean(config(guildId, id).enabled);

/** Reply used when a feature's command is used while it's switched off. */
const offReply = (interaction, feature) =>
  interaction.reply(ephemeral(`${feature.emoji} ${feature.title} is switched off. A server manager can turn it on in the Pixel Bot dashboard.`));

/** Starts every feature's 30-second timer. */
function startTicks(client) {
  const run = async () => {
    for (const feature of all()) {
      if (!feature.tick) continue;
      try {
        await feature.tick(client);
      } catch (error) {
        console.error(`Error in ${feature.title}:`, error.message);
      }
    }
  };
  const timer = setInterval(run, 30_000);
  timer.unref?.();
  setTimeout(run, 5_000).unref?.();
  return timer;
}

module.exports = { GROUPS, all, byId, defaults, config, saveConfig, data, isOn, offReply, startTicks };
