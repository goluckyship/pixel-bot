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
  return client.generateInvite(options);
}

module.exports = { inviteLink, PERMISSIONS };
