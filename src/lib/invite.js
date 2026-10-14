// The "Add Pixel Bot to a server" link, with every permission its features use.
const { OAuth2Scopes, PermissionFlagsBits } = require('discord.js');

const PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.SendPolls,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.MoveMembers, // AFK room
  PermissionFlagsBits.ManageNicknames, // [AFK] nicknames, role restore
  PermissionFlagsBits.ManageGuild, // invite tracking
  PermissionFlagsBits.CreatePublicThreads, // suggestion threads
  PermissionFlagsBits.ChangeNickname,
];

/** The invite link. Pass a server ID to pre-pick that server. */
function inviteLink(client, guildId) {
  const options = { scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: PERMISSIONS };
  if (guildId) Object.assign(options, { guild: guildId, disableGuildSelect: true });
  try {
    return client.generateInvite(options);
  } catch {
    // Not connected to Discord yet: build the same link from the ID in the bot's token.
    const id = Buffer.from(String(client.token ?? process.env.DISCORD_TOKEN ?? '').split('.')[0], 'base64').toString('utf8');
    if (!/^\d{17,20}$/.test(id)) throw new Error('Pixel Bot is still connecting to Discord. Try again in a minute.');
    const perms = PERMISSIONS.reduce((all, p) => all | BigInt(p), 0n);
    const params = new URLSearchParams({ client_id: id, scope: 'bot applications.commands', permissions: String(perms) });
    if (guildId) { params.set('guild_id', guildId); params.set('disable_guild_select', 'true'); }
    return `https://discord.com/oauth2/authorize?${params}`;
  }
}

module.exports = { inviteLink, PERMISSIONS };
