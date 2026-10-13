// Auto-replies: Pixel Bot answers common questions on its own.
const features = require('../lib/features');
const { fill, truncate } = require('../lib/ui');

const lastFired = new Map(); // `${guild}:${index}:${channel}` -> time

function matches(rule, content) {
  const text = content.toLowerCase();
  const trigger = String(rule.trigger ?? '').toLowerCase().trim();
  if (!trigger) return false;
  if (rule.match === 'exact') return text.trim() === trigger;
  if (rule.match === 'starts') return text.trim().startsWith(trigger);
  // "contains" matches whole words, so "hi" doesn't fire on "this".
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot || !message.content) return;
  const cfg = features.config(message.guildId, 'autoreply');
  if ((cfg.ignore ?? []).includes(message.channelId)) return;
  const rules = cfg.rules ?? [];
  const index = rules.findIndex((rule) => matches(rule, message.content));
  if (index < 0) return;
  const key = `${message.guildId}:${index}:${message.channelId}`;
  if (Date.now() - (lastFired.get(key) ?? 0) < Number(cfg.cooldown ?? 30) * 1000) return;
  lastFired.set(key, Date.now());
  const text = truncate(fill(rules[index].response, { member: message.member, channel: message.channel }), 2000);
  if (rules[index].reply === false) await message.channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  else await message.reply({ content: text, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
}

module.exports = {
  id: 'autoreply',
  emoji: '💬',
  title: 'Auto-replies',
  group: 'automation',
  order: 30,
  help: 'Pixel Bot answers common questions by itself, like "how do I get roles?". {user} in the answer pings whoever asked.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn auto-replies on', default: true },
    {
      key: 'rules', type: 'rows', label: 'Replies', itemName: 'Reply', blank: 2,
      fields: [
        { key: 'trigger', type: 'text', label: 'When someone says', placeholder: 'how do i get roles' },
        { key: 'response', type: 'textarea', label: 'Pixel Bot answers', placeholder: 'Grab them in #roles!' },
        { key: 'match', type: 'select', label: 'Match', options: { contains: 'Anywhere in the message', exact: 'The whole message', starts: 'At the start' }, default: 'contains' },
      ],
    },
    { key: 'cooldown', type: 'number', label: 'Seconds before the same reply can fire again in a channel', default: 30, min: 0, more: true },
    { key: 'ignore', type: 'channels', label: 'Channels to stay quiet in', more: true },
  ],
  status(cfg, guild, ui) {
    return cfg.rules?.length ? ui.on(ui.plural(cfg.rules.length, 'reply')) : ui.off('None yet');
  },
  events: [{ name: 'messageCreate', execute: onMessage }],
  matches,
};
