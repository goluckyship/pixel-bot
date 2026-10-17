// Member count: a channel whose name shows how many members you have.
const features = require('../lib/features');

const lastSet = new Map(); // guild -> time (Discord allows 2 renames per 10 minutes)

async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!features.isOn(guild.id, 'membercount')) continue;
    const cfg = features.config(guild.id, 'membercount');
    const channel = guild.channels.cache.get(cfg.channel);
    if (!channel) { if (!lastSet.has('warn' + guild.id)) { lastSet.set('warn' + guild.id, 1); console.warn(`Member count in ${guild.name}: channel ${cfg.channel} not found.`); } continue; }
    if (Date.now() - (lastSet.get(guild.id) ?? 0) < 6 * 60_000) continue;
    const humans = cfg.countBots ? guild.memberCount : guild.members.cache.filter((m) => !m.user.bot).size || guild.memberCount;
    const name = (cfg.template || '👥 Members: {count}').replaceAll('{count}', humans.toLocaleString('en-US')).slice(0, 100);
    if (channel.name === name) continue;
    lastSet.set(guild.id, Date.now());
    await channel.setName(name, 'Member count').catch((e) => console.warn(`Member count FAILED in ${require('../lib/permcheck').where(channel)}: ${e.message}. ${require('../lib/permcheck').problem(channel, ['ViewChannel', 'ManageChannels', 'Connect']) || ''}`));
  }
}

module.exports = {
  id: 'membercount',
  emoji: '👥',
  title: 'Member count channel',
  group: 'automation',
  order: 32,
  help: 'A channel whose name shows your member count, like "👥 Members: 120". A voice channel nobody can join works best. Discord only lets bots rename a channel every few minutes, so it can lag a little.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Show the member count', default: false },
    { key: 'channel', type: 'voice', label: 'Channel to rename', blank: '— pick a voice channel —' },
    { key: 'template', type: 'text', label: 'Name', default: '👥 Members: {count}' },
    { key: 'countBots', type: 'toggle', label: 'Count bots too', default: false, more: true },
  ],
  validate: (v) => (v.enabled && !v.channel ? 'Pick a channel first.' : null),
  status(cfg, guild, ui) {
    return cfg.channel ? ui.on(ui.chan(guild, cfg.channel)) : ui.off('Pick a channel');
  },
  tick,
};
