// Verification: new members click a button (after reading the rules) to get access.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const features = require('../lib/features');
const db = require('../lib/storage');
const panels = require('../lib/panels');
const { embed, ephemeral, hexColor, truncate } = require('../lib/ui');

function message(guild) {
  const cfg = features.config(guild.id, 'verification');
  const card = embed(hexColor(cfg.color) ?? undefined).setTitle(truncate(cfg.title || '✅ Verify', 256)).setDescription(truncate(cfg.text || 'Read the rules, then click the button to get access to the server.', 4096));
  const button = new ButtonBuilder().setCustomId('pb:verify:go').setLabel(truncate(cfg.button || 'I agree, let me in', 80)).setStyle((panels.STYLES[cfg.style] ?? panels.STYLES.green).value);
  if (cfg.emoji) button.setEmoji(cfg.emoji);
  return { embeds: [card], components: [new ActionRowBuilder().addComponents(button)] };
}

async function onButton(interaction) {
  if (!features.isOn(interaction.guildId, 'verification')) return interaction.reply(ephemeral('Verification is switched off right now.'));
  const cfg = features.config(interaction.guildId, 'verification');
  const role = interaction.guild.roles.cache.get(cfg.role);
  if (!role) return interaction.reply(ephemeral('Verification isn\'t set up yet. Let a staff member know.'));
  const member = interaction.member;
  if (member.roles.cache.has(role.id)) return interaction.reply(ephemeral('You\'re already verified! 💜'));
  const minAge = Number(cfg.minAgeDays ?? 0);
  if (minAge > 0 && Date.now() - (interaction.user.createdTimestamp ?? 0) < minAge * 86_400_000) {
    return interaction.reply(ephemeral(`Your Discord account needs to be at least ${minAge} day${minAge === 1 ? '' : 's'} old to verify here. Try again later!`));
  }
  if (!role.editable) return interaction.reply(ephemeral('I can\'t give out the verified role. A manager needs to move my role above it.'));
  await member.roles.add(role, 'Verified');
  const remove = interaction.guild.roles.cache.get(cfg.removeRole);
  if (remove?.editable && member.roles.cache.has(remove.id)) await member.roles.remove(remove, 'Verified').catch(() => {});
  return interaction.reply(ephemeral(cfg.done || '✅ You\'re verified. Welcome in!'));
}

module.exports = {
  id: 'verification',
  emoji: '✅',
  title: 'Verification',
  group: 'safety',
  order: 60,
  help: 'New members click a button to get your member role, which keeps bots and raiders out of your channels. Set your channels so only that role can see them, then post the button in your rules or verify channel.',
  fields: [
    { key: 'enabled', type: 'toggle', label: 'Turn verification on', default: false },
    { key: 'role', type: 'role', label: 'Role to give when they verify', blank: '— pick a role —' },
    { key: 'channel', type: 'channel', label: 'Channel to post the button in', blank: '— pick a channel —' },
    { key: 'text', type: 'textarea', label: 'Message', default: 'Read the rules, then click the button to get access to the server.' },
    { key: 'title', type: 'text', label: 'Title', default: '✅ Verify', more: true },
    { key: 'button', type: 'text', label: 'Button text', default: 'I agree, let me in', more: true },
    { key: 'emoji', type: 'emoji', label: 'Button emoji', default: '', more: true },
    { key: 'style', type: 'select', label: 'Button colour', options: { green: 'Green', blurple: 'Blurple', grey: 'Grey', red: 'Red' }, default: 'green', more: true },
    { key: 'removeRole', type: 'role', label: 'Take this role away when they verify (like "Unverified")', more: true },
    { key: 'minAgeDays', type: 'number', label: 'Accounts must be at least this many days old (0 = any)', default: 0, min: 0, more: true },
    { key: 'done', type: 'text', label: 'Message after verifying', default: '✅ You\'re verified. Welcome in!', more: true },
    { key: 'color', type: 'color', label: 'Card colour', more: true },
  ],
  validate: (v) => (v.enabled && !v.role ? 'Pick the role members get when they verify.' : null),
  status(cfg, guild, ui) {
    if (!cfg.role) return ui.off('Pick a role');
    const posted = features.data(guild.id, 'verification').messageId;
    return ui.on(`Gives ${guild.roles.cache.get(cfg.role)?.name ?? 'a role'}${posted ? '' : ', button not posted yet'}`);
  },
  dashboard: (ctx) => ctx.form('post', '<p class="help">Save first, then post (or re-post) the button in the channel you picked.</p>', 'Post the verify button'),
  dashboardFirst: false,
  actions: {
    async post({ guild, cfg }) {
      const channel = guild.channels.cache.get(cfg.channel);
      if (!channel) return { ok: false, text: 'Pick a channel and press Save first.' };
      if (!cfg.role) return { ok: false, text: 'Pick a role and press Save first.' };
      const st = features.data(guild.id, 'verification');
      const old = st.messageId && st.channelId === channel.id ? await channel.messages.fetch(st.messageId).catch(() => null) : null;
      if (old) await old.edit(message(guild));
      else {
        const sent = await channel.send(message(guild));
        Object.assign(st, { messageId: sent.id, channelId: channel.id });
        db.save();
      }
      return { ok: true, text: `${old ? 'Updated' : 'Posted'} the verify button in #${channel.name}.` };
    },
  },
  components: { verify: onButton },
};
