// Runs when someone joins: gives the join roles, posts the welcome message and
// sends the optional welcome DM. Everything is set in the dashboard or with /welcome.
const { Events } = require('discord.js');
const db = require('../lib/storage');
const { embed, fill, hexColor, truncate } = require('../lib/ui');
const { giveAutoroles } = require('../lib/roles');

/** Fills in {user}, {username}, {server} and {count} in a welcome message. */
const fillWelcome = (template, member) => fill(template, { member });

/**
 * The welcome post. `welcome` is the saved settings (or just the message text):
 * { message, title, color, image, footer, showAvatar, ping, plain }
 */
function welcomeMessage(welcome, member) {
  const w = typeof welcome === 'string' ? { message: welcome } : welcome ?? {};
  const ping = w.ping !== false;
  const text = fillWelcome(w.message ?? '', member);
  if (w.plain) {
    return { content: truncate(text || `Welcome <@${member.id}>!`, 2000), allowedMentions: { users: ping ? [member.id] : [] } };
  }
  const card = embed(hexColor(w.color) ?? undefined)
    .setTitle(truncate(fillWelcome(w.title || 'Welcome, {username}!', member), 256))
    .setFooter({ text: truncate(fillWelcome(w.footer || 'Member #{count}', member), 2048) });
  if (text) card.setDescription(truncate(text, 4096));
  if (w.showAvatar !== false) card.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  if (w.image) card.setImage(w.image);
  return {
    content: ping ? `<@${member.id}>` : undefined,
    allowedMentions: { users: ping ? [member.id] : [] },
    embeds: [card],
  };
}

module.exports = {
  name: Events.GuildMemberAdd,
  fillWelcome,
  welcomeMessage,
  async execute(member) {
    await giveAutoroles(member).catch((error) => console.error('Could not give join roles:', error.message));

    const g = db.guild(member.guild.id);
    if (g.welcomeDm) {
      await member.send({ content: truncate(fillWelcome(g.welcomeDm, member), 2000), allowedMentions: { parse: [] } }).catch(() => {
        // They have DMs from servers turned off; nothing to do.
      });
    }

    const welcome = g.welcome;
    if (!welcome) return;
    const channel = member.guild.channels.cache.get(welcome.channelId);
    if (!channel?.isTextBased()) return;
    await channel.send(welcomeMessage(welcome, member));
  },
};
