// Ticket system: a panel with a button, a form, a private channel per ticket,
// and a transcript when it's closed. Settings come from lib/settings.js.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const settings = require('./settings');
const db = require('./storage');
const { findRoles, findCategory, findChannel } = require('./resolve');
const { embed, ephemeral, truncate, COLORS } = require('./ui');
const { sendLog, logEntry } = require('./log');

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

function isStaff(member) {
  const T = ticketSettings(member.guild.id);
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  return findRoles(member.guild, T.staffRoles).some((role) => member.roles.cache.has(role.id));
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

// Button on the panel: show the form.
async function onOpen(interaction) {
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
  if (ticket.userId !== member.id && !isStaff(member)) {
    return interaction.reply(ephemeral('Only staff or the person who opened this ticket can close it.'));
  }

  await interaction.reply(`🔒 Closing this ticket. ${member} closed it.`);

  const transcript = await buildTranscript(channel).catch(() => '(The transcript could not be saved.)');
  const name = `ticket-${String(ticket.number).padStart(4, '0')}`;
  const summary = embed(COLORS.warning)
    .setTitle(`Ticket #${ticket.number} closed`)
    .addFields(
      { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Closed by', value: `${member}`, inline: true },
      { name: 'Opened', value: `<t:${Math.floor(ticket.openedAt / 1000)}:f>`, inline: true },
      { name: T.question, value: truncate(ticket.reason || 'No reason given', 1024) },
    )
    .setTimestamp();

  const transcriptChannel = findChannel(guild, T.transcriptChannel);
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

module.exports = { panelMessage, onOpen, onSubmit, onClose, buildTranscript, isStaff, state };
