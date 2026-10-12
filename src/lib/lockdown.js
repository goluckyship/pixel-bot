// Locks channels so regular members can't send messages, and puts the exact
// permissions back afterwards. The Staff role can still talk in locked channels.
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('./storage');
const settings = require('./settings');
const { findRole } = require('./resolve');

const MEMBER_FLAGS = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads', 'AddReactions'];
const STAFF_FLAGS = ['SendMessages', 'SendMessagesInThreads'];
const LOCKABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum];

function state(guildId) {
  const g = db.guild(guildId);
  g.lockdown ??= {}; // channelId -> { everyone: {flag: true|false|null}, staff: {...} | null, staffRoleId }
  return g.lockdown;
}

/** true = allowed, false = denied, null = not set, for each flag on one overwrite. */
function snapshot(channel, id, flags) {
  const overwrite = channel.permissionOverwrites.cache.get(id);
  return Object.fromEntries(flags.map((flag) => {
    const bit = PermissionFlagsBits[flag];
    if (overwrite?.allow.has(bit)) return [flag, true];
    if (overwrite?.deny.has(bit)) return [flag, false];
    return [flag, null];
  }));
}

const isLocked = (channel) => Boolean(state(channel.guild.id)[channel.id]);

/** Channels regular members can see and talk in. */
function lockableChannels(guild) {
  const everyone = guild.roles.everyone;
  return [...guild.channels.cache.values()].filter((channel) =>
    LOCKABLE.includes(channel.type) && channel.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel));
}

async function lock(channel, reason) {
  if (isLocked(channel)) return false;
  const guild = channel.guild;
  const staffRole = findRole(guild, settings.get(guild.id).staffRole);
  const record = {
    everyone: snapshot(channel, guild.id, MEMBER_FLAGS),
    staff: staffRole ? snapshot(channel, staffRole.id, STAFF_FLAGS) : null,
    staffRoleId: staffRole?.id ?? null,
  };
  state(guild.id)[channel.id] = record;
  db.save();

  await channel.permissionOverwrites.edit(guild.roles.everyone, Object.fromEntries(MEMBER_FLAGS.map((f) => [f, false])), { reason });
  if (staffRole) {
    await channel.permissionOverwrites.edit(staffRole, Object.fromEntries(STAFF_FLAGS.map((f) => [f, true])), { reason });
  }
  return true;
}

async function unlock(channel, reason) {
  const record = state(channel.guild.id)[channel.id];
  if (!record) return false;
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, record.everyone, { reason });
  if (record.staffRoleId && record.staff) {
    const allUnset = Object.values(record.staff).every((value) => value === null);
    const staffOverwrite = channel.permissionOverwrites.cache.get(record.staffRoleId);
    if (allUnset && staffOverwrite && staffOverwrite.allow.bitfield === STAFF_FLAGS.reduce((sum, f) => sum | PermissionFlagsBits[f], 0n) && staffOverwrite.deny.bitfield === 0n) {
      await channel.permissionOverwrites.delete(record.staffRoleId, reason); // we created it, so remove it
    } else {
      await channel.permissionOverwrites.edit(record.staffRoleId, record.staff, { reason });
    }
  }
  delete state(channel.guild.id)[channel.id];
  db.save();
  return true;
}

module.exports = { lock, unlock, isLocked, lockableChannels, state, MEMBER_FLAGS };
