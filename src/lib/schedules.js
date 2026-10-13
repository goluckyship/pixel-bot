// Scheduled messages: posted at a set time, once or on repeat.
// Saved to disk, so they survive restarts.
const db = require('./storage');
const settings = require('./settings');
const { addDays } = require('./when');
const { embed } = require('./ui');

const CHECK_EVERY_MS = 30_000;
const MAX_PER_SERVER = Infinity; // no limit
const REPEATS = { none: 0, daily: 1, weekly: 7 };
let timer = null;

function list(guildId) {
  const g = db.guild(guildId);
  g.schedules ??= [];
  g.scheduleCounter ??= 0;
  return g.schedules;
}

function add(guildId, item) {
  const items = list(guildId);
  if (items.length >= MAX_PER_SERVER) return null;
  const g = db.guild(guildId);
  g.scheduleCounter += 1;
  const saved = { id: g.scheduleCounter, ...item };
  items.push(saved);
  db.save();
  return saved;
}

function remove(guildId, id) {
  const items = list(guildId);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return false;
  items.splice(index, 1);
  db.save();
  return true;
}

/** The message to post: an embed if there's a title, plain text otherwise. */
function messageFor(item) {
  const allowedMentions = item.allowEveryone ? { parse: ['everyone', 'roles', 'users'] } : { parse: ['users'] };
  if (item.title) {
    return { content: item.ping || undefined, allowedMentions, embeds: [embed().setTitle(item.title).setDescription(item.message)] };
  }
  return { content: item.message, allowedMentions };
}

async function checkDue(client, now = Date.now()) {
  let sent = 0;
  for (const guild of client.guilds.cache.values()) {
    const items = list(guild.id);
    const due = items.filter((item) => item.nextAt <= now);
    if (due.length === 0) continue;
    const timeZone = settings.get(guild.id).timezone;

    for (const item of due) {
      // Work out the next run first, so a failure can never cause repeated posts.
      if (REPEATS[item.repeat]) {
        let next = item.nextAt;
        while (next <= now) next = addDays(next, REPEATS[item.repeat], timeZone);
        item.nextAt = next;
      } else {
        items.splice(items.indexOf(item), 1);
      }
      db.save();
      const channel = guild.channels.cache.get(item.channelId);
      if (!channel?.isTextBased()) continue;
      await channel.send(messageFor(item)).then(() => { sent += 1; }).catch((error) => console.warn(`Scheduled message #${item.id} failed: ${error.message}`));
    }
  }
  return sent;
}

function start(client) {
  if (timer) return;
  const tick = () => checkDue(client).catch((error) => console.error('Schedule check failed:', error));
  tick();
  timer = setInterval(tick, CHECK_EVERY_MS);
}

module.exports = { list, add, remove, checkDue, start, messageFor, REPEATS, MAX_PER_SERVER };
