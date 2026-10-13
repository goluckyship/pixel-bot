// Giveaways: /giveaway start, members click to enter, winners are picked automatically.
const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const { embed, ephemeral, truncate, hexColor, COLORS } = require('../lib/ui');
const { parseDuration } = require('../lib/duration');
const settings = require('../lib/settings');

const store = (guildId) => features.data(guildId, 'giveaways', () => ({ counter: 0, items: {} }));

function card(guild, gw) {
  const cfg = features.config(guild.id, 'giveaways');
  const ended = gw.ended;
  const c = embed(ended ? COLORS.warning : hexColor(cfg.color) ?? undefined)
    .setTitle(`🎉 ${truncate(gw.prize, 240)}`)
    .setDescription([
      gw.description ? `${gw.description}\n` : '',
      ended ? (gw.winners.length ? `**Winner${gw.winners.length === 1 ? '' : 's'}:** ${gw.winners.map((id) => `<@${id}>`).join(', ')}` : 'Nobody entered, so there\'s no winner.') : `Ends <t:${Math.floor(gw.endsAt / 1000)}:R>`,
      `Hosted by <@${gw.hostId}> · ${gw.count} winner${gw.count === 1 ? '' : 's'}`,
      gw.role ? `Only for <@&${gw.role}>` : '',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Giveaway #${gw.id} · ${gw.entries.length} entr${gw.entries.length === 1 ? 'y' : 'ies'}` });
  return c;
}
const row = (guild, gw) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`pb:gw:enter:${gw.id}`).setLabel(features.config(guild.id, 'giveaways').button || 'Enter').setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(Boolean(gw.ended)),
)];

function draw(entries, count) {
  const pool = [...entries];
  const out = [];
  while (pool.length && out.length < count) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

async function finish(guild, gw, { reroll = false } = {}) {
  gw.winners = draw(reroll ? gw.entries.filter((id) => !gw.winners.includes(id)) : gw.entries, gw.count);
  gw.ended = true;
  db.save();
  const channel = guild.channels.cache.get(gw.channelId);
  const msg = await channel?.messages.fetch(gw.messageId).catch(() => null);
  await msg?.edit({ embeds: [card(guild, gw)], components: row(guild, gw) }).catch(() => {});
  if (channel) {
    await channel.send({
      content: gw.winners.length ? `🎉 Congratulations ${gw.winners.map((id) => `<@${id}>`).join(', ')}! You won **${gw.prize}**!` : `No one entered the giveaway for **${gw.prize}**.`,
      allowedMentions: { users: gw.winners },
    }).catch(() => {});
  }
  return gw.winners;
}

const canHost = (member) => {
  const cfg = features.config(member.guild.id, 'giveaways');
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || (cfg.hosts ?? []).some((id) => member.roles.cache.has(id));
};

const giveaway = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start, end or reroll giveaways')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('start').setDescription('Start a giveaway')
        .addStringOption((o) => o.setName('prize').setDescription('What they win').setRequired(true).setMaxLength(240))
        .addStringOption((o) => o.setName('duration').setDescription('How long, like 1h, 2d or 1w').setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setDescription('How many winners (default 1)').setMinValue(1).setMaxValue(50))
        .addChannelOption((o) => o.setName('channel').setDescription('Where (default: here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addRoleOption((o) => o.setName('only_for').setDescription('Only members with this role can enter'))
        .addStringOption((o) => o.setName('details').setDescription('Extra info').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('end').setDescription('End a giveaway now').addIntegerOption((o) => o.setName('number').setDescription('Giveaway number').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Pick new winners').addIntegerOption((o) => o.setName('number').setDescription('Giveaway number').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('See running giveaways')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const st = store(interaction.guildId);
    if (sub === 'list') {
      const running = Object.values(st.items).filter((gw) => !gw.ended);
      return interaction.reply(ephemeral(running.length ? running.map((gw) => `**#${gw.id}** ${gw.prize} · ends <t:${Math.floor(gw.endsAt / 1000)}:R> · ${gw.entries.length} entries`).join('\n') : 'No giveaways running.'));
    }
    if (!canHost(interaction.member)) return interaction.reply(ephemeral('Only server managers (or the giveaway hosts set in the dashboard) can do that.'));
    if (sub === 'start') {
      const ms = parseDuration(interaction.options.getString('duration'));
      if (!ms || ms < 10_000) return interaction.reply(ephemeral('I didn\'t understand that duration. Try 30m, 2h, 3d or 1w.'));
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      const gw = {
        id: ++st.counter, prize: interaction.options.getString('prize'), description: interaction.options.getString('details') ?? '',
        count: interaction.options.getInteger('winners') ?? 1, role: interaction.options.getRole('only_for')?.id ?? '',
        hostId: interaction.user.id, channelId: channel.id, endsAt: Date.now() + ms, entries: [], winners: [], ended: false,
      };
      const cfg = features.config(interaction.guildId, 'giveaways');
      const ping = cfg.ping ? interaction.guild.roles.cache.get(cfg.ping) : null;
      const sent = await channel.send({ content: ping ? `${ping}` : undefined, allowedMentions: { roles: ping ? [ping.id] : [] }, embeds: [card(interaction.guild, gw)], components: row(interaction.guild, gw) });
      gw.messageId = sent.id;
      st.items[gw.id] = gw;
      db.save();
      return interaction.reply(ephemeral(`🎉 Giveaway #${gw.id} started in ${channel}.`));
    }
    const gw = st.items[interaction.options.getInteger('number')];
    if (!gw) return interaction.reply(ephemeral('There\'s no giveaway with that number.'));
    if (sub === 'end') {
      if (gw.ended) return interaction.reply(ephemeral('That giveaway already ended. Use /giveaway reroll for new winners.'));
      await interaction.reply(ephemeral('Ending it now…'));
      await finish(interaction.guild, gw);
      return null;
    }
    if (sub === 'reroll') {
      if (!gw.ended) return interaction.reply(ephemeral('That giveaway is still running.'));
      await interaction.reply(ephemeral('Picking new winners…'));
      await finish(interaction.guild, gw, { reroll: true });
    }
    return null;
  },
};

async function onButton(interaction, action, id) {
  const gw = store(interaction.guildId).items[id];
  if (!gw || gw.ended) return interaction.reply(ephemeral('This giveaway has ended.'));
  if (gw.role && !interaction.member.roles.cache.has(gw.role)) return interaction.reply(ephemeral(`This giveaway is only for <@&${gw.role}>.`));
  const i = gw.entries.indexOf(interaction.user.id);
  if (i >= 0) gw.entries.splice(i, 1);
  else gw.entries.push(interaction.user.id);
  db.saveSoon();
  await interaction.update({ embeds: [card(interaction.guild, gw)], components: row(interaction.guild, gw) });
  return interaction.followUp(ephemeral(i >= 0 ? 'You left the giveaway.' : '🎉 You\'re in! Good luck!'));
}

async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!features.isOn(guild.id, 'giveaways')) continue;
    for (const gw of Object.values(store(guild.id).items)) {
      if (!gw.ended && Date.now() >= gw.endsAt) await finish(guild, gw);
    }
  }
}

