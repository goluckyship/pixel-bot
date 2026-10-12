// Finds roles and channels from the names in src/config.js.
const { ChannelType } = require('discord.js');

/** "🔱 SR Moderator" -> "srmoderator" (emoji, symbols, spaces and capitals removed). */
function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const isId = (value) => /^\d{17,20}$/.test(String(value));

/** A role by ID or loose name, or null. */
function findRole(guild, nameOrId) {
  if (!nameOrId) return null;
  if (isId(nameOrId)) return guild.roles.cache.get(String(nameOrId)) ?? null;
  const wanted = normalize(nameOrId);
  return guild.roles.cache.find((role) => normalize(role.name) === wanted) ?? null;
}

/** Several roles, skipping any that don't exist. */
function findRoles(guild, list) {
  return (list ?? []).map((entry) => findRole(guild, entry)).filter(Boolean);
}

/** A channel by ID or loose name. `types` limits which kinds of channel count. */
function findChannel(guild, nameOrId, types = [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
  if (!nameOrId) return null;
  if (isId(nameOrId)) return guild.channels.cache.get(String(nameOrId)) ?? null;
  const wanted = normalize(nameOrId);
  return guild.channels.cache.find((channel) => types.includes(channel.type) && normalize(channel.name) === wanted) ?? null;
}

function findCategory(guild, nameOrId) {
  return findChannel(guild, nameOrId, [ChannelType.GuildCategory]);
}

module.exports = { normalize, findRole, findRoles, findChannel, findCategory };
