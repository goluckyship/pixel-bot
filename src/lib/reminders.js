// Reminders are saved to disk, so they still fire if the bot restarts.
const db = require('./storage');

const CHECK_EVERY_MS = 15_000;
let timer = null;

function add(reminder) {
  db.data.reminders.push(reminder);
  db.save();
}

function forUser(userId) {
  return db.data.reminders.filter((reminder) => reminder.userId === userId);
}

async function deliver(client, reminder) {
  const content = `⏰ <@${reminder.userId}>, you asked me to remind you: **${reminder.text}**`;
  const allowedMentions = { users: [reminder.userId] };
  try {
    const channel = await client.channels.fetch(reminder.channelId);
    await channel.send({ content, allowedMentions });
  } catch {
    // The channel is gone or I can't talk there any more: try a direct message.
    try {
      const user = await client.users.fetch(reminder.userId);
      await user.send(`⏰ Reminder: **${reminder.text}**`);
    } catch {
      console.warn(`Could not deliver a reminder to user ${reminder.userId}.`);
    }
  }
}

async function checkDue(client, now = Date.now()) {
  const due = db.data.reminders.filter((reminder) => reminder.dueAt <= now);
  if (due.length === 0) return 0;

  // Remove them first so a reminder can never be sent twice.
  db.data.reminders = db.data.reminders.filter((reminder) => reminder.dueAt > now);
  db.save();

  for (const reminder of due) await deliver(client, reminder);
  return due.length;
}

function start(client) {
  if (timer) return;
  const tick = () => checkDue(client).catch((error) => console.error('Reminder check failed:', error));
  tick();
  timer = setInterval(tick, CHECK_EVERY_MS);
}

module.exports = { add, forUser, checkDue, start };
