const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const crypto = require('node:crypto');
const { ephemeral, embed, truncate } = require('../../lib/ui');
const { form, value } = require('../../lib/forms');
const { parseWhen } = require('../../lib/when');
const schedules = require('../../lib/schedules');
const settings = require('../../lib/settings');

// Between the command and the form being submitted: nonce -> details (expires after 15 minutes).
const pending = new Map();

module.exports = {
  pending,
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Post messages at a set time, once or on repeat')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Schedule a message')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Where to post it').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option.setName('when').setDescription('Like "in 2h", "6:30pm", "tomorrow 9am" or "10/31 7pm" (Chicago time)').setRequired(true).setMaxLength(40),
        )
        .addStringOption((option) =>
          option
            .setName('repeat')
            .setDescription('Post it again every day or week (default: once)')
            .addChoices({ name: 'Once', value: 'none' }, { name: 'Every day', value: 'daily' }, { name: 'Every week', value: 'weekly' }),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('See scheduled messages'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Cancel a scheduled message')
        .addIntegerOption((option) => option.setName('number').setDescription('The number from /schedule list').setRequired(true).setMinValue(1)),
    ),

  components: {
    schedule: async (interaction, nonce) => {
      const draft = pending.get(nonce);
      pending.delete(nonce);
      if (!draft || draft.userId !== interaction.user.id || Date.now() > draft.expires) {
        return interaction.reply(ephemeral('That form expired. Run `/schedule add` again.'));
      }
      const message = value(interaction, 'message');
      const saved = schedules.add(interaction.guildId, {
        channelId: draft.channelId,
        nextAt: draft.nextAt,
        repeat: draft.repeat,
        title: value(interaction, 'title'),
        message,
        allowEveryone: draft.allowEveryone,
        createdBy: interaction.user.id,
      });
      if (!saved) return interaction.reply(ephemeral(`You already have ${schedules.MAX_PER_SERVER} scheduled messages. Remove some first.`));
      const when = Math.floor(saved.nextAt / 1000);
      const repeatText = { none: '', daily: ', then every day', weekly: ', then every week' }[saved.repeat];
      return interaction.reply(ephemeral(`🗓️ Scheduled #${saved.id} for <t:${when}:F> (<t:${when}:R>)${repeatText} in <#${saved.channelId}>.`));
    },
  },

  async execute(interaction) {
    const action = interaction.options.getSubcommand();

    if (action === 'list') {
      const items = schedules.list(interaction.guildId);
      if (items.length === 0) return interaction.reply(ephemeral('Nothing is scheduled. Add something with `/schedule add`.'));
      const lines = items
        .slice()
        .sort((a, b) => a.nextAt - b.nextAt)
        .map((item) => `**#${item.id}** · <t:${Math.floor(item.nextAt / 1000)}:f> · <#${item.channelId}>${item.repeat !== 'none' ? ` · repeats ${item.repeat}` : ''}\n${truncate(item.title ?? item.message, 120)}`);
      return interaction.reply({ embeds: [embed().setTitle('Scheduled messages').setDescription(truncate(lines.join('\n\n'), 4000))], flags: MessageFlags.Ephemeral });
    }

    if (action === 'remove') {
      const number = interaction.options.getInteger('number');
      return interaction.reply(ephemeral(schedules.remove(interaction.guildId, number) ? `🗑️ Cancelled scheduled message #${number}.` : `There's no scheduled message #${number}.`));
    }

    const channel = interaction.options.getChannel('channel');
    const nextAt = parseWhen(interaction.options.getString('when'), settings.get(interaction.guildId).timezone);
    if (!nextAt) {
      return interaction.reply(ephemeral('I didn\'t understand that time. Try `in 2h`, `6:30pm`, `tomorrow 9am` or `10/31 7pm`. Times are Chicago time.'));
    }
    if (nextAt - Date.now() > 366 * 86_400_000) return interaction.reply(ephemeral('That\'s more than a year away.'));
    if (!channel.permissionsFor(interaction.guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply(ephemeral(`I can't post in ${channel}. Give my role access there first.`));
    }

    const nonce = crypto.randomBytes(8).toString('hex');
    pending.set(nonce, {
      userId: interaction.user.id,
      channelId: channel.id,
      nextAt,
      repeat: interaction.options.getString('repeat') ?? 'none',
      allowEveryone: interaction.member.permissions.has(PermissionFlagsBits.MentionEveryone),
      expires: Date.now() + 15 * 60_000,
    });
    for (const [key, draft] of pending) if (Date.now() > draft.expires) pending.delete(key);

    await interaction.showModal(
      form(`pb:schedule:${nonce}`, 'Scheduled message', [
        { id: 'title', label: 'Title (optional, makes it a styled message)', max: 256 },
        { id: 'message', label: 'Message', long: true, required: true, max: 2000 },
      ]),
    );
  },
};
