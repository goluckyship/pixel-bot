// Level rewards: hand out roles when members reach a level.
module.exports = {
  id: 'levelrewards',
  emoji: '🎁',
  title: 'Level rewards',
  group: 'levels',
  order: 2,
  help: 'Roles members get automatically when they reach a level. Pixel Bot\'s role needs to be above them.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Give level rewards', default: true },
    {
      key: 'rewards', type: 'rows', label: 'Rewards', itemName: 'Reward', blank: 2,
      fields: [
        { key: 'role', type: 'role', label: 'Role', blank: '— pick a role —' },
        { key: 'level', type: 'number', label: 'At level', default: 5, min: 1 },
      ],
    },
    { key: 'stack', type: 'toggle', label: 'Keep lower rewards (off = swap to the newest one)', default: true, more: true },
  ],
  status(cfg, guild, ui) {
    return cfg.rewards?.length ? ui.on(ui.plural(cfg.rewards.length, 'reward')) : ui.off('None yet');
  },
};
