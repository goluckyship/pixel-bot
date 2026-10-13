// Anti-raid: blocks brand-new accounts and spots mass joins.
const features = require('../lib/features');
const { sendLog, logEntry } = require('../lib/log');
const { COLORS } = require('../lib/ui');
const { formatDuration } = require('../lib/duration');

const joins = new Map(); // guild -> [times]
const raidUntil = new Map(); // guild -> time raid mode ends

async function act(member, cfg, why) {
  const action = cfg.action || 'kick';
  if (action === 'kick') {
    await member.send(`You were removed from **${member.guild.name}** automatically (${why}). If that's a mistake, try again later.`).catch(() => {});
    if (member.kickable) await member.kick(`Anti-raid: ${why}`).catch(() => {});
  } else if (action === 'quarantine') {
    const role = member.guild.roles.cache.get(cfg.quarantine);
    if (role?.editable) await member.roles.add(role, `Anti-raid: ${why}`).catch(() => {});
  } else if (action === 'timeout' && member.moderatable) {
    await member.timeout(24 * 3600_000, `Anti-raid: ${why}`).catch(() => {});
  }
  await sendLog(member.guild, logEntry({ color: COLORS.danger, user: member.user, description: `🛡️ **Anti-raid** ${action === 'alert' ? 'flagged' : action === 'kick' ? 'kicked' : action === 'quarantine' ? 'quarantined' : 'timed out'} ${member} (${why}).` }), { roles: cfg.alertRole ? [cfg.alertRole] : [] }).catch(() => {});
}

async function onJoin(member) {
  if (member.user.bot) return;
  const cfg = features.config(member.guild.id, 'antiraid');
  const now = Date.now();

  // Mass joins: too many people in a short time switches on raid mode.
  const burst = Number(cfg.burstJoins ?? 8);
  if (burst > 0) {
    const list = (joins.get(member.guild.id) ?? []).filter((t) => now - t < Number(cfg.burstSeconds ?? 30) * 1000);
    list.push(now);
    joins.set(member.guild.id, list);
    if (list.length >= burst && (raidUntil.get(member.guild.id) ?? 0) < now) {
      const minutes = Number(cfg.raidMinutes ?? 10);
      raidUntil.set(member.guild.id, now + minutes * 60_000);
      await sendLog(member.guild, logEntry({ color: COLORS.danger, description: `🚨 **Possible raid:** ${list.length} people joined in ${cfg.burstSeconds ?? 30} seconds. Raid mode is on for ${formatDuration(minutes * 60_000)}: new joiners will be ${cfg.action === 'alert' ? 'flagged' : cfg.action === 'quarantine' ? 'quarantined' : cfg.action === 'timeout' ? 'timed out' : 'kicked'}.` }), { roles: cfg.alertRole ? [cfg.alertRole] : [] }).catch(() => {});
    }
  }
  if ((raidUntil.get(member.guild.id) ?? 0) > now) return act(member, cfg, 'joined during a raid');

  const minAge = Number(cfg.minAgeDays ?? 0);
  const age = now - (member.user.createdTimestamp ?? now);
  if (minAge > 0 && age < minAge * 86_400_000) return act(member, cfg, `account only ${formatDuration(Math.max(60_000, age))} old`);
  return null;
}

module.exports = {
  id: 'antiraid',
  emoji: '🛡️',
  title: 'Anti-raid',
  group: 'safety',
  order: 61,
  help: 'Stops brand-new throwaway accounts, and spots mass joins (raids). When lots of people join at once, raid mode switches on for a while and staff get an alert in the staff log.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn anti-raid on', default: false },
    { key: 'minAgeDays', type: 'number', label: 'Accounts younger than this many days get stopped (0 = off)', default: 3, min: 0 },
    { key: 'action', type: 'select', label: 'What to do with them', options: { kick: 'Kick them (they get a DM explaining)', quarantine: 'Give them a quarantine role', timeout: 'Time them out for a day', alert: 'Just alert staff' }, default: 'kick' },
    { key: 'quarantine', type: 'role', label: 'Quarantine role (if using quarantine)' },
    { key: 'alertRole', type: 'role', label: 'Ping this role in alerts', more: true },
    { key: 'burstJoins', type: 'number', label: 'Raid alarm: this many joins…', default: 8, min: 0, more: true },
    { key: 'burstSeconds', type: 'number', label: '…within this many seconds', default: 30, min: 1, more: true },
    { key: 'raidMinutes', type: 'number', label: 'Raid mode lasts this many minutes', default: 10, min: 1, more: true },
  ],
  validate: (v) => (v.enabled && v.action === 'quarantine' && !v.quarantine ? 'Pick a quarantine role, or choose a different action.' : null),
  status(cfg, guild, ui) {
    return ui.on(`${cfg.minAgeDays > 0 ? `Blocks accounts under ${cfg.minAgeDays} days` : 'Raid alarm only'}`);
  },
  events: [{ name: 'guildMemberAdd', execute: onJoin }],
  raidUntil,
};
