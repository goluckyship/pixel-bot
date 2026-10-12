// Runs when someone joins: gives the join roles and posts the welcome message.
const { Events } = require('discord.js');
const db = require('../lib/storage');
const { embed } = require('../lib/ui');
const { giveAutoroles } = require('../lib/roles');

/** Fills in {user}, {username}, {server} and {count} in a welcome message. */
function fillWelcome(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

/** The welcome post: a ping plus an embed with the member's avatar. */
function welcomeMessage(template, member) {
  return {
    content: `<@${member.id}>`,
    allowedMentions: { users: [member.id] },
    embeds: [
      embed()
        .setTitle(`Welcome, ${member.user.username}!`)
        .setDescription(fillWelcome(template, member))
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `Member #${member.guild.memberCount}` }),
    ],
  };
}

module.exports = {
  name: Events.GuildMemberAdd,
  fillWelcome,
  welcomeMessage,
  async execute(member) {
    await giveAutoroles(member).catch((error) => console.error('Could not give join roles:', error.message));

    const welcome = db.guild(member.guild.id).welcome;
    if (!welcome) return;
    const channel = member.guild.channels.cache.get(welcome.channelId);
    if (!channel?.isTextBased()) return;
    await channel.send(welcomeMessage(welcome.message, member));
  },
};
