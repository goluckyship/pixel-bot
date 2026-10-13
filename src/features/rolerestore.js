// Role restore: when someone leaves and comes back, they get their roles back.
const features = require('../lib/features');
const db = require('../lib/storage');

const store = (guildId) => features.data(guildId, 'rolerestore', () => ({ members: {} })); // id -> { roles, nick, at }

function onLeave(member) {
  const cfg = features.config(member.guild.id, 'rolerestore');
  const roles = [...(member.roles?.cache?.values?.() ?? [])].filter((r) => r.id !== member.guild.id && !r.managed && !(cfg.ignore ?? []).includes(r.id)).map((r) => r.id);
  if (!roles.length && !member.nickname) return;
  store(member.guild.id).members[member.id] = { roles, nick: member.nickname ?? null, at: Date.now() };
  db.saveSoon();
}

async function onJoin(member) {
  const st = store(member.guild.id);
  const saved = st.members[member.id];
  if (!saved) return;
  const cfg = features.config(member.guild.id, 'rolerestore');
  const days = Number(cfg.forgetDays ?? 90);
  if (days > 0 && Date.now() - saved.at > days * 86_400_000) {
    delete st.members[member.id];
    db.saveSoon();
    return;
  }
  const roles = saved.roles.map((id) => member.guild.roles.cache.get(id)).filter((r) => r?.editable && !(cfg.ignore ?? []).includes(r.id));
  if (roles.length) await member.roles.add(roles, 'Welcome back: roles restored').catch(() => {});
  if (cfg.nickname && saved.nick && member.manageable) await member.setNickname(saved.nick, 'Welcome back').catch(() => {});
  delete st.members[member.id];
  db.saveSoon();
}

module.exports = {
  id: 'rolerestore',
  emoji: '♻️',
  title: 'Role restore',
  group: 'safety',
  order: 63,
  help: 'If someone leaves and rejoins, they get their old roles back, so leaving can\'t be used to dodge a Muted role, and regulars don\'t lose their ranks.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Give roles back to people who rejoin', default: true },
    { key: 'ignore', type: 'roles', label: 'Roles not to give back', more: true },
    { key: 'nickname', type: 'toggle', label: 'Give their nickname back too', default: true, more: true },
    { key: 'forgetDays', type: 'number', label: 'Forget after this many days (0 = never)', default: 90, min: 0, more: true },
  ],
  status(cfg, guild, ui) {
    const n = Object.keys(store(guild.id).members).length;
    return ui.on(n ? `Remembering ${ui.plural(n, 'member')}` : 'On');
  },
  events: [
    { name: 'guildMemberRemove', execute: onLeave },
    { name: 'guildMemberAdd', execute: onJoin },
  ],
};
