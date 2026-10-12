// Applies the dashboard's forms. Every role and channel ID is checked against
// the server before it's saved.
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/storage');
const settings = require('../lib/settings');
const automod = require('../lib/automod');
const schedules = require('../lib/schedules');
const { parseWhen } = require('../lib/when');

const asList = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const text = (value, max) => String(Array.isArray(value) ? value[0] : value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

function validRoles(guild, ids) {
  return [...new Set(asList(ids))].filter((id) => /^\d+$/.test(id) && id !== guild.id && guild.roles.cache.get(id) && !guild.roles.cache.get(id).managed);
}
function validChannel(guild, id, types = [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
  const channel = guild.channels.cache.get(text(id, 30));
  return channel && types.includes(channel.type) ? channel.id : null;
}

/** Returns { ok, text } describing what happened. */
function apply(guild, member, sectionId, form) {
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
      const message = text(form.message, 1000);
      if (!message) return { ok: false, text: 'The welcome message can\'t be empty.' };
      g.welcome = { channelId, message };
      g.welcomeSeeded = true;
      db.save();
      return { ok: true, text: 'Welcome message saved.' };
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
      const question = text(form.question, 45);
      const panelTitle = text(form.panelTitle, 256);
      const panelText = text(form.panelText, 2000);
      if (!question || !panelTitle || !panelText) return { ok: false, text: 'The question, panel title and panel text can\'t be empty.' };
      settings.update(guild.id, {
        tickets: {
          category: validChannel(guild, form.category, [ChannelType.GuildCategory]) ?? '',
          transcriptChannel: validChannel(guild, form.transcriptChannel) ?? '',
          staffRoles: validRoles(guild, form.staffRoles),
          question, panelTitle, panelText,
        },
      });
      return { ok: true, text: 'Ticket settings saved.' };
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

module.exports = { apply };
