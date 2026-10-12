// Automatic moderation: invite links, mass mentions and message spam.
// Each one is off until switched on with /automod set.
const { PermissionFlagsBits } = require('discord.js');
const db = require('./storage');
const { sendLog, logEntry } = require('./log');
const { COLORS } = require('./ui');

const FEATURES = {
  invites: 'Delete invite links to other Discord servers',
  mentions: 'Delete messages that mention 5+ people, and time out the sender for 10 minutes',
  spam: 'Time out anyone who sends 6+ messages within 7 seconds, for 5 minutes',
};

const INVITE_PATTERN = /(discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const recent = new Map(); // "guild:user" -> [timestamps]

function settings(guildId) {
  const g = db.guild(guildId);
  g.automod ??= { invites: false, mentions: false, spam: false };
  return g.automod;
}

/** True if this message breaks a switched-on rule. Also records message rates for spam. */
function check(message, now = Date.now()) {
  const rules = settings(message.guildId);
  if (rules.invites && INVITE_PATTERN.test(message.content ?? '')) return 'invites';
  if (rules.mentions && message.mentions.users.size >= 5) return 'mentions';
  if (rules.spam) {
    const key = `${message.guildId}:${message.author.id}`;
    const times = (recent.get(key) ?? []).filter((t) => now - t < 7000);
    times.push(now);
    recent.set(key, times);
    if (times.length >= 6) {
      recent.delete(key);
      return 'spam';
    }
  }
  return null;
}

const NOTICES = {
  invites: 'invite links to other servers are not allowed here',
  mentions: 'mentioning that many people at once is not allowed',
  spam: 'slow down, you were sending messages too fast',
};

async function enforce(message, rule) {
  if (message.deletable) await message.delete().catch(() => {});
  const minutes = { mentions: 10, spam: 5 }[rule];
  if (minutes && message.member?.moderatable) {
    await message.member.timeout(minutes * 60_000, `Automod: ${rule}`).catch(() => {});
  }
  const notice = await message.channel
    .send({
      content: `<@${message.author.id}>, ${NOTICES[rule]}.${minutes ? ` You've been timed out for ${minutes} minutes.` : ''}`,
      allowedMentions: { users: [message.author.id] },
    })
    .catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);
  await sendLog(message.guild, logEntry({
    color: COLORS.danger, user: message.author,
    description: `🛡️ **Automod (${rule})** in ${message.channel}\n${(message.content ?? '').slice(0, 1500)}`,
    footer: `User ID: ${message.author.id}`,
  }));
}

function isExempt(member) {
  return Boolean(member?.permissions.has(PermissionFlagsBits.ManageMessages));
}

module.exports = { FEATURES, settings, check, enforce, isExempt };
