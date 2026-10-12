const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const tickets = require('../../lib/tickets');
const rolebuttons = require('../../lib/rolebuttons');

/** A normal emoji like 🔴, or a server emoji like <:pixel:123...>. */
function isEmoji(text) {
  return /^<a?:\w{2,32}:\d{17,20}>$/.test(text) || (/^[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3#*0-9\p{Emoji_Modifier}]+$/u.test(text) && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text));
}

const builder = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Post a ticket panel or a role button panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('tickets')
      .setDescription('Post the "Create ticket" panel')
      .addChannelOption((option) =>
        option.setName('channel').setDescription('Where to post it (default: here)').addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand((sub) => {
    sub
      .setName('roles')
      .setDescription('Post buttons members click to get or remove roles')
      .addRoleOption((option) => option.setName('role1').setDescription('First role').setRequired(true))
      .addStringOption((option) => option.setName('emoji1').setDescription('Emoji for the first role').setMaxLength(64));
    for (let n = 2; n <= 5; n++) {
      sub
        .addRoleOption((option) => option.setName(`role${n}`).setDescription(`Role ${n}`))
        .addStringOption((option) => option.setName(`emoji${n}`).setDescription(`Emoji for role ${n}`).setMaxLength(64));
    }
    return sub
      .addStringOption((option) => option.setName('title').setDescription('Panel title (default: Roles)').setMaxLength(100))
      .addChannelOption((option) =>
        option.setName('channel').setDescription('Where to post it (default: here)').addChannelTypes(ChannelType.GuildText),
      );
  });

module.exports = {
  isEmoji,
  data: builder,
  components: {
    ticket: (interaction, action) => {
      if (action === 'open') return tickets.onOpen(interaction);
      if (action === 'submit') return tickets.onSubmit(interaction);
      if (action === 'close') return tickets.onClose(interaction);
      return null;
    },
    role: (interaction, roleId) => rolebuttons.onClick(interaction, roleId),
  },

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const kind = interaction.options.getSubcommand();
    let message;

    if (kind === 'tickets') {
      message = tickets.panelMessage(interaction.guildId);
    } else {
      const entries = [];
      for (let n = 1; n <= 5; n++) {
        const role = interaction.options.getRole(`role${n}`);
        if (!role) continue;
        if (role.managed || role.id === interaction.guildId) {
          return interaction.reply(ephemeral(`${role} can't be handed out with a button.`));
        }
        if (!role.editable) {
          return interaction.reply(ephemeral(`I can't give out ${role}. Drag my role above it in Server Settings → Roles first.`));
        }
        if (entries.some((entry) => entry.role.id === role.id)) continue;
        const emoji = interaction.options.getString(`emoji${n}`)?.trim() || null;
        if (emoji && !isEmoji(emoji)) {
          return interaction.reply(ephemeral(`\`${emoji}\` isn't an emoji. Use a normal emoji like 🔴, or a server emoji.`));
        }
        entries.push({ role, emoji });
      }
      message = rolebuttons.panelMessage(interaction.options.getString('title') ?? 'Roles', entries);
    }

    await channel.send(message);
    await interaction.reply({ content: `✅ Panel posted in ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
