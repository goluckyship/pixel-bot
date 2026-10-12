// Button role panels: members click a button to get or remove a role.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { embed, ephemeral } = require('./ui');

/** entries: [{ role, emoji }] (1 to 5). */
function panelMessage(title, entries) {
  const row = new ActionRowBuilder();
  for (const { role, emoji } of entries) {
    const button = new ButtonBuilder().setCustomId(`pb:role:${role.id}`).setLabel(role.name.slice(0, 80)).setStyle(ButtonStyle.Secondary);
    if (emoji) button.setEmoji(emoji);
    row.addComponents(button);
  }
  const lines = entries.map(({ role, emoji }) => `${emoji ? `${emoji} ` : ''}${role}`);
  return {
    embeds: [embed().setTitle(title).setDescription(`Click a button to get or remove a role.\n\n${lines.join('\n')}`)],
    components: [row],
  };
}

async function onClick(interaction, roleId) {
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return interaction.reply(ephemeral('That role no longer exists. Ask a moderator to update this panel.'));
  if (!role.editable) {
    return interaction.reply(ephemeral("I can't give out that role. A moderator needs to move my role above it."));
  }
  const member = interaction.member;
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, 'Role button');
    return interaction.reply(ephemeral(`Removed ${role}.`));
  }
  await member.roles.add(role, 'Role button');
  return interaction.reply(ephemeral(`Gave you ${role}.`));
}

module.exports = { panelMessage, onClick };