module.exports = {
  id: 'giveaways',
  emoji: '🎉',
  title: 'Giveaways',
  group: 'community',
  order: 12,
  help: 'Start one with /giveaway start. Members click Enter, and winners are picked and pinged automatically when time\'s up.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn giveaways on', default: true },
    { key: 'hosts', type: 'roles', label: 'Who can start giveaways (as well as managers)' },
    { key: 'ping', type: 'role', label: 'Ping this role when one starts', more: true },
    { key: 'button', type: 'text', label: 'Enter button text', default: 'Enter', more: true },
    { key: 'color', type: 'color', label: 'Card colour', more: true },
  ],
  status(cfg, guild, ui) {
    const running = Object.values(store(guild.id).items).filter((gw) => !gw.ended).length;
    return ui.on(running ? `${ui.plural(running, 'giveaway')} running` : 'Ready');
  },
  dashboard(ctx) {
    const running = Object.values(store(ctx.guild.id).items).filter((gw) => !gw.ended);
    if (!running.length) return '<p class="empty">No giveaways running. Start one in Discord with /giveaway start.</p>';
    return `<h2 class="minor">Running now</h2><div class="rows">${running.map((gw) => `<div class="row"><span class="emoji">🎁</span><span class="t"><b>#${gw.id} ${ctx.esc(gw.prize)}</b><small>${gw.entries.length} entries, ends ${ctx.esc(new Date(gw.endsAt).toLocaleString('en-US', { timeZone: settings.get(ctx.guild.id).timezone, dateStyle: 'medium', timeStyle: 'short' }))}</small></span>${ctx.form('end', ctx.hidden('id', gw.id), 'End now')}</div>`).join('')}</div>`;
  },
  actions: {
    async end({ guild, form }) {
      const gw = store(guild.id).items[Number(form.id)];
      if (!gw || gw.ended) return { ok: false, text: 'That giveaway already ended.' };
      const winners = await finish(guild, gw);
      return { ok: true, text: `Giveaway #${gw.id} ended with ${winners.length} winner${winners.length === 1 ? '' : 's'}.` };
    },
  },
  commands: [giveaway],
  components: { gw: onButton },
  tick,
  finish, store,
};
