// Posts entries to the staff log channel (see logChannel in the settings).
const settings = require('./settings');
const { findChannel } = require('./resolve');
const { embed, truncate, COLORS } = require('./ui');

function logChannel(guild) {
  return guild ? findChannel(guild, settings.get(guild.id).logChannel) : null;
}

/** A log entry in the style of the old Dyno log. */
function logEntry({ color, user, description, footer }) {
  const card = embed(color).setDescription(truncate(description, 4000)).setTimestamp();
  if (user) card.setAuthor({ name: user.tag ?? user.username ?? 'Unknown user', iconURL: user.displayAvatarURL?.() });
  if (footer) card.setFooter({ text: truncate(footer, 2000) });
  return card;
}

/** Sends one entry. Never throws: a broken log must not break anything else. */
async function sendLog(guild, entry) {
  const channel = logChannel(guild);
  if (!channel) return false;
  try {
    await channel.send({ embeds: [entry] });
    return true;
  } catch {
    return false;
  }
}

module.exports = { sendLog, logEntry, logChannel };
