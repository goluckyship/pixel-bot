// Turns a feature's settings list into dashboard form fields, and reads the
// submitted form back into settings. Every role and channel is checked against
// the server before it's saved.
//
// Field types:
//   toggle  number  text  textarea  color  select  emoji
//   channel  channels  voice  category  role  roles
//   rows    a repeating group of sub-fields (like "level -> role" rewards)
// Common options: key, label, help, default, placeholder, more (tuck under "More options")
const { ChannelType } = require('discord.js');
const { esc, select, checks, toggle, input, textarea, colorInput } = require('./html');
const { resolveEmoji } = require('../lib/emoji');

const TEXT_KINDS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const KINDS = { channel: TEXT_KINDS, channels: TEXT_KINDS, voice: [ChannelType.GuildVoice, ChannelType.GuildStageVoice].filter((x) => x !== undefined), category: [ChannelType.GuildCategory] };

function roleOptions(guild) {
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name }));
}
function channelOptions(guild, kinds) {
  return [...guild.channels.cache.values()]
    .filter((c) => kinds.includes(c.type))
    .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.type === ChannelType.GuildCategory ? c.name : `${c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement ? '#' : '🔊 '}${c.name}` }));
}

const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v) => String(Array.isArray(v) ? v[0] : v ?? '').replace(/\r\n/g, '\n').trim();

/** One field's HTML. `name` is the form field name. */
function renderField(field, value, guild, name = field.key) {
  const label = field.label ? `<label>${esc(field.label)}</label>` : '';
  const help = field.help ? `<p class="help small">${esc(field.help)}</p>` : '';
  switch (field.type) {
    case 'toggle':
      return toggle(name, Boolean(value), field.label) + help;
    case 'number':
      return `${label}<input type="number" name="${esc(name)}" value="${esc(value)}"${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''} step="${field.step ?? 1}">${help}`;
    case 'textarea':
      return label + textarea(name, value ?? '', { placeholder: field.placeholder ?? '' }) + help;
    case 'color':
      return label + colorInput(name, value, { defaultText: field.defaultText ?? 'Default' }) + help;
    case 'select':
      return label + select(name, Object.entries(field.options).map(([id, n]) => ({ id, name: n })), value, { blank: null }) + help;
    case 'channel':
    case 'voice':
    case 'category':
      return label + select(name, channelOptions(guild, KINDS[field.type]), value, { blank: field.blank ?? '— none —' }) + help;
    case 'channels':
      return label + checks(name, channelOptions(guild, KINDS.channels), asList(value)) + help;
    case 'role':
      return label + select(name, roleOptions(guild), value, { blank: field.blank ?? '— none —' }) + help;
    case 'roles':
      return label + checks(name, roleOptions(guild), asList(value)) + help;
    case 'rows': {
      const rows = [...asList(value), ...Array.from({ length: field.blank ?? 2 }, () => null)];
      const body = rows.map((row, i) => {
        const inner = field.fields.map((sub) => `<div>${renderField(sub, row ? row[sub.key] : sub.default ?? '', guild, `${name}_${i}_${sub.key}`)}</div>`).join('');
        return `<div class="qrow${row ? '' : ' blank'}"><div class="head">${row ? `${esc(field.itemName ?? 'Item')} ${i + 1}` : `+ Add ${esc((field.itemName ?? 'item').toLowerCase())}`}</div><div class="grid${Math.min(field.fields.length, 3)}">${inner}</div>
${row ? toggle(`${name}_${i}__remove`, false, 'Remove') : ''}</div>`;
      }).join('');
      return `${label}${help}${body}<input type="hidden" name="${esc(name)}__count" value="${rows.length}">`;
    }
    default: // text, emoji
      return label + input(name, value ?? '', { placeholder: field.placeholder ?? '' }) + help;
  }
}

/** Reads one field from the form. Returns { value } or { error }. */
function parseField(field, form, guild, name = field.key) {
  const raw = form[name];
  const what = field.label ?? field.key;
  switch (field.type) {
    case 'toggle':
      return { value: Boolean(raw) };
    case 'number': {
      const t = one(raw);
      if (t === '') return { value: field.default ?? 0 };
      const n = Number(t);
      if (!Number.isFinite(n)) return { error: `"${what}" needs a number.` };
      if (field.min !== undefined && n < field.min) return { error: `"${what}" can't be less than ${field.min}.` };
      if (field.max !== undefined && n > field.max) return { error: `"${what}" can't be more than ${field.max}.` };
      return { value: field.step && field.step < 1 ? n : Math.round(n) };
    }
    case 'color': {
      if (form[`${name}_default`]) return { value: '' };
      const t = one(raw);
      if (!t) return { value: '' };
      if (!/^#?[0-9a-f]{6}$/i.test(t)) return { error: `"${what}" should be a colour like #7c5cff.` };
      return { value: (t.startsWith('#') ? t : `#${t}`).toLowerCase() };
    }
    case 'select': {
      const t = one(raw);
      return { value: Object.hasOwn(field.options, t) ? t : field.default ?? Object.keys(field.options)[0] };
    }
    case 'channel':
    case 'voice':
    case 'category': {
      const c = guild.channels.cache.get(one(raw));
      return { value: c && KINDS[field.type].includes(c.type) ? c.id : '' };
    }
    case 'channels':
      return { value: [...new Set(asList(raw))].filter((id) => KINDS.channels.includes(guild.channels.cache.get(id)?.type)) };
    case 'role': {
      const r = guild.roles.cache.get(one(raw));
      return { value: r && r.id !== guild.id && !r.managed ? r.id : '' };
    }
    case 'roles':
      return { value: [...new Set(asList(raw))].filter((id) => { const r = guild.roles.cache.get(id); return r && r.id !== guild.id && !r.managed; }) };
    case 'emoji': {
      const found = resolveEmoji(guild, one(raw));
      if (found.error) return { error: found.error };
      return { value: found.emoji ?? '' };
    }
    case 'rows': {
      const count = Number(one(form[`${name}__count`])) || 0;
      const rows = [];
      for (let i = 0; i < count; i++) {
        if (form[`${name}_${i}__remove`]) continue;
        const row = {};
        for (const sub of field.fields) {
          const parsed = parseField(sub, form, guild, `${name}_${i}_${sub.key}`);
          if (parsed.error) return parsed;
          row[sub.key] = parsed.value;
        }
        // A row whose main (first) field is empty is an unused slot.
        const main = row[field.fields[0].key];
        if (main === '' || main === null || main === undefined || (Array.isArray(main) && !main.length)) continue;
        rows.push(row);
      }
      return { value: rows };
    }
    default:
      return { value: one(raw) };
  }
}

/** All of a feature's fields as HTML, with "more" ones tucked away. */
function renderAll(fields, cfg, guild, more) {
  const main = fields.filter((f) => !f.more).map((f) => renderField(f, cfg[f.key], guild)).join('\n');
  const extra = fields.filter((f) => f.more).map((f) => renderField(f, cfg[f.key], guild)).join('\n');
  return main + (extra ? more(extra) : '');
}

/** Reads every field. Returns { values } or { error }. */
function parseAll(fields, form, guild) {
  const values = {};
  for (const field of fields) {
    const parsed = parseField(field, form, guild);
    if (parsed.error) return { error: parsed.error };
    values[field.key] = parsed.value;
  }
  return { values };
}

module.exports = { renderField, parseField, renderAll, parseAll, roleOptions, channelOptions };
