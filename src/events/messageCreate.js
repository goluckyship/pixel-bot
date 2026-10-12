// Runs on every message. Used for the word filter (see /filter).
const { Events, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/storage');
const automod = require('../lib/automod');

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if `content` contains any filtered word as a whole word (not inside another word). */
function containsFilteredWord(content, words) {
  return words.some((word) => {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}($|[^\\p{L}\\p{N}])`, 'iu');
    return pattern.test(content);
  });
}

module.exports = {
  name: Events.MessageCreate,
  containsFilteredWord,
  async execute(message) {
    if (!message.inGuild() || message.author.bot) return;

    // Moderators are exempt from the filter and automod.
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const broken = automod.check(message);
    if (broken) return automod.enforce(message, broken);

    const words = db.guild(message.guildId).filter;
    if (words.length === 0 || !message.content) return;
    if (!containsFilteredWord(message.content, words)) return;
    if (!message.deletable) return;

    await message.delete();
    const notice = await message.channel.send({
      content: `<@${message.author.id}>, your message was removed because it contained a word that isn't allowed here.`,
      allowedMentions: { users: [message.author.id] },
    });
    setTimeout(() => notice.delete().catch(() => {}), 8000);
  },
};
