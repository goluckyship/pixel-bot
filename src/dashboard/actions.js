// Applies the dashboard's forms. Every role and channel ID is checked against
// the server before it's saved.
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/storage');
const settings = require('../lib/settings');
const automod = require('../lib/automod');
const schedules = require('../lib/schedules');
const { parseWhen } = require('../lib/when');
const panels = require('../lib/panels');
const customCommands = require('../lib/customcommands');
const appearance = require('../lib/appearance');
const { resolveEmoji } = require('../lib/emoji');
const { hexColor } = require('../lib/ui');

const asList = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const text = (value, max) => String(Array.isArray(value) ? value[0] : value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

function validRoles(guild, ids) {
  return [...new Set(asList(ids))].filter((id) => /^\d+$/.test(id) && id !== guild.id && guild.roles.cache.get(id) && !guild.roles.cache.get(id).managed);
}
function validChannel(guild, id, types = [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
  const channel = guild.channels.cache.get(text(id, 30));
  return channel && types.includes(channel.type) ? channel.id : null;
}

const isLink = (value) => !value || /^https:\/\/\S+$/i.test(value);

/** Checks a colour box: empty is fine, otherwise it must look like #7c5cff. */
function colorField(value, what) {
  const t = text(value, 7);
  if (!t) return { value: '' };
  if (hexColor(t) === null) return { error: `${what} colour should look like #7c5cff.` };
  return { value: t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase()}` };
}

/** Returns { ok, text, redirect? } describing what happened. */
async function apply(guild, member, sectionId, form) {
  const g = db.guild(guild.id);
  switch (sectionId) {
    case 'welcome': {
      if (!form.enabled) {
        g.welcome = null;
        db.save();
        return { ok: true, text: 'Welcome messages are off.' };
      }
      const channelId = validChannel(guild, form.channel);
      if (!channelId) return { ok: false, text: 'Pick a channel for welcome messages.' };
      const message = text(form.message, 2000);
      const color = colorField(form.color, 'The welcome');
      const image = text(form.image, 500);
      if (color.error) return { ok: false, text: color.error };
      if (!isLink(image)) return { ok: false, text: 'The image link must start with https://' };
      if (!message && form.plain) return { ok: false, text: 'A plain-text welcome needs a message.' };
      g.welcome = {
        channelId, message, plain: Boolean(form.plain), title: text(form.title, 256), color: color.value, image,
        footer: text(form.footer, 2048), showAvatar: Boolean(form.showAvatar), ping: Boolean(form.ping),
      };
      g.welcomeDm = text(form.dm, 2000) || null;
      g.welcomeSeeded = true;
      db.save();
      return { ok: true, text: 'Welcome message saved.' };
    }
    case 'goodbye': {
      if (!form.enabled) {
        g.goodbye = null;
        db.save();
        return { ok: true, text: 'Goodbye messages are off.' };
      }
      const channelId = validChannel(guild, form.channel);
      if (!channelId) return { ok: false, text: 'Pick a channel for goodbye messages.' };
      const color = colorField(form.color, 'The goodbye');
      if (color.error) return { ok: false, text: color.error };
      g.goodbye = { channelId, message: text(form.message, 2000), plain: Boolean(form.plain), color: color.value };
      db.save();
      return { ok: true, text: 'Goodbye message saved.' };
    }
    case 'appearance': {
      const changes = [];
      const nickname = text(form.nickname, 32);
      if (nickname !== (guild.members.me.nickname ?? '')) {
        try {
          await guild.members.me.setNickname(nickname || null, `Dashboard: ${member.user.username}`);
          changes.push('nickname');
        } catch {
          return { ok: false, text: 'I couldn\'t change my nickname. I need the Change Nickname permission.' };
        }
      }
      if (guild.ownerId === member.id && form.status !== undefined) {
        const b = appearance.settings();
        const color = colorField(form.color, 'The main');
        if (color.error) return { ok: false, text: color.error };
        if (appearance.STATUSES[form.status]) b.status = form.status;
        if (appearance.ACTIVITIES[form.activityType]) b.activityType = form.activityType;
        b.activityText = text(form.activityText, 128);
        b.color = color.value ? hexColor(color.value) : null;
        db.save();
        appearance.applyPresence(guild.client);
        changes.push('status and colour');
      }
      return { ok: true, text: changes.length ? `Saved (${changes.join(', ')}).` : 'Nothing changed.' };
    }
    case 'panel-new': {
      const name = text(form.name, 60);
      const panel = panels.create(guild.id, form.type === 'tickets' ? 'tickets' : 'roles', name);
      if (!panel) return { ok: false, text: `You already have ${panels.MAX_PANELS} panels.` };
      return { ok: true, text: `Panel "${panel.name}" created. Set it up below, then post it.`, redirect: `/g/${guild.id}/panel/${panel.id}` };
    }
    case 'command': {
      const color = colorField(form.color, 'The');
      if (color.error) return { ok: false, text: color.error };
      const toggleRole = validRoles(guild, form.toggleRole)[0] ?? '';
      const result = customCommands.save(guild, new Set(guild.client.commands.keys()), {
        name: text(form.name, 40), description: text(form.description, 100), response: text(form.response, 4000),
        title: text(form.title, 256), color: color.value, image: text(form.image, 500), thumbnail: text(form.thumbnail, 500),
        footer: text(form.footer, 2048), asCard: form.asCard, private: form.private,
        allowedRoles: validRoles(guild, form.allowedRoles), toggleRole,
      });
      if (!result.ok) return result;
      try {
        await customCommands.register(guild);
      } catch (error) {
        return { ok: false, text: `Saved, but Discord didn't accept the command list: ${error.message}` };
      }
      return result;
    }
    case 'command-remove': {
      const name = text(form.name, 40);
      if (!customCommands.remove(guild.id, name)) return { ok: false, text: 'That command no longer exists.' };
      await customCommands.register(guild).catch(() => {});
      return { ok: true, text: `/${name} deleted.` };
    }
    case 'logs': {
      const channelId = validChannel(guild, form.logChannel);
      if (!channelId) return { ok: false, text: 'Pick a log channel.' };
      settings.update(guild.id, { logChannel: channelId });
      return { ok: true, text: 'Staff log channel saved.' };
    }
    case 'roles': {
      const staffRole = validRoles(guild, form.staffRole)[0] ?? null;
      settings.update(guild.id, { autoroles: validRoles(guild, form.autoroles), staffRole, staffSourceRoles: validRoles(guild, form.staffSourceRoles) });
      return { ok: true, text: 'Auto roles saved.' };
    }
    case 'ranks': {
      const ranks = [];
      for (let i = 0; i < 8; i++) {
        const id = validRoles(guild, form[`rank${i}`])[0];
        if (id && !ranks.includes(id)) ranks.push(id);
      }
      if (ranks.length < 2) return { ok: false, text: 'The ladder needs at least 2 ranks.' };
      settings.update(guild.id, { ranks, rankManagers: validRoles(guild, form.rankManagers) });
      return { ok: true, text: `Rank ladder saved (${ranks.length} ranks).` };
    }
    case 'tickets': {
      settings.update(guild.id, {
        tickets: {
          category: validChannel(guild, form.category, [ChannelType.GuildCategory]) ?? '',
          transcriptChannel: validChannel(guild, form.transcriptChannel) ?? '',
          staffRoles: validRoles(guild, form.staffRoles),
        },
      });
      return { ok: true, text: 'Ticket defaults saved.' };
    }
    case 'automod': {
      const rules = automod.settings(guild.id);
      for (const key of Object.keys(automod.FEATURES)) rules[key] = Boolean(form[key]);
      db.save();
      return { ok: true, text: 'Automod saved.' };
    }
    case 'filter': {
      const words = [...new Set(text(form.words, 10000).split('\n').map((w) => w.trim().toLowerCase().replace(/\s+/g, ' ')).filter((w) => w.length >= 2 && w.length <= 50))].slice(0, 200);
      g.filter = words;
      db.save();
      return { ok: true, text: `Word filter saved (${words.length} word${words.length === 1 ? '' : 's'}).` };
    }
    case 'schedule-add': {
      const channelId = validChannel(guild, form.channel);
      const nextAt = parseWhen(text(form.when, 40), settings.get(guild.id).timezone);
      const message = text(form.message, 2000);
      const repeat = ['none', 'daily', 'weekly'].includes(form.repeat) ? form.repeat : 'none';
      if (!channelId) return { ok: false, text: 'Pick a channel for the scheduled message.' };
      if (!nextAt) return { ok: false, text: 'I didn\'t understand that time. Try "in 2h", "6:30pm", "tomorrow 9am" or "10/31 7pm".' };
      if (!message) return { ok: false, text: 'The message can\'t be empty.' };
      const saved = schedules.add(guild.id, {
        channelId, nextAt, repeat, title: text(form.title, 256) || null, message,
        allowEveryone: member.permissions.has(PermissionFlagsBits.MentionEveryone), createdBy: member.id,
      });
      if (!saved) return { ok: false, text: `There are already ${schedules.MAX_PER_SERVER} scheduled messages.` };
      return { ok: true, text: `Scheduled message #${saved.id} added.` };
    }
    case 'schedule-remove': {
      const id = Number(text(form.id, 10));
      return schedules.remove(guild.id, id) ? { ok: true, text: `Scheduled message #${id} deleted.` } : { ok: false, text: 'That scheduled message no longer exists.' };
    }
    default:
      return { ok: false, text: 'Unknown setting.' };
  }
}

