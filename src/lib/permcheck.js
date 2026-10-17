// Says in plain words why Pixel Bot can't use a channel (for the console log).
const { PermissionFlagsBits: P } = require('discord.js');

const NAMES = { ViewChannel: 'View Channel', SendMessages: 'Send Messages', EmbedLinks: 'Embed Links', ManageChannels: 'Manage Channels', AttachFiles: 'Attach Files', Connect: 'Connect' };

/** Returns '' when fine, or a sentence about what's wrong. */
function problem(channel, needs = ['ViewChannel', 'SendMessages', 'EmbedLinks']) {
  if (!channel) return 'the channel was deleted or Pixel Bot can\'t see it';
  const me = channel.guild?.members?.me;
  if (!me) return 'Pixel Bot is not loaded in this server yet';
  if (me.isCommunicationDisabled?.()) return 'Pixel Bot is timed out in this server';
  const perms = channel.permissionsFor(me);
  if (!perms) return 'Discord did not give Pixel Bot\'s permissions for this channel';
  const admin = perms.has(P.Administrator);
  const missing = admin ? [] : needs.filter((n) => !perms.has(P[n]));
  const roles = me.roles.cache.filter((r) => r.id !== channel.guild.id).map((r) => r.name);
  const who = `bot roles: ${roles.join(', ') || 'none'}; Administrator: ${admin ? 'yes' : 'no'}`;
  if (missing.length) return `missing ${missing.map((n) => NAMES[n] ?? n).join(', ')} (${who})`;
  return '';
}

function where(channel) {
  return channel ? `#${channel.name} (${channel.id}) in ${channel.guild?.name}` : 'unknown channel';
}

module.exports = { problem, where };
