const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../lib/ui');

const MAX_ROLES_SHOWN = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show details about a user')
    .addUserOption((option) => option.setName('user').setDescription('Who to look up (default: you)')),

  async execute(interaction) {
    const picked = interaction.options.getUser('user');
    const user = picked ?? interaction.user;
    // "member" is the user's profile inside this server. It's missing in DMs,
    // or if the user isn't in the server.
    const member = picked ? interaction.options.getMember('user') : interaction.inCachedGuild() ? interaction.member : null;

    const created = Math.floor(user.createdTimestamp / 1000);
    const card = embed()
      .setTitle(user.tag + (user.bot ? ' (bot)' : ''))
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields({ name: 'Joined Discord', value: `<t:${created}:D> (<t:${created}:R>)` });

    if (member?.joinedTimestamp) {
      const joined = Math.floor(member.joinedTimestamp / 1000);
      card.addFields({ name: 'Joined this server', value: `<t:${joined}:D> (<t:${joined}:R>)` });
    }

    if (member?.roles?.cache) {
      const roles = [...member.roles.cache.values()]
        .filter((role) => role.id !== interaction.guildId) // skip @everyone
        .sort((a, b) => b.position - a.position);
      if (roles.length > 0) {
        const shown = roles.slice(0, MAX_ROLES_SHOWN).map((role) => `<@&${role.id}>`).join(' ');
        const extra = roles.length > MAX_ROLES_SHOWN ? ` +${roles.length - MAX_ROLES_SHOWN} more` : '';
        card.addFields({ name: `Roles (${roles.length})`, value: shown + extra });
      }
    }

    card.setFooter({ text: `ID: ${user.id}` });
    await interaction.reply({ embeds: [card] });
  },
};