/** Reads the panel edit form into the panel. Returns an error message, or null. */
function readPanelForm(guild, panel, form) {
  const color = colorField(form.color, 'The panel');
  if (color.error) return color.error;
  const image = text(form.image, 500);
  const thumbnail = text(form.thumbnail, 500);
  if (!isLink(image) || !isLink(thumbnail)) return 'Image links must start with https://';

  const items = [];
  const slots = Math.min(Number(text(form.slots, 4)) || 0, panels.MAX_ITEMS + 5);
  for (let i = 0; i < slots; i++) {
    const p = `item${i}_`;
    if (form[`${p}remove`]) continue;
    const emoji = resolveEmoji(guild, text(form[`${p}emoji`], 64));
    if (emoji.error) return emoji.error;
    const base = {
      label: text(form[`${p}label`], 80),
      emoji: emoji.emoji ?? '',
      style: panels.STYLES[form[`${p}style`]] ? form[`${p}style`] : panel.type === 'roles' ? 'grey' : 'blurple',
      description: text(form[`${p}description`], 100),
    };
    if (panel.type === 'roles') {
      const roleId = validRoles(guild, form[`${p}role`])[0];
      if (!roleId) {
        if (base.label || base.emoji || base.description) return `Pick a role for "${base.label || base.emoji}" (or tick Remove).`;
        continue; // an empty slot
      }
      if (items.some((item) => item.roleId === roleId)) return `${guild.roles.cache.get(roleId).name} is on this panel twice.`;
      items.push({ ...base, roleId });
    } else {
      const questions = text(form[`${p}questions`], 500).split('\n').map((q) => q.trim()).filter(Boolean);
      if (questions.length > panels.MAX_QUESTIONS) return `A ticket form can have up to ${panels.MAX_QUESTIONS} questions.`;
      const long = questions.find((q) => q.length > 45);
      if (long) return `This question is longer than 45 characters (Discord's limit): "${long}"`;
      const isNew = i >= panel.items.length;
      const touched = base.label || base.description || form[`${p}category`] || asList(form[`${p}staffRoles`]).length;
      if (isNew && !touched) continue; // the blank "add another" slot wasn't used
      items.push({
        ...base,
        label: base.label || 'Create ticket',
        category: validChannel(guild, form[`${p}category`], [ChannelType.GuildCategory]) ?? '',
        staffRoles: validRoles(guild, form[`${p}staffRoles`]),
        pingStaff: Boolean(form[`${p}pingStaff`]),
        questions,
        namePrefix: text(form[`${p}namePrefix`], 40) || 'ticket',
        welcome: text(form[`${p}welcome`], 2000),
      });
    }
  }
  if (items.length > panels.MAX_ITEMS) return `A panel can have up to ${panels.MAX_ITEMS} options.`;
  if (panel.type === 'tickets' && !items.length) return 'A ticket panel needs at least one ticket type.';

  Object.assign(panel, {
    name: text(form.name, 60) || panel.name,
    title: text(form.title, 256),
    description: text(form.description, 4000),
    color: color.value,
    image,
    thumbnail,
    footer: text(form.footer, 2048),
    mode: form.mode === 'dropdown' ? 'dropdown' : 'buttons',
    placeholder: text(form.placeholder, 150),
    items,
  });
  if (panel.type === 'roles') {
    panel.listRoles = Boolean(form.listRoles);
    panel.exclusive = Boolean(form.exclusive);
  } else {
    panel.maxOpen = Math.min(Math.max(Number(form.maxOpen) || 1, 1), 10);
    panel.transcriptChannel = validChannel(guild, form.transcriptChannel) ?? '';
  }
  return null;
}

