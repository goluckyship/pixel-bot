// Send a message: write a message (plain or a styled card) in the dashboard and
// post it to any channel, as Pixel Bot.
const { PermissionFlagsBits } = require('discord.js');
const features = require('../lib/features');
const { embed, hexColor, truncate } = require('../lib/ui');
const { channelOptions } = require('../dashboard/fields');
const { select, textarea, input, toggle, colorInput } = require('../dashboard/html');

module.exports = {
  id: 'composer',
  emoji: '✉️',
  title: 'Send a message',
  group: 'automation',
  order: 40,
  help: 'Write a message here and Pixel Bot posts it, as itself, in any channel. Fill in a title or colour to send it as a styled card.',
  fields: [],
  status: (cfg, guild, ui) => {
    const last = features.data(guild.id, 'composer').lastAt;
    return last ? `Last sent ${new Date(last).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Post as Pixel Bot';
  },
  dashboard(ctx) {
    const { guild } = ctx;
    return ctx.form('send', `<label>Channel</label>${select('channel', channelOptions(guild, [0, 5]), '', { blank: '— pick a channel —' })}
<label>Message</label>${textarea('text', '', { placeholder: 'Hi everyone! 👋' })}
${ctx.more(`<div class="grid2"><div><label>Card title</label>${input('title', '')}</div>
<div><label>Card colour</label>${colorInput('color', '', { defaultText: 'No card colour' })}</div>
<div><label>Big image link</label>${input('image', '', { placeholder: 'https://…' })}</div>
<div><label>Footer</label>${input('footer', '')}</div></div>
${toggle('asCard', false, 'Send as a styled card')}
${toggle('everyone', false, 'Ping @everyone')}`, 'Make it a card, add an image or ping')}`, 'Send it');
  },
  actions: {
    async send({ guild, member, form }) {
      const channel = guild.channels.cache.get(String(form.channel ?? ''));
      if (!channel?.isTextBased?.()) return { ok: false, text: 'Pick a channel to send it to.' };
      const text = String(form.text ?? '').replace(/\r\n/g, '\n').trim();
      const title = String(form.title ?? '').trim();
      const image = String(form.image ?? '').trim();
      const footer = String(form.footer ?? '').trim();
      const color = form.color_default ? null : hexColor(form.color);
      if (!text && !title && !image) return { ok: false, text: 'Write something to send.' };
      if (image && !/^https:\/\/\S+$/i.test(image)) return { ok: false, text: 'The image link must start with https://' };
      const perms = channel.permissionsFor(guild.members.me);
      if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return { ok: false, text: `I can't post in #${channel.name}.` };
      const canPingAll = form.everyone && (member.permissions.has(PermissionFlagsBits.MentionEveryone) || guild.ownerId === member.id);
      const asCard = Boolean(form.asCard || title || image || footer || color !== null);
      const body = { allowedMentions: { parse: canPingAll ? ['everyone', 'users', 'roles'] : ['users'] } };
      if (asCard) {
        const card = embed(color ?? undefined);
        if (title) card.setTitle(truncate(title, 256));
        if (text) card.setDescription(truncate(text, 4096));
        if (image) card.setImage(image);
        if (footer) card.setFooter({ text: truncate(footer, 2048) });
        body.embeds = [card];
        if (canPingAll) body.content = '@everyone';
      } else {
        body.content = truncate(`${canPingAll ? '@everyone ' : ''}${text}`, 2000);
      }
      await channel.send(body);
      features.data(guild.id, 'composer').lastAt = Date.now();
      return { ok: true, text: `Sent in #${channel.name}.` };
    },
  },
};
