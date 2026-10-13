// How Pixel Bot looks: its status ("Listening to /help"), online dot and main colour.
const { ActivityType } = require('discord.js');
const db = require('./storage');

const ACTIVITIES = {
  Playing: 'Playing',
  Watching: 'Watching',
  Listening: 'Listening to',
  Competing: 'Competing in',
  Custom: 'Just the text',
  None: 'No status',
};
const STATUSES = { online: 'Online (green)', idle: 'Idle (yellow)', dnd: 'Do not disturb (red)', invisible: 'Invisible (shows offline)' };

function settings() {
  db.data.bot ??= {};
  const b = db.data.bot;
  b.status ??= 'online';
  b.activityType ??= 'Listening';
  b.activityText ??= '/help';
  if (!b.themeV2) {
    b.theme = { preset: 'blue' }; // the owner asked for the soft blue look
    b.themeV2 = true;
    db.saveSoon();
  }
  return b;
}

/** Puts the saved status on the bot. */
function applyPresence(client) {
  const b = settings();
  const activities = b.activityType === 'None' || !b.activityText ? [] : [{ name: b.activityText, type: ActivityType[b.activityType] }];
  client.user.setPresence({ status: STATUSES[b.status] ? b.status : 'online', activities });
}

module.exports = { ACTIVITIES, STATUSES, settings, applyPresence };
