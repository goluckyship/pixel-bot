// Runs when someone leaves: posts the goodbye message, if it's switched on in the dashboard.
const { Events } = require('discord.js');
const db = require('../lib/storage');
const { embed, fill, hexColor, truncate } = require('../lib/ui');

function goodbyeMessage(goodbye, member) {
  const text = truncate(fill(goodbye.message || '**{username}** left the server.', { member }), 4000);
  if (goodbye.plain) return { content: truncate(text, 2000), allowedMentions: { parse: [] } };
  return {
    allowedMentions: { parse: [] },
    embeds: [embed(hexColor(goodbye.color) ?? undefined).setDescription(text).setThumbnail(member.user.displayAvatarURL({ size: 128 }))],
  };
}

module.exports = {
  name: Events.GuildMemberRemove,
  goodbyeMessage,
  async execute(member) {
    const goodbye = db.guild(member.guild.id).goodbye;
    if (!goodbye) return;
    const channel = member.guild.channels.cache.get(goodbye.channelId);
    if (!channel?.isTextBased()) return;
    await channel.send(goodbyeMessage(goodbye, member));
  },
};
