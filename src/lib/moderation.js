// Shared safety checks for moderation commands.

/**
 * Checks whether the person running the command is allowed to act on `target`,
 * and whether Pixel Bot itself is able to.
 * Returns a message explaining the problem, or null if everything is fine.
 *
 * @param ability 'kickable' | 'bannable' | 'moderatable' - what the bot must be able to do
 * @param verb    the word used in messages, e.g. 'kick'
 */
function checkTarget(interaction, target, ability, verb) {
  const { guild, member: moderator, client } = interaction;

  if (!target) return "That user isn't in this server.";
  if (target.id === interaction.user.id) return `You can't ${verb} yourself.`;
  if (target.id === client.user.id) return `I can't ${verb} myself.`;
  if (target.id === guild.ownerId) return `You can't ${verb} the server owner.`;

  // Moderators can only act on people below them in the role list.
  const isOwner = interaction.user.id === guild.ownerId;
  if (!isOwner && moderator.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return `You can't ${verb} someone whose top role is the same as or higher than yours.`;
  }

  if (ability && !target[ability]) {
    return `I can't ${verb} that member. In Server Settings → Roles, drag my role above theirs and make sure I have the right permission.`;
  }
  return null;
}

/** Adds who did it to the reason shown in the server's Audit Log. */
function auditReason(interaction, reason) {
  return `${reason} (by ${interaction.user.tag})`.slice(0, 512);
}

module.exports = { checkTarget, auditReason };
