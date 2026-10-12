// Keeps the Staff role in sync whenever someone's roles change.
const { Events } = require('discord.js');
const { syncStaffRole } = require('../lib/roles');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(before, after) {
    if (!before.partial && before.roles.cache.size === after.roles.cache.size &&
        before.roles.cache.every((role) => after.roles.cache.has(role.id))) return;
    await syncStaffRole(after);
  },
};
