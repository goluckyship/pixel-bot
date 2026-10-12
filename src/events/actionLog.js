// The staff log: posts what happens in the server to the log channel,
// matching what the old Dyno action log recorded.
const { Events } = require('discord.js');
const { sendLog, logEntry, logChannel } = require('../lib/log');
const { truncate, COLORS } = require('../lib/ui');

const isLogChannel = (channel) => channel && logChannel(channel.guild)?.id === channel.id;

module.exports = [
  {
    name: Events.MessageDelete,
    async execute(message) {
      if (!message.guild || message.partial || message.author?.bot || isLogChannel(message.channel)) return;
      const files = [...message.attachments.values()].map((file) => file.name);
      const text = [
        `**Message sent by ${message.author} deleted in ${message.channel}**`,
        message.content ? truncate(message.content, 3000) : null,
        files.length ? `**Attachments:** ${files.join(', ')}` : null,
      ].filter(Boolean);
      await sendLog(message.guild, logEntry({
        color: COLORS.danger, user: message.author, description: text.join('\n'),
        footer: `Author: ${message.author.id} | Message ID: ${message.id}`,
      }));
    },
  },
  {
    name: Events.MessageUpdate,
    async execute(before, after) {
      if (!after.guild || before.partial || after.author?.bot || isLogChannel(after.channel)) return;
      if (before.content == null || before.content === after.content) return;
      await sendLog(after.guild, logEntry({
        color: COLORS.warning, user: after.author,
        description: `**Message edited in ${after.channel}** [Jump to message](${after.url})\n` +
          `**Before:** ${truncate(before.content || '*empty*', 1500)}\n**After:** ${truncate(after.content || '*empty*', 1500)}`,
        footer: `User ID: ${after.author.id}`,
      }));
    },
  },
  {
    name: Events.MessageBulkDelete,
    async execute(messages, channel) {
      if (!channel.guild || isLogChannel(channel)) return;
      await sendLog(channel.guild, logEntry({
        color: COLORS.danger, description: `**${messages.size} messages were deleted in ${channel}**`,
      }));
    },
  },
  {
    name: Events.GuildMemberUpdate,
    async execute(before, after) {
      if (before.partial) return;
      const added = after.roles.cache.filter((role) => !before.roles.cache.has(role.id));
      const removed = before.roles.cache.filter((role) => !after.roles.cache.has(role.id));
      for (const role of added.values()) {
        await sendLog(after.guild, logEntry({
          color: COLORS.success, user: after.user, description: `${after} was given the \`${role.name}\` role`, footer: `ID: ${after.id}`,
        }));
      }
      for (const role of removed.values()) {
        await sendLog(after.guild, logEntry({
          color: COLORS.warning, user: after.user, description: `${after} was removed from the \`${role.name}\` role`, footer: `ID: ${after.id}`,
        }));
      }
      const wasOut = before.communicationDisabledUntilTimestamp ?? 0;
      const isOut = after.communicationDisabledUntilTimestamp ?? 0;
      if (isOut > Date.now() && isOut !== wasOut) {
        await sendLog(after.guild, logEntry({
          color: COLORS.warning, user: after.user, description: `🔇 ${after} was timed out until <t:${Math.floor(isOut / 1000)}:f>`, footer: `ID: ${after.id}`,
        }));
      } else if (wasOut > Date.now() && !isOut) {
        await sendLog(after.guild, logEntry({
          color: COLORS.success, user: after.user, description: `🔊 ${after}'s timeout was removed`, footer: `ID: ${after.id}`,
        }));
      }
    },
  },
  {
    name: Events.GuildBanAdd,
    async execute(ban) {
      await sendLog(ban.guild, logEntry({
        color: COLORS.danger, user: ban.user, description: `🔨 **${ban.user.tag}** was banned${ban.reason ? `\n**Reason:** ${ban.reason}` : ''}`, footer: `ID: ${ban.user.id}`,
      }));
    },
  },
  {
    name: Events.GuildBanRemove,
    async execute(ban) {
      await sendLog(ban.guild, logEntry({
        color: COLORS.success, user: ban.user, description: `✅ **${ban.user.tag}** was unbanned`, footer: `ID: ${ban.user.id}`,
      }));
    },
  },
  {
    name: Events.GuildRoleCreate,
    async execute(role) {
      await sendLog(role.guild, logEntry({ color: COLORS.success, description: `**Role created:** ${role.name}`, footer: `ID: ${role.id}` }));
    },
  },
  {
    name: Events.GuildRoleDelete,
    async execute(role) {
      await sendLog(role.guild, logEntry({ color: COLORS.danger, description: `**Role deleted:** ${role.name}`, footer: `ID: ${role.id}` }));
    },
  },
  {
    name: Events.GuildRoleUpdate,
    async execute(before, after) {
      const changes = [];
      if (before.name !== after.name) changes.push(`Name: ${before.name} > ${after.name}`);
      if (before.hexColor !== after.hexColor) changes.push(`Color: ${before.hexColor} > ${after.hexColor}`);
      if (before.hoist !== after.hoist) changes.push(`Shown separately: ${before.hoist} > ${after.hoist}`);
      if (before.mentionable !== after.mentionable) changes.push(`Mentionable: ${before.mentionable} > ${after.mentionable}`);
      if (before.permissions.bitfield !== after.permissions.bitfield) changes.push('Permissions changed');
      if (changes.length === 0) return; // only moved in the list
      await sendLog(after.guild, logEntry({
        color: COLORS.warning, description: `**Role ${after.name} changed**\n${changes.join('\n')}`, footer: `ID: ${after.id}`,
      }));
    },
  },
  {
    name: Events.ChannelCreate,
    async execute(channel) {
      if (!channel.guild) return;
      await sendLog(channel.guild, logEntry({ color: COLORS.success, description: `**Channel created:** ${channel}`, footer: `ID: ${channel.id}` }));
    },
  },
  {
    name: Events.ChannelDelete,
    async execute(channel) {
      if (!channel.guild) return;
      await sendLog(channel.guild, logEntry({ color: COLORS.danger, description: `**Channel deleted:** #${channel.name}`, footer: `ID: ${channel.id}` }));
    },
  },
  {
    name: Events.ChannelUpdate,
    async execute(before, after) {
      if (!after.guild) return;
      const changes = [];
      if (before.name !== after.name) changes.push(`Name: ${before.name} > ${after.name}`);
      if ((before.topic ?? '') !== (after.topic ?? '')) changes.push(`Topic: ${truncate(before.topic || 'none', 300)} > ${truncate(after.topic || 'none', 300)}`);
      if (before.parentId !== after.parentId) changes.push('Moved to a different category');
      if (before.nsfw !== after.nsfw) changes.push(`Age-restricted: ${before.nsfw} > ${after.nsfw}`);
      if ((before.rateLimitPerUser ?? 0) !== (after.rateLimitPerUser ?? 0)) changes.push(`Slowmode: ${before.rateLimitPerUser ?? 0}s > ${after.rateLimitPerUser ?? 0}s`);
      if (changes.length === 0) return; // only reordered or permissions tweaked
      await sendLog(after.guild, logEntry({ color: COLORS.warning, description: `**Channel ${after} changed**\n${changes.join('\n')}`, footer: `ID: ${after.id}` }));
    },
  },
  {
    name: Events.GuildEmojiCreate,
    async execute(emoji) {
      await sendLog(emoji.guild, logEntry({ color: COLORS.success, description: `**Emoji added:** ${emoji} \`:${emoji.name}:\``, footer: `ID: ${emoji.id}` }));
    },
  },
  {
    name: Events.GuildEmojiDelete,
    async execute(emoji) {
      await sendLog(emoji.guild, logEntry({ color: COLORS.danger, description: `**Emoji deleted:** \`:${emoji.name}:\``, footer: `ID: ${emoji.id}` }));
    },
  },
  {
    name: Events.GuildEmojiUpdate,
    async execute(before, after) {
      if (before.name === after.name) return;
      await sendLog(after.guild, logEntry({ color: COLORS.warning, description: `**Emoji renamed:** ${after} \`:${before.name}:\` > \`:${after.name}:\``, footer: `ID: ${after.id}` }));
    },
  },
  {
    name: Events.VoiceStateUpdate,
    async execute(before, after) {
      if (!before.channelId || !after.channelId || before.channelId === after.channelId) return; // only moves
      const member = after.member;
      if (!member || member.user.bot) return;
      await sendLog(after.guild, logEntry({
        color: COLORS.brand, user: member.user,
        description: `${member} switched voice channels <#${before.channelId}> -> <#${after.channelId}>`, footer: `ID: ${member.id}`,
      }));
    },
  },
];

