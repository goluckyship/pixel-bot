const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const { ephemeral } = require('../../lib/ui');
const tickets = require('../../lib/tickets');
const rolebuttons = require('../../lib/rolebuttons');
const panels = require('../../lib/panels');
const { isEmoji } = require('../../lib/emoji');

const builder = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Post your custom panels, or a quick ticket/role panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('post')
      .setDescription('Post (or update) one of your custom panels from the dashboard')
      .addStringOption((option) => option.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true))
      .addChannelOption((option) =>
        option.setName('channel').setDescription('Where to post it (default: where it was posted before, or here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List your custom panels'))
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
    pnl: (interaction, panelId, what, index, page) => panels.onInteraction(interaction, panelId, what, index, page),
  },

  async autocomplete(interaction) {
    const typed = String(interaction.options.getFocused() ?? '').toLowerCase();
    const choices = panels
      .list(interaction.guildId)
      .filter((p) => !typed || p.name.toLowerCase().includes(typed) || String(p.id) === typed)
      .slice(0, 25)
      .map((p) => ({ name: `#${p.id} ${p.name} (${p.type})`.slice(0, 100), value: String(p.id) }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const kind = interaction.options.getSubcommand();

    if (kind === 'list') {
      const all = panels.list(interaction.guildId);
      if (!all.length) return interaction.reply(ephemeral('No custom panels yet. Make them in the web dashboard under **Panels**.'));
      const lines = all.map((p) => `**#${p.id} ${p.name}** · ${p.type}, ${p.items.length} ${p.type === 'roles' ? 'role' : 'option'}${p.items.length === 1 ? '' : 's'}${p.channelId ? ` · posted in <#${p.channelId}>` : ' · not posted'}`);
      return interaction.reply(ephemeral(lines.join('\n').slice(0, 2000)));
    }

    if (kind === 'post') {
      const raw = interaction.options.getString('panel').trim().replace(/^#/, '');
      const panel = panels.get(interaction.guildId, raw) ?? panels.list(interaction.guildId).find((p) => p.name.toLowerCase() === raw.toLowerCase());
      if (!panel) return interaction.reply(ephemeral("I couldn't find that panel. Use `/panel list` to see them."));
      const target = interaction.options.getChannel('channel') ?? (panel.channelId && interaction.guild.channels.cache.get(panel.channelId)) ?? interaction.channel;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await panels.post(interaction.guild, panel, target.id);
      return interaction.editReply(`${result.ok ? '✅' : '⚠️'} ${result.text}`);
    }

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
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
