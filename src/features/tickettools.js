// Ticket tools: claim a ticket, add or remove people, rename it.
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, ButtonBuilder, ButtonStyle } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const tickets = require('../lib/tickets');
const { ephemeral } = require('../lib/ui');

const ACCESS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];

function ticketHere(interaction) {
  return tickets.state(interaction.guildId).open[interaction.channelId] ?? null;
}

async function claim(interaction) {
  const ticket = ticketHere(interaction);
  if (!ticket) return interaction.reply(ephemeral('This isn\'t an open ticket.'));
  if (!tickets.isStaff(interaction.member, ticket)) return interaction.reply(ephemeral('Only staff can claim tickets.'));
  if (ticket.claimedBy) {
    if (ticket.claimedBy === interaction.user.id) return interaction.reply(ephemeral('You\'ve already claimed this one.'));
    return interaction.reply(ephemeral(`<@${ticket.claimedBy}> already claimed this ticket.`));
  }
  ticket.claimedBy = interaction.user.id;
  db.save();
  return interaction.reply({ content: `🙋 ${interaction.user} has claimed this ticket and will help you.`, allowedMentions: { parse: [] } });
}

const ticket = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Tools for the ticket you\'re in')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('claim').setDescription('Take charge of this ticket'))
    .addSubcommand((s) => s.setName('add').setDescription('Bring someone into this ticket').addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Take someone out of this ticket').addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('rename').setDescription('Rename this ticket').addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(90))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'claim') return claim(interaction);
    const t = ticketHere(interaction);
    if (!t) return interaction.reply(ephemeral('Use this inside an open ticket.'));
    if (!tickets.isStaff(interaction.member, t)) return interaction.reply(ephemeral('Only staff can do that.'));
    if (sub === 'rename') {
      const name = tickets.channelSlug(interaction.options.getString('name')).slice(0, 100) || 'ticket';
      await interaction.channel.setName(name, `Renamed by ${interaction.user.tag}`);
      return interaction.reply({ content: `✏️ Renamed to **${name}**.` });
    }
    const user = interaction.options.getUser?.('member') ?? interaction.options.getMember('member')?.user;
    if (!user) return interaction.reply(ephemeral('Pick someone in this server.'));
    if (sub === 'add') {
      await interaction.channel.permissionOverwrites.edit(user.id, Object.fromEntries(ACCESS.map((p) => [permName(p), true])), { reason: `Added to ticket by ${interaction.user.tag}` });
      return interaction.reply({ content: `➕ Added <@${user.id}> to this ticket.`, allowedMentions: { users: [user.id] } });
    }
    if (user.id === t.userId) return interaction.reply(ephemeral('You can\'t remove the person who opened the ticket. Close it instead.'));
    await interaction.channel.permissionOverwrites.delete(user.id, `Removed from ticket by ${interaction.user.tag}`);
    return interaction.reply({ content: `➖ Removed <@${user.id}> from this ticket.`, allowedMentions: { parse: [] } });
  },
};

/** permissionOverwrites.edit wants names like ViewChannel, not numbers. */
function permName(bit) {
  return Object.keys(PermissionFlagsBits).find((k) => PermissionFlagsBits[k] === bit);
}

/** A Claim button to sit next to Close in new tickets (when switched on). */
function claimButton(guildId) {
  if (!features.isOn(guildId, 'tickettools') || features.config(guildId, 'tickettools').claimButton === false) return null;
  return new ButtonBuilder().setCustomId('pb:tkt:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Secondary);
}

module.exports = {
  id: 'tickettools',
  emoji: '🧰',
  title: 'Ticket tools',
  group: 'safety',
  order: 65,
  help: 'Inside a ticket, staff can use /ticket claim, /ticket add @someone, /ticket remove @someone and /ticket rename.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn ticket tools on', default: true },
    { key: 'claimButton', type: 'toggle', label: 'Put a Claim button in new tickets', default: true },
  ],
  status: (cfg, guild, ui) => ui.on(cfg.claimButton === false ? 'Commands only' : 'Claim button + commands'),
  commands: [ticket],
  components: { tkt: (interaction) => claim(interaction) },
  claimButton,
};
