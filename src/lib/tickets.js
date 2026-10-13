// Ticket system: a panel with a button, a form, a private channel per ticket,
// and a transcript when it's closed. Settings come from lib/settings.js.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const settings = require('./settings');
const db = require('./storage');
const { findRoles, findCategory, findChannel } = require('./resolve');
const { embed, ephemeral, truncate, fill, COLORS } = require('./ui');
const { sendLog, logEntry } = require('./log');
const { form, value } = require('./forms');
const panels = require('./panels');

/** Ticket settings for a server. */
const ticketSettings = (guildId) => settings.get(guildId).tickets;

function state(guildId) {
  const g = db.guild(guildId);
  g.tickets ??= { counter: 0, open: {} }; // open: { channelId: { userId, number, reason, openedAt } }
  return g.tickets;
}

function panelMessage(guildId) {
  const T = ticketSettings(guildId);
  return {
    embeds: [embed().setTitle(T.panelTitle).setDescription(T.panelText)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pb:ticket:open').setLabel('Create ticket').setEmoji('🎟️').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

/** The panel option a ticket was opened from, if it still exists. */
function optionFor(guildId, ticket) {
  const panel = ticket?.panelId ? panels.get(guildId, ticket.panelId) : null;
  return { panel, item: panel?.items[ticket.optionIndex] ?? null };
}

/** Staff roles for a ticket: the panel option's, or the server default. */
function staffRolesFor(guild, item) {
  const list = item?.staffRoles?.length ? item.staffRoles : ticketSettings(guild.id).staffRoles;
  return findRoles(guild, list);
}

function isStaff(member, ticket) {
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  const { item } = optionFor(member.guild.id, ticket);
  return staffRolesFor(member.guild, item).some((role) => member.roles.cache.has(role.id));
}

/** The user's open ticket channel, if they have one that still exists. */
function openTicketFor(guild, userId) {
  const open = state(guild.id).open;
  for (const [channelId, ticket] of Object.entries(open)) {
    if (ticket.userId !== userId) continue;
    if (guild.channels.cache.has(channelId)) return channelId;
    delete open[channelId]; // channel was deleted by hand
    db.save();
  }
  return null;
}

// Old "Create ticket" button (posted before panels existed): open it like Panel #1.
async function onOpen(interaction) {
  const legacy = panels.store(interaction.guildId).legacyTicketPanel;
  const panel = legacy && panels.get(interaction.guildId, legacy);
  if (panel?.type === 'tickets' && panel.items.length) return onPanelOpen(interaction, panel, 0);
  const T = ticketSettings(interaction.guildId);
  const existing = openTicketFor(interaction.guild, interaction.user.id);
  if (existing && T.maxOpenPerUser <= 1) {
    return interaction.reply(ephemeral(`You already have an open ticket: <#${existing}>`));
  }
  const modal = new ModalBuilder()
    .setCustomId('pb:ticket:submit')
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel(truncate(T.question, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
  await interaction.showModal(modal);
}

// Form submitted: create the private channel.
async function onSubmit(interaction) {
  const { guild, user } = interaction;
  const T = ticketSettings(guild.id);
  const reason = interaction.fields.getTextInputValue('reason').trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = openTicketFor(guild, user.id);
  if (existing && T.maxOpenPerUser <= 1) {
    return interaction.editReply(`You already have an open ticket: <#${existing}>`);
  }

  const s = state(guild.id);
  s.counter += 1;
  const number = s.counter;
  const staffRoles = findRoles(guild, T.staffRoles);
  const access = [
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks,
  ];

  const channel = await guild.channels.create({
    name: `ticket-${String(number).padStart(4, '0')}`,
    type: ChannelType.GuildText,
    parent: findCategory(guild, T.category)?.id ?? null,
    topic: truncate(`Ticket #${number} for ${user.tag}: ${reason}`, 1024),
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: access },
      ...staffRoles.map((role) => ({ id: role.id, allow: [...access, PermissionFlagsBits.ManageMessages] })),
      { id: guild.members.me.id, allow: [...access, PermissionFlagsBits.ManageChannels] },
    ],
    reason: `Ticket opened by ${user.tag}`,
  });

  s.open[channel.id] = { userId: user.id, number, reason, openedAt: Date.now() };
  db.save();

  await channel.send({
    content: `${user}`,
    allowedMentions: { users: [user.id] },
    embeds: [
      embed()
        .setTitle(`Ticket #${number}`)
        .setDescription('Thanks for opening a ticket! Staff will be with you shortly.')
        .addFields({ name: T.question, value: truncate(reason, 1024) }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pb:ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      ),
    ],
  });

  await interaction.editReply(`🎟️ Your ticket is open: ${channel}`);
}

/** How many open tickets this member has from this panel (cleaning up deleted channels). */
function openFromPanel(guild, userId, panelId) {
  const open = state(guild.id).open;
  const mine = [];
  for (const [channelId, ticket] of Object.entries(open)) {
    if (ticket.userId !== userId) continue;
    if (!guild.channels.cache.has(channelId)) {
      delete open[channelId];
      db.save();
      continue;
    }
    if (ticket.panelId === panelId) mine.push(channelId);
  }
  return mine;
}

// A ticket button (or dropdown choice) on a custom panel.
async function onPanelOpen(interaction, panel, index) {
  const item = panel.items[index];
  const mine = openFromPanel(interaction.guild, interaction.user.id, panel.id);
  if (mine.length >= Math.max(1, panel.maxOpen ?? 1)) {
    return interaction.reply(ephemeral(`You already have an open ticket: ${mine.map((id) => `<#${id}>`).join(', ')}`));
  }
  const questions = (item.questions ?? []).filter(Boolean).slice(0, panels.MAX_QUESTIONS);
  if (!questions.length) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return createTicket(interaction, panel, index, []);
  }
  const fields = questions.map((question, i) => ({ id: `q${i}`, label: question, long: true, required: i === 0, max: 1000 }));
  return interaction.showModal(form(`pb:pnl:${panel.id}:form:${index}`, item.label || 'Open a ticket', fields));
}

// The ticket form was filled in.
async function onPanelSubmit(interaction, panel, index) {
  const item = panel.items[index];
  if (!item) return interaction.reply(ephemeral('That ticket option was removed. Ask a moderator to update the panel.'));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const mine = openFromPanel(interaction.guild, interaction.user.id, panel.id);
  if (mine.length >= Math.max(1, panel.maxOpen ?? 1)) {
    return interaction.editReply(`You already have an open ticket: ${mine.map((id) => `<#${id}>`).join(', ')}`);
  }
  const questions = (item.questions ?? []).filter(Boolean).slice(0, panels.MAX_QUESTIONS);
  const answers = questions.map((question, i) => ({ question, answer: value(interaction, `q${i}`) ?? '' }));
  return createTicket(interaction, panel, index, answers);
}

/** Lowercase, dash-separated text Discord accepts in a channel name. */
function channelSlug(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function createTicket(interaction, panel, index, answers) {
  const { guild, user } = interaction;
  const item = panel.items[index];
  const T = ticketSettings(guild.id);
  const s = state(guild.id);
  s.counter += 1;
  const number = s.counter;
  const staffRoles = staffRolesFor(guild, item);
  const access = [
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks,
  ];
  const prefix = channelSlug((item.namePrefix || 'ticket').replaceAll('{username}', user.username)) || 'ticket';
  const reason = answers.map((a) => a.answer).find(Boolean) ?? '';

  const channel = await guild.channels.create({
    name: `${prefix}-${String(number).padStart(4, '0')}`.slice(0, 100),
    type: ChannelType.GuildText,
    parent: findCategory(guild, item.category || T.category)?.id ?? null,
    topic: truncate(`Ticket #${number} (${item.label || panel.name}) for ${user.tag}${reason ? `: ${reason}` : ''}`, 1024),
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: access },
      ...staffRoles.map((role) => ({ id: role.id, allow: [...access, PermissionFlagsBits.ManageMessages] })),
      { id: guild.members.me.id, allow: [...access, PermissionFlagsBits.ManageChannels] },
    ],
    reason: `Ticket opened by ${user.tag}`,
  });

  s.open[channel.id] = { userId: user.id, number, reason, answers, panelId: panel.id, optionIndex: index, openedAt: Date.now() };
  db.save();

  const card = embed()
    .setTitle(truncate(`${item.emoji ? `${item.emoji} ` : ''}${item.label || 'Ticket'} #${number}`, 256))
    .setDescription(truncate(fill(item.welcome || 'Thanks for opening a ticket! Staff will be with you shortly.', { user, guild }), 4096));
  for (const { question, answer } of answers.slice(0, 5)) card.addFields({ name: truncate(question, 256), value: truncate(answer || '—', 1024) });

  const pings = item.pingStaff ? staffRoles.map((role) => `${role}`) : [];
  await channel.send({
    content: [`${user}`, ...pings].join(' '),
    allowedMentions: { users: [user.id], roles: item.pingStaff ? staffRoles.map((role) => role.id) : [] },
    embeds: [card],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pb:ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      ),
    ],
  });

  await interaction.editReply(`🎟️ Your ticket is open: ${channel}`);
}

/** Plain-text transcript of a channel, oldest message first. */
async function buildTranscript(channel) {
  const all = [];
  let before;
  for (let page = 0; page < 10; page++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return all
    .map((message) => {
      const when = new Date(message.createdTimestamp).toISOString().replace('T', ' ').slice(0, 16);
      const extras = [
        ...message.attachments.map((file) => `[file: ${file.url}]`),
        ...message.embeds.map((card) => `[embed: ${card.title ?? card.description ?? ''}]`),
      ];
      return `[${when}] ${message.author.tag}: ${[message.content, ...extras].filter(Boolean).join(' ')}`;
    })
    .join('\n');
}

// Close button inside a ticket.
async function onClose(interaction) {
  const { guild, channel, member } = interaction;
  const T = ticketSettings(guild.id);
  const ticket = state(guild.id).open[channel.id];
  if (!ticket) return interaction.reply(ephemeral("This channel isn't an open ticket."));
  if (ticket.userId !== member.id && !isStaff(member, ticket)) {
    return interaction.reply(ephemeral('Only staff or the person who opened this ticket can close it.'));
  }

  await interaction.reply(`🔒 Closing this ticket. ${member} closed it.`);

  const transcript = await buildTranscript(channel).catch(() => '(The transcript could not be saved.)');
  const name = channel.name;
  const summary = embed(COLORS.warning)
    .setTitle(`Ticket #${ticket.number} closed`)
    .addFields(
      { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Closed by', value: `${member}`, inline: true },
      { name: 'Opened', value: `<t:${Math.floor(ticket.openedAt / 1000)}:f>`, inline: true },
    )
    .setTimestamp();
  const { panel, item } = optionFor(guild.id, ticket);
  if (item) summary.addFields({ name: 'Type', value: truncate(`${item.emoji ? `${item.emoji} ` : ''}${item.label || panel.name}`, 1024), inline: true });
  const answers = ticket.answers ?? [{ question: T.question, answer: ticket.reason || 'No reason given' }];
  for (const { question, answer } of answers.slice(0, 5)) summary.addFields({ name: truncate(question, 256), value: truncate(answer || '—', 1024) });

  const transcriptChannel = findChannel(guild, panel?.transcriptChannel || T.transcriptChannel);
  if (transcriptChannel) {
    await transcriptChannel
      .send({ embeds: [summary], files: [new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `${name}.txt` })] })
      .catch(() => sendLog(guild, summary));
  } else {
    await sendLog(guild, summary);
  }

  delete state(guild.id).open[channel.id];
  db.save();
  setTimeout(() => channel.delete(`Ticket closed by ${member.user.tag}`).catch(() => {}), 5000);
}

module.exports = { panelMessage, onOpen, onSubmit, onClose, onPanelOpen, onPanelSubmit, createTicket, buildTranscript, isStaff, state, channelSlug };
