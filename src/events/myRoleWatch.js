// Logs the moment Pixel Bot's own role gains or loses Administrator, and who did it.
const { Events, PermissionFlagsBits, AuditLogEvent } = require('discord.js');

module.exports = {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    const me = newRole.guild.members.me;
    if (!me?.roles.cache.has(newRole.id)) return;
    const was = oldRole.permissions.has(PermissionFlagsBits.Administrator);
    const now = newRole.permissions.has(PermissionFlagsBits.Administrator);
    if (was === now) return;
    await new Promise((r) => setTimeout(r, 1500)); // let the audit log catch up
    const logs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 3 }).catch(() => null);
    const entry = logs?.entries.find((e) => e.targetId === newRole.id && Date.now() - e.createdTimestamp < 30_000);
    const who = entry ? `${entry.executor?.tag ?? entry.executorId}${entry.executor?.bot ? ' (a BOT)' : ''}` : 'Discord itself / no audit entry';
    console.warn(`[role watch] ${newRole.guild.name}: Pixel Bot's role "${newRole.name}" Administrator ${was ? 'ON' : 'off'} -> ${now ? 'ON' : 'off'} by ${who}`);
  },
};
