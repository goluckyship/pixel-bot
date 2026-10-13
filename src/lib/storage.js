// Pixel Bot's memory. Everything it needs to remember (warnings, welcome
// settings, filtered words, reminders) is saved in one file: data/db.json.
// That's plenty for a bot in a handful of servers. If Pixel Bot ever gets big,
// this is the one file to swap out for a real database.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.PIXEL_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

function load() {
  let loaded = {};
  try {
    loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // The file exists but can't be read. Keep a copy instead of overwriting it.
      const backup = path.join(DATA_DIR, `db.broken-${Date.now()}.json`);
      try {
        fs.renameSync(FILE, backup);
        console.warn(`Could not read data/db.json, so it was moved to ${path.basename(backup)} and a fresh one was started.`);
      } catch {
        console.warn('Could not read data/db.json. Starting with empty data.');
      }
    }
  }
  if (typeof loaded !== 'object' || loaded === null || Array.isArray(loaded)) loaded = {};
  if (typeof loaded.guilds !== 'object' || loaded.guilds === null) loaded.guilds = {};
  if (!Array.isArray(loaded.reminders)) loaded.reminders = [];
  return loaded;
}

const data = load();

/** Write everything to disk. Call this after changing anything. */
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, FILE); // swap in one step so a crash can't leave half a file
}

let pending = null;
/** Save within a few seconds, batching lots of small changes (like XP on every message). */
function saveSoon() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    save();
  }, 5000);
  pending.unref?.();
}
process.once('beforeExit', () => pending && save());

/** The saved settings for one server (created the first time it's asked for). */
function guild(guildId) {
  const g = (data.guilds[guildId] ??= {});
  g.warnings ??= {}; // { userId: [ { id, reason, moderatorId, at } ] }
  g.warnCounter ??= 0;
  g.welcome ??= null; // { channelId, message }
  g.filter ??= []; // [ 'word', ... ]
  return g;
}

module.exports = { data, save, saveSoon, guild };