/** The panel edit page's buttons: save, post, repost, duplicate, delete. */
async function applyPanel(guild, member, panel, action, form) {
  const back = `/g/${guild.id}/panel/${panel.id}`;
  if (action === 'delete') {
    if (!form.confirm) return { ok: false, text: 'Tick "Yes, delete it" first.', redirect: back };
    panels.remove(guild.id, panel.id);
    return { ok: true, text: `Panel "${panel.name}" deleted.`, redirect: `/g/${guild.id}#panels` };
  }
  if (action === 'duplicate') {
    const copy = panels.duplicate(guild.id, panel.id);
    if (!copy) return { ok: false, text: `You already have ${panels.MAX_PANELS} panels.`, redirect: back };
    return { ok: true, text: `Made a copy: "${copy.name}". It isn't posted yet.`, redirect: `/g/${guild.id}/panel/${copy.id}` };
  }
  if (action !== 'save') return { ok: false, text: 'Unknown action.', redirect: back };

  const error = readPanelForm(guild, panel, form);
  if (error) return { ok: false, text: error, redirect: back };
  db.save();

  const what = ['post', 'repost'].includes(form.do) ? form.do : 'save';
  if (what === 'save') {
    const refreshed = await panels.refresh(guild, panel);
    if (refreshed && !refreshed.ok) return { ...refreshed, redirect: back };
    return { ok: true, text: refreshed ? 'Saved and updated the posted panel.' : 'Saved.', redirect: back };
  }
  const channelId = validChannel(guild, form.channel);
  if (!channelId) return { ok: false, text: 'Saved. Pick a channel to post it in.', redirect: back };
  const channel = guild.channels.cache.get(channelId);
  const perms = channel.permissionsFor(guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return { ok: false, text: `Saved, but I can't post in #${channel.name}. Give me View, Send Messages and Embed Links there.`, redirect: back };
  }
  if (what === 'repost') panel.messageId = null;
  try {
    const result = await panels.post(guild, panel, channelId);
    return { ...result, text: result.ok ? `Saved. ${result.text}` : result.text, redirect: back };
  } catch (err) {
    return { ok: false, text: `Saved, but posting failed: ${err.message}`, redirect: back };
  }
}

module.exports = { apply, applyPanel, readPanelForm };
