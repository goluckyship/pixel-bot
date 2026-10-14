// Each person's own dashboard look (theme, text size...). Saved by Discord user ID.
// Anything left empty falls back to the look the bot owner picked for everyone.
const db = require('./storage');

const KEYS = ['preset', 'mode', 'font', 'corners', 'accent', 'textSize', 'motion', 'width'];

function all() {
  db.data.userPrefs ??= {};
  return db.data.userPrefs;
}
const get = (userId) => (userId && Object.hasOwn(all(), userId) ? all()[userId] : {});

function set(userId, values) {
  const clean = {};
  for (const k of KEYS) if (values[k] !== undefined && values[k] !== '') clean[k] = String(values[k]).slice(0, 40);
  if (Object.keys(clean).length) all()[userId] = clean;
  else delete all()[userId];
  db.save();
  return clean;
}

module.exports = { KEYS, get, set };
