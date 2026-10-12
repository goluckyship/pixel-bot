// Automatic roles: the join role, the Staff role rule, and the promote/demote ladder.
const { PermissionFlagsBits } = require('discord.js');
const settings = require('./settings');
const { findRole, findRoles } = require('./resolve');

/** Gives the join roles to a new member. */
async function giveAutoroles(member) {
  if (member.user.bot) return [];
  const config = settings.get(member.guild.id);
  const roles = findRoles(member.guild, config.autoroles).filter((role) => role.editable);
  if (roles.length === 0) return [];
  await member.roles.add(roles, 'Pixel Bot auto role');
  return roles;
}

/**
 * Adds the Staff role to anyone with a staff rank, and removes it from anyone without one.
 * Returns 'added', 'removed' or null.
 */
async function syncStaffRole(member) {
  const config = settings.get(member.guild.id);
  const staffRole = findRole(member.guild, config.staffRole);
  if (!staffRole || !staffRole.editable || member.user.bot) return null;

  const sources = findRoles(member.guild, config.staffSourceRoles);
  const qualifies = sources.some((role) => member.roles.cache.has(role.id));
  const hasStaff = member.roles.cache.has(staffRole.id);

  if (qualifies && !hasStaff) {
    await member.roles.add(staffRole, 'Pixel Bot: has a staff rank');
    return 'added';
  }
  if (!qualifies && hasStaff) {
    await member.roles.remove(staffRole, 'Pixel Bot: no staff rank');
    return 'removed';
  }
  return null;
}

/** The ladder as role objects, lowest first. Missing roles are null. */
function rankRoles(guild) {
  return settings.get(guild.id).ranks.map((entry) => findRole(guild, entry));
}

/** Index of the highest rank the member holds, or -1. */
function currentRank(member, ranks) {
  let current = -1;
  ranks.forEach((role, index) => {
    if (role && member.roles.cache.has(role.id)) current = index;
  });
  return current;
}

function canManageRanks(member) {
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return findRoles(member.guild, settings.get(member.guild.id).rankManagers).some((role) => member.roles.cache.has(role.id));
}

/**
 * Moves `target` one rank up (direction 1) or down (direction -1).
 * Returns { ok, message } where message is what to tell the moderator.
 */
async function changeRank(moderator, target, direction) {
  const guild = target.guild;
  const ranks = rankRoles(guild);
  if (ranks.some((role) => !role)) {
    return { ok: false, message: 'One of the staff ranks no longer exists. Check `/setup show` or the dashboard.' };
  }
  if (ranks.some((role) => !role.editable)) {
    return { ok: false, message: "I can't hand out every staff rank. In Server Settings → Roles, drag my role above all the staff ranks." };
  }

  const top = ranks.length - 1;
  const current = currentRank(target, ranks);
  const next = current + direction;
  const isOwner = moderator.id === guild.ownerId;
  const verb = direction > 0 ? 'promote' : 'demote';

  if (target.id === moderator.id) return { ok: false, message: `You can't ${verb} yourself.` };
  if (target.user.bot) return { ok: false, message: `Bots can't be ${verb}d.` };
  if (direction > 0 && current === top) return { ok: false, message: `${target} is already at the highest rank.` };
  if (direction < 0 && current === -1) return { ok: false, message: `${target} doesn't have a staff rank.` };
  if (!isOwner && (next === top || current === top)) {
    return { ok: false, message: `Only the server owner can ${verb} someone ${direction > 0 ? 'to' : 'from'} the highest rank.` };
  }

  const reason = `${direction > 0 ? 'Promoted' : 'Demoted'} by ${moderator.user.tag}`;
  const remove = ranks.filter((role, index) => index !== next && target.roles.cache.has(role.id));
  if (remove.length) await target.roles.remove(remove, reason);
  if (next >= 0) await target.roles.add(ranks[next], reason);

  if (direction > 0) return { ok: true, message: `📈 ${target} has been promoted to ${ranks[next]} by ${moderator}.` };
  if (next >= 0) return { ok: true, message: `📉 ${target} has been demoted to ${ranks[next]} by ${moderator}.` };
  return { ok: true, message: `📉 ${target} has been removed from the staff team by ${moderator}.` };
}

module.exports = { giveAutoroles, syncStaffRole, rankRoles, currentRank, canManageRanks, changeRank };
