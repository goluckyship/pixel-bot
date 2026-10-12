const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const { run } = require('./lockdown');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Undo a lockdown and put the permissions back exactly as they were')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName('scope')
        .setDescription('Unlock one channel or everything locked (default: this channel)')
        .addChoices({ name: 'This channel', value: 'channel' }, { name: 'Whole server', value: 'server' }),
    )
    .addChannelOption((option) =>
      option.setName('channel').setDescription('A different channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
    ),

  execute: (interaction) => run(interaction, false),
};
