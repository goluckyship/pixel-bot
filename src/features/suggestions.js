// Suggestions: members post ideas with /suggest, everyone votes with buttons,
// and staff can approve or decline them.
const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const { embed, ephemeral, truncate, COLORS, hexColor } = require('../lib/ui');
const { form, value } = require('../lib/forms');

const store = (guildId) => features.data(guildId, 'suggestions', () => ({ counter: 0, items: {} }));
const STATUS = { open: { text: 'Open for votes', color: null }, approved: { text: '✅ Approved', color: COLORS.success }, declined: { text: '❌ Declined', color: COLORS.danger } };

function card(guild, s) {
  const cfg = features.config(guild.id, 'suggestions');
  const author = cfg.anonymous ? 'Anonymous' : `<@${s.authorId}>`;
  const c = embed(STATUS[s.status].color ?? hexColor(cfg.color) ?? undefined)
    .setTitle(`💡 Suggestion #${s.id}`)
    .setDescription(truncate(s.text, 4000))
    .addFields({ name: 'From', value: author, inline: true }, { name: 'Status', value: STATUS[s.status].text, inline: true }, { name: 'Votes', value: `👍 ${s.up.length} · 👎 ${s.down.length}`, inline: true });
  if (s.note) c.addFields({ name: 'Staff note', value: truncate(s.note, 1024) });
  return c;
}

function buttons(s) {
  const open = s.status === 'open';
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pb:sug:up:${s.id}`).setEmoji('👍').setLabel(String(s.up.length)).setStyle(ButtonStyle.Success).setDisabled(!open),
    new ButtonBuilder().setCustomId(`pb:sug:down:${s.id}`).setEmoji('👎').setLabel(String(s.down.length)).setStyle(ButtonStyle.Danger).setDisabled(!open),
    new ButtonBuilder().setCustomId(`pb:sug:review:${s.id}`).setLabel('Staff: review').setStyle(ButtonStyle.Secondary),
  )];
}

const isStaff = (member) => {
  const cfg = features.config(member.guild.id, 'suggestions');
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || (cfg.staff ?? []).some((id) => member.roles.cache.has(id));
};

const suggest = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Suggest an idea for the server')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('idea').setDescription('Your idea').setRequired(true).setMaxLength(4000)),
  async execute(interaction) {
    const cfg = features.config(interaction.guildId, 'suggestions');
    const channel = interaction.guild.channels.cache.get(cfg.channel);
    if (!channel) return interaction.reply(ephemeral('Suggestions need a channel. Ask a manager to pick one in the dashboard.'));
    const st = store(interaction.guildId);
    const s = { id: ++st.counter, authorId: interaction.user.id, text: interaction.options.getString('idea'), up: [], down: [], status: 'open', channelId: channel.id, at: Date.now() };
    const sent = await channel.send({ embeds: [card(interaction.guild, s)], components: buttons(s), allowedMentions: { parse: [] } });
    s.messageId = sent.id;
    st.items[s.id] = s;
    db.save();
    if (cfg.thread && sent.startThread) await sent.startThread({ name: `Suggestion #${s.id}` }).catch(() => {});
    return interaction.reply(ephemeral(`💡 Thanks! Your suggestion is up in ${channel}.`));
  },
};

async function onButton(interaction, action, id) {
  const st = store(interaction.guildId);
  const s = st.items[id];
  if (!s) return interaction.reply(ephemeral('That suggestion is gone.'));
  if (action === 'up' || action === 'down') {
    const me = interaction.user.id;
    const [mine, other] = action === 'up' ? [s.up, s.down] : [s.down, s.up];
    if (other.includes(me)) other.splice(other.indexOf(me), 1);
    if (mine.includes(me)) mine.splice(mine.indexOf(me), 1);
    else mine.push(me);
    db.saveSoon();
    return interaction.update({ embeds: [card(interaction.guild, s)], components: buttons(s) });
  }
  if (action === 'review') {
    if (!isStaff(interaction.member)) return interaction.reply(ephemeral('Only staff can review suggestions.'));
    return interaction.showModal(form(`pb:sug:decide:${id}`, `Review suggestion #${id}`, [
      { id: 'decision', label: 'Type approve, decline or open', required: true, max: 10, value: s.status === 'open' ? 'approve' : s.status },
      { id: 'note', label: 'Note for everyone (optional)', long: true, max: 1000, value: s.note ?? '' },
    ]));
  }
  if (action === 'decide') {
    if (!isStaff(interaction.member)) return interaction.reply(ephemeral('Only staff can review suggestions.'));
    const d = (value(interaction, 'decision') ?? '').toLowerCase();
    s.status = d.startsWith('a') ? 'approved' : d.startsWith('d') ? 'declined' : 'open';
    s.note = value(interaction, 'note') ?? '';
    db.save();
    const channel = interaction.guild.channels.cache.get(s.channelId);
    const msg = await channel?.messages.fetch(s.messageId).catch(() => null);
    await msg?.edit({ embeds: [card(interaction.guild, s)], components: buttons(s) }).catch(() => {});
    return interaction.reply({ content: `Suggestion #${id} is now **${STATUS[s.status].text}**.`, flags: MessageFlags.Ephemeral });
  }
  return null;
}

module.exports = {
  id: 'suggestions',
  emoji: '💡',
  title: 'Suggestions',
  group: 'community',
  order: 11,
  help: 'Members share ideas with /suggest. Everyone votes 👍 or 👎, and staff can approve or decline with a note.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn suggestions on', default: false },
    { key: 'channel', type: 'channel', label: 'Suggestions channel', blank: '— pick a channel —' },
    { key: 'thread', type: 'toggle', label: 'Open a discussion thread on each one', default: true },
    { key: 'anonymous', type: 'toggle', label: 'Hide who suggested it', default: false, more: true },
    { key: 'staff', type: 'roles', label: 'Who can approve or decline (as well as managers)', more: true },
    { key: 'color', type: 'color', label: 'Card colour', more: true },
  ],
  validate: (v) => (v.enabled && !v.channel ? 'Pick a suggestions channel first.' : null),
  status(cfg, guild, ui) {
    const n = Object.keys(store(guild.id).items).length;
    return cfg.channel ? ui.on(`In ${ui.chan(guild, cfg.channel)}${n ? `, ${ui.plural(n, 'idea')}` : ''}`) : ui.off('Pick a channel');
  },
  commands: [suggest],
  components: { sug: onButton },
};
