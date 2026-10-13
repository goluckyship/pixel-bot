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
const questionsLib = require('../lib/questions');
const { FONTS, CORNERS, MODES } = require('./html');

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

/**
 * Reads a colour picker. Its "default" tick box means no colour of its own.
 * (Plain text like "#7c5cff" also works, for older forms.)
 */
function pickColor(form, name, what) {
  if (form[`${name}_default`]) return { value: '' };
  const t = text(form[name], 7);
  if (!t) return { value: '' };
  if (hexColor(t) === null) return { error: `${what} colour should look like #7c5cff.` };
  return { value: t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase()}` };
}

/** Saves a feature's settings, or runs one of its own dashboard buttons ("feat-<id>--<action>"). */
async function applyFeature(guild, member, sectionId, form) {
  const features = require('../lib/features');
  const fieldsUi = require('./fields');
  const [base, action] = sectionId.slice('feat-'.length).split('--');
  const feature = features.byId(base);
  if (!feature) return { ok: false, text: 'Unknown setting.' };
  if (action) {
    const handler = feature.actions?.[action];
    if (!handler) return { ok: false, text: 'Unknown button.' };
    return handler({ guild, member, form, cfg: features.config(guild.id, feature.id) });
  }
  const parsed = fieldsUi.parseAll(feature.fields ?? [], form, guild);
  if (parsed.error) return { ok: false, text: parsed.error };
  const problem = feature.validate?.(parsed.values, guild);
  if (problem) return { ok: false, text: problem };
  features.saveConfig(guild.id, feature.id, parsed.values);
  await feature.onSave?.(guild, parsed.values);
  return { ok: true, text: `${feature.title} saved.` };
}

/** Re-reads channels, roles, emojis and members from Discord, so new ones show up everywhere. */
async function refresh(guild, form) {
  // Only ever send people back to a dashboard page.
  const back = /^\/g\/\d+(\/panel\/\d+)?$/.test(String(form?.back ?? '')) ? form.back : undefined;
  const results = await Promise.allSettled([
    guild.channels.fetch?.(),
    guild.roles.fetch?.(),
    guild.emojis?.fetch?.(),
    guild.members.fetch?.(),
  ]);
  const failed = results.filter((r) => r.status === 'rejected').length;
  const channels = guild.channels.cache.size;
  const roles = Math.max(0, guild.roles.cache.size - 1);
  return { ok: failed === 0, text: `🔄 Refreshed from Discord: ${channels} channels, ${roles} roles, ${guild.memberCount} members.${failed ? ' (Some parts couldn\'t be read. Check Pixel Bot\'s permissions.)' : ''}`, redirect: back };
}

/** Everything about this server worth backing up (no logins or secrets). */
function backupOf(guild) {
  const copy = JSON.parse(JSON.stringify(db.guild(guild.id)));
  return { pixelBotBackup: 1, server: guild.name, serverId: guild.id, madeAt: new Date().toISOString(), data: copy };
}

/** IDs from text: one per line, or <@123> mentions. */
const idsFrom = (value) => [...new Set(text(value, Infinity).split(/[\s,]+/).map((x) => x.replace(/[<@!>]/g, '')).filter((x) => /^\d{17,20}$/.test(x)))];

/** Owner-only controls ("owner-..."). */
async function applyOwner(guild, member, sectionId, form) {
  const owner = require('../lib/owner');
  if (!owner.isOwner(guild.client, member.id)) return { ok: false, text: 'Only the bot owner can change that.' };
  const o = owner.settings();
  switch (sectionId) {
    case 'owner-controls': {
      o.maintenance = Boolean(form.maintenance);
      o.maintenanceText = text(form.maintenanceText, 1000) || o.maintenanceText;
      const all = new Set(guild.client.commands.keys());
      const on = new Set(asList(form.commands));
      o.disabledCommands = [...all].filter((name) => !on.has(name));
      o.blocked = idsFrom(form.blocked).filter((id) => !owner.isOwner(guild.client, id));
      db.save();
      return { ok: true, text: `Saved. ${o.maintenance ? 'Maintenance mode is ON: only you can use Pixel Bot.' : 'Pixel Bot is open to everyone.'}` };
    }
    case 'owner-access': {
      o.onlyMe = Boolean(form.onlyMe);
      o.extraAccess = idsFrom(form.extraAccess);
      db.save();
      return { ok: true, text: o.onlyMe ? 'The dashboard is now locked to just you.' : 'Dashboard access saved.' };
    }
    case 'owner-logout': {
      require('./auth').sessions.clear();
      return { ok: true, text: 'Everyone has been logged out of the dashboard (you too, so log back in).' };
    }
    case 'owner-restore': {
      let parsed;
      try {
        parsed = JSON.parse(text(form.backup, Infinity));
      } catch {
        return { ok: false, text: 'That isn\'t a Pixel Bot backup. Open the backup file, copy everything in it, and paste it in.' };
      }
      if (!parsed || parsed.pixelBotBackup !== 1 || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) return { ok: false, text: 'That isn\'t a Pixel Bot backup file.' };
      if (!form.confirm) return { ok: false, text: 'Tick the box to confirm. Restoring replaces every setting for this server.' };
      db.data.guilds[guild.id] = parsed.data;
      db.save();
      return { ok: true, text: `Restored the backup from ${parsed.madeAt?.slice(0, 10) ?? 'earlier'}.` };
    }
    default:
      return { ok: false, text: 'Unknown setting.' };
  }
}

/** Returns { ok, text, redirect? } describing what happened. */
async function apply(guild, member, sectionId, form) {
  if (sectionId === 'refresh') return refresh(guild, form);
  if (sectionId.startsWith('feat-')) return applyFeature(guild, member, sectionId, form);
  if (sectionId.startsWith('owner-')) return applyOwner(guild, member, sectionId, form);
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
      const message = text(form.message, 4096);
      const color = pickColor(form, 'color', 'The welcome');
      const image = text(form.image, 2000);
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
      const color = pickColor(form, 'color', 'The goodbye');
      if (color.error) return { ok: false, text: color.error };
      g.goodbye = { channelId, message: text(form.message, 4096), plain: Boolean(form.plain), color: color.value };
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
      if (require('../lib/owner').isOwner(guild.client, member.id) && form.status !== undefined) {
        const b = appearance.settings();
        const color = pickColor(form, 'color', 'The main');
        if (color.error) return { ok: false, text: color.error };
        if (appearance.STATUSES[form.status]) b.status = form.status;
        if (appearance.ACTIVITIES[form.activityType]) b.activityType = form.activityType;
        b.activityText = text(form.activityText, 128);
        b.color = color.value ? hexColor(color.value) : null;
        const theme = {};
        for (const [key, field] of [['accent', 'themeAccent'], ['background', 'themeBackground'], ['card', 'themeCard']]) {
          const picked = pickColor(form, field, 'The dashboard');
          if (picked.error) return { ok: false, text: picked.error };
          if (picked.value) theme[key] = picked.value;
        }
        if (MODES[form.themeMode]) theme.mode = form.themeMode;
        if (FONTS[form.themeFont]) theme.font = form.themeFont;
        if (CORNERS[form.themeCorners]) theme.corners = form.themeCorners;
        const title = text(form.themeTitle, Infinity);
        if (title) theme.title = title;
        b.theme = theme;
        db.save();
        appearance.applyPresence(guild.client);
        changes.push('status, colours and dashboard look');
      }
      return { ok: true, text: changes.length ? `Saved (${changes.join(', ')}).` : 'Nothing changed.' };
    }
    case 'panel-new': {
      const name = text(form.name, Infinity);
      const panel = panels.create(guild.id, ['tickets', 'applications'].includes(form.type) ? form.type : 'roles', name);
      if (!panel) return { ok: false, text: `You already have ${panels.MAX_PANELS} panels.` };
      return { ok: true, text: `Panel "${panel.name}" created. Set it up below, then post it.`, redirect: `/g/${guild.id}/panel/${panel.id}` };
    }
    case 'command': {
      const color = pickColor(form, 'color', 'The');
      if (color.error) return { ok: false, text: color.error };
      const toggleRole = validRoles(guild, form.toggleRole)[0] ?? '';
      const result = customCommands.save(guild, new Set(guild.client.commands.keys()), {
        name: text(form.name, 40), description: text(form.description, 100), response: text(form.response, 4096),
        title: text(form.title, 256), color: color.value, image: text(form.image, 2000), thumbnail: text(form.thumbnail, 2000),
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
      const words = [...new Set(text(form.words, Infinity).split('\n').map((w) => w.trim().toLowerCase().replace(/\s+/g, ' ')).filter((w) => w.length >= 2))];
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
  const color = pickColor(form, 'color', 'The panel');
  if (color.error) return color.error;
  const image = text(form.image, 2000);
  const thumbnail = text(form.thumbnail, 2000);
  if (!isLink(image) || !isLink(thumbnail)) return 'Image links must start with https://';

  const items = [];
  const slots = Number(text(form.slots, 6)) || 0;
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
      const questionList = [];
      const count = Number(text(form[`${p}qcount`], 6)) || 0;
      for (let q = 0; q < count; q++) {
        const qp = `${p}q${q}_`;
        const qText = text(form[`${qp}text`], Infinity);
        if (!qText) continue; // empty = removed
        const type = questionsLib.TYPES[form[`${qp}type`]] ? form[`${qp}type`] : 'long';
        questionList.push({
          text: qText,
          type,
          required: Boolean(form[`${qp}required`]),
          help: text(form[`${qp}help`], Infinity),
          placeholder: text(form[`${qp}placeholder`], 150),
          choices: text(form[`${qp}choices`], Infinity).split('\n').map((c) => c.trim()).filter(Boolean),
        });
      }
      // Older form layout: one question per line.
      if (!count && form[`${p}questions`] !== undefined) {
        for (const line of text(form[`${p}questions`], Infinity).split('\n').map((x) => x.trim()).filter(Boolean)) questionList.push({ text: line, type: 'long', required: true });
      }
      const itemColor = pickColor(form, `${p}color`, 'The ticket card');
      if (itemColor.error) return itemColor.error;
      const isNew = i >= panel.items.length;
      if (panel.type === 'applications') {
        const touchedApp = base.label || base.description || form[`${p}reviewChannel`] || asList(form[`${p}reviewers`]).length || asList(form[`${p}acceptRoles`]).length;
        if (isNew && !touchedApp) continue;
        const cooldown = Number(text(form[`${p}cooldownDays`], 10));
        items.push({
          ...base,
          label: base.label || 'Apply',
          open: Boolean(form[`${p}open`]),
          reviewChannel: validChannel(guild, form[`${p}reviewChannel`]) ?? '',
          reviewers: validRoles(guild, form[`${p}reviewers`]),
          pingReviewers: Boolean(form[`${p}pingReviewers`]),
          acceptRoles: validRoles(guild, form[`${p}acceptRoles`]),
          removeRoles: validRoles(guild, form[`${p}removeRoles`]),
          cooldownDays: Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 7,
          questions: questionList,
          color: itemColor.value,
          thanks: text(form[`${p}thanks`], 2000),
          acceptMessage: text(form[`${p}acceptMessage`], 3000),
          declineMessage: text(form[`${p}declineMessage`], 3000),
        });
        continue;
      }
      const touched = base.label || base.description || form[`${p}category`] || asList(form[`${p}staffRoles`]).length;
      if (isNew && !touched) continue; // the blank "add another" slot wasn't used
      items.push({
        ...base,
        label: base.label || 'Create ticket',
        category: validChannel(guild, form[`${p}category`], [ChannelType.GuildCategory]) ?? '',
        staffRoles: validRoles(guild, form[`${p}staffRoles`]),
        pingStaff: Boolean(form[`${p}pingStaff`]),
        questions: questionList,
        color: itemColor.value,
        namePrefix: text(form[`${p}namePrefix`], Infinity) || 'ticket',
        welcome: text(form[`${p}welcome`], 4096),
      });
    }
  }
  const closeEmoji = panel.type === 'tickets' ? resolveEmoji(guild, text(form.closeEmoji, 64)) : { emoji: null };
  if (closeEmoji.error) return closeEmoji.error;
  if (panel.type === 'tickets' && !items.length) return 'A ticket panel needs at least one ticket type.';
  if (panel.type === 'applications' && !items.length) return 'An application panel needs at least one kind of application.';

  Object.assign(panel, {
    name: text(form.name, Infinity) || panel.name,
    title: text(form.title, 256),
    description: text(form.description, 4096),
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
  } else if (panel.type === 'tickets') {
    const maxOpen = Number(form.maxOpen);
    panel.maxOpen = Number.isInteger(maxOpen) && maxOpen >= 0 ? maxOpen : 1; // 0 = no limit
    panel.closeLabel = text(form.closeLabel, 80) || 'Close ticket';
    panel.closeEmoji = closeEmoji.emoji ?? '';
    panel.closeStyle = panels.STYLES[form.closeStyle] ? form.closeStyle : 'red';
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
  if (what === 'repost') {
    panel.messageId = null;
    panel.messageIds = [];
  }
  try {
    const result = await panels.post(guild, panel, channelId);
    return { ...result, text: result.ok ? `Saved. ${result.text}` : result.text, redirect: back };
  } catch (err) {
    return { ok: false, text: `Saved, but posting failed: ${err.message}`, redirect: back };
  }
}

module.exports = { apply, applyPanel, readPanelForm, backupOf };
