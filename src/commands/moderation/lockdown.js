const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const { ephemeral, embed, COLORS } = require('../../lib/ui');
const lockdown = require('../../lib/lockdown');
const { sendLog, logEntry } = require('../../lib/log');

function scopeOptions(builder, verb) {
  return builder
    .addStringOption((option) =>
      option
        .setName('scope')
        .setDescription(`${verb} one channel or the whole server (default: this channel)`)
        .addChoices({ name: 'This channel', value: 'channel' }, { name: 'Whole server', value: 'server' }),
    )
    .addChannelOption((option) =>
      option.setName('channel').setDescription('A different channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
    );
}

async function run(interaction, locking) {
  const scope = interaction.options.getString('scope') ?? 'channel';
  const reason = interaction.options.getString('reason') ?? (locking ? 'Lockdown' : 'Lockdown lifted');
  const auditReason = `${reason} (by ${interaction.user.tag})`;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targets = scope === 'server'
    ? (locking ? lockdown.lockableChannels(interaction.guild) : Object.keys(lockdown.state(interaction.guildId)).map((id) => interaction.guild.channels.cache.get(id)).filter(Boolean))
    : [interaction.options.getChannel('channel') ?? interaction.channel];

  let changed = 0;
  const failed = [];
  for (const channel of targets) {
    try {
      if (locking && channel.isTextBased?.()) {
        if (!lockdown.isLocked(channel)) await channel.send({ embeds: [embed(COLORS.danger).setDescription(`🔒 **This channel is locked.** ${reason}`)] }).catch(() => {});
      }
      const done = locking ? await lockdown.lock(channel, auditReason) : await lockdown.unlock(channel, auditReason);
      if (done) {
        changed += 1;
        if (!locking && channel.isTextBased?.()) await channel.send({ embeds: [embed(COLORS.success).setDescription('🔓 **This channel is unlocked.**')] }).catch(() => {});
      }
    } catch {
      failed.push(`${channel}`);
    }
  }

  // Drop records for channels that were deleted while locked.
  if (!locking && scope === 'server') {
    for (const id of Object.keys(lockdown.state(interaction.guildId))) if (!interaction.guild.channels.cache.has(id)) delete lockdown.state(interaction.guildId)[id];
  }

  const what = scope === 'server' ? `${changed} channel(s)` : `${targets[0]}`;
  await sendLog(interaction.guild, logEntry({
    color: locking ? COLORS.danger : COLORS.success, user: interaction.user,
    description: `${locking ? '🔒' : '🔓'} ${interaction.user} ${locking ? 'locked' : 'unlocked'} ${what}\n**Reason:** ${reason}`,
  }));

  const nothing = locking ? 'Already locked.' : "Nothing was locked.";
  let reply = changed ? `${locking ? '🔒 Locked' : '🔓 Unlocked'} ${what}.` : nothing;
  if (locking && changed) reply += ' The Staff role can still talk. Use `/unlock` to undo it.';
  if (failed.length) reply += `\nCouldn't change: ${failed.join(', ')}. My role may be missing Manage Channels there.`;
  await interaction.editReply(reply);
}

module.exports = {
  run,
  data: scopeOptions(
    new SlashCommandBuilder()
      .setName('lockdown')
      .setDescription('Stop regular members from sending messages (for raids or emergencies)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setContexts(InteractionContextType.Guild),
    'Lock',
  ).addStringOption((option) => option.setName('reason').setDescription('Shown in the channel and the log').setMaxLength(300)),

  execute: (interaction) => run(interaction, true),
};
