// Server stats: members, joins, leaves and how chatty the server is, at a glance.
const features = require('../lib/features');
const db = require('../lib/storage');
const settings = require('../lib/settings');
const { partsIn } = require('../lib/when');

const store = (guildId) => features.data(guildId, 'stats', () => ({ days: {}, chatters: {} }));
function today(guildId, offsetDays = 0) {
  const p = partsIn(settings.get(guildId).timezone, Date.now() - offsetDays * 86_400_000);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function day(guildId, key = today(guildId)) {
  const st = store(guildId);
  st.days[key] ??= { messages: 0, joins: 0, leaves: 0 };
  // Keep about two months.
  const keys = Object.keys(st.days).sort();
  while (keys.length > 62) delete st.days[keys.shift()];
  return st.days[key];
}
const sumDays = (guildId, n, field) => Array.from({ length: n }, (_, i) => store(guildId).days[today(guildId, i)]?.[field] ?? 0).reduce((a, b) => a + b, 0);

function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  day(message.guildId).messages += 1;
  const st = store(message.guildId);
  const week = today(message.guildId, 0).slice(0, 8) + 'w' + Math.floor(Date.now() / 604_800_000);
  if (st.chattersWeek !== week) {
    st.chattersWeek = week;
    st.chatters = {};
  }
  st.chatters[message.author.id] = (st.chatters[message.author.id] ?? 0) + 1;
  db.saveSoon();
}

module.exports = {
  id: 'stats',
  emoji: '📊',
  title: 'Server stats',
  group: 'automation',
  order: 41,
  help: 'How your server is doing. Counting started when this was added, so it fills in over time.',
  fields: [],
  status(cfg, guild, ui) {
    return `${guild.memberCount} members · ${sumDays(guild.id, 1, 'messages')} messages today`;
  },
  dashboardFirst: true,
  dashboard(ctx) {
    const g = ctx.guild;
    const id = g.id;
    const tiles = [
      [g.memberCount, 'members'],
      [`+${sumDays(id, 7, 'joins')}`, 'joined this week'],
      [`−${sumDays(id, 7, 'leaves')}`, 'left this week'],
      [sumDays(id, 7, 'messages').toLocaleString('en-US'), 'messages this week'],
    ];
    const last14 = Array.from({ length: 14 }, (_, i) => 13 - i).map((i) => ({ label: today(id, i).slice(5).replace('-', '/'), n: store(id).days[today(id, i)]?.messages ?? 0 }));
    const max = Math.max(1, ...last14.map((d) => d.n));
    const bars = last14.map((d) => `<div class="bar" title="${ctx.esc(d.label)}: ${d.n} messages"><span style="height:${Math.round((d.n / max) * 100)}%"></span><small>${ctx.esc(d.label)}</small></div>`).join('');
    const top = Object.entries(store(id).chatters ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const name = (uid) => ctx.esc(g.members.cache.get(uid)?.displayName ?? 'Someone who left');
    return `<div class="stats">${tiles.map(([n, label]) => `<div><b>${ctx.esc(n)}</b><small>${ctx.esc(label)}</small></div>`).join('')}</div>
<h2 class="minor">Messages, last 14 days</h2><div class="bars" role="img" aria-label="Messages per day for the last 14 days">${bars}</div>
<p class="help small">${max > 1 || last14.some((d) => d.n) ? `Busiest day: ${ctx.esc(last14.reduce((a, b) => (b.n > a.n ? b : a)).label)} with ${max} messages. Hover a bar for its number.` : 'No messages counted yet.'}</p>
<h2 class="minor">Chattiest this week</h2>${top.length ? `<div class="rows">${top.map(([uid, n], i) => `<div class="row"><span class="emoji">${['🥇', '🥈', '🥉', '4', '5'][i]}</span><span class="t"><b>${name(uid)}</b><small>${n} messages</small></span></div>`).join('')}</div>` : '<p class="empty">No messages counted yet this week.</p>'}`;
  },
  events: [
    { name: 'messageCreate', execute: onMessage, always: true },
    { name: 'guildMemberAdd', execute: (m) => { day(m.guild.id).joins += 1; db.saveSoon(); }, always: true },
    { name: 'guildMemberRemove', execute: (m) => { day(m.guild.id).leaves += 1; db.saveSoon(); }, always: true },
  ],
};
