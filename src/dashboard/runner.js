// Run slash commands from the dashboard.
//
// The command runs exactly as if you'd typed it in Discord (same code, same
// owner controls, same permission rules), so its actions still happen in
// Discord. What the bot would have *said back* is collected and shown on the
// dashboard instead. Tick "also post" to put non-private replies in the channel too.
const { Collection } = require('discord.js');

const T = { SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10, ATTACHMENT: 11 };
const EPHEMERAL = 64;

/** Commands you can run here: built-in ones plus the server's custom commands. */
function commandList(client, guildId) {
  const list = [...client.commands.values()].map((c) => ({ name: c.data.name, description: c.data.description, json: c.data.toJSON(), builtin: true }));
  try {
    for (const c of require('../lib/customcommands').list(guildId)) {
      if (!list.some((x) => x.name === c.name)) list.push({ name: c.name, description: c.description || 'Custom command', json: { name: c.name, description: c.description || '', options: [] }, builtin: false });
    }
  } catch {}
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** The forms to show: one per subcommand (or one for a command without any). */
function variants(json) {
  const out = [];
  for (const o of json.options ?? []) {
    if (o.type === T.GROUP) for (const s of o.options ?? []) out.push({ group: o.name, sub: s.name, description: s.description, options: s.options ?? [] });
    else if (o.type === T.SUB) out.push({ group: null, sub: o.name, description: o.description, options: o.options ?? [] });
  }
  if (!out.length) out.push({ group: null, sub: null, description: json.description, options: json.options ?? [] });
  return out;
}

/** Can this member use this command (the permission Discord would check)? */
function allowed(member, json) {
  if (!json.default_member_permissions) return true;
  if (member.guild.ownerId === member.id) return true;
  return member.permissions.has(BigInt(json.default_member_permissions));
}

// Turns what a command replied with into something plain to show.
function plain(payload) {
  if (typeof payload === 'string') return { content: payload, embeds: [], buttons: [], files: [] };
  const p = payload ?? {};
  const embeds = (p.embeds ?? []).map((e) => (typeof e?.toJSON === 'function' ? e.toJSON() : e ?? {}));
  const buttons = [];
  const walk = (c) => {
    const j = typeof c?.toJSON === 'function' ? c.toJSON() : c;
    if (!j) return;
    if (j.type === 2 && j.label) buttons.push(j.label);
    if (j.type === 3) buttons.push(`Menu: ${j.placeholder ?? 'pick an option'}`);
    if (j.type === 10 && j.content) embeds.push({ description: j.content });
    for (const k of j.components ?? []) walk(k);
    if (j.component) walk(j.component);
  };
  for (const c of p.components ?? []) walk(c);
  const files = (p.files ?? []).map((f) => f?.name ?? f?.attachment?.name ?? 'file');
  return { content: p.content ?? '', embeds, buttons, files, ephemeral: Boolean((Number(p.flags) || 0) & EPHEMERAL || p.ephemeral) };
}

// Payload safe to post for real (no "only you can see this" flag).
function forChannel(payload) {
  if (typeof payload === 'string') return { content: payload, allowedMentions: { parse: [] } };
  const { flags, ephemeral, fetchReply, withResponse, ...rest } = payload ?? {};
  return { ...rest, allowedMentions: rest.allowedMentions ?? { parse: [] } };
}

// Builders (or plain JSON) to plain JSON, whichever discord.js hands us.
function toPlain(c) {
  if (!c || typeof c !== 'object') return c;
  if (typeof c.toJSON === 'function') {
    try {
      const j = c.toJSON();
      if (j && j !== c && !(j.data && j.components === c.components)) return j;
    } catch {}
  }
  if (c.data) return { ...c.data, components: c.components ?? c.data.components, component: c.component ?? c.data.component, options: c.options ?? c.data.options };
  return c;
}

/** Reads a modal (Discord form) into fields the dashboard can show. */
function modalFields(modal) {
  const j = toPlain(modal);
  const fields = [];
  const walk = (raw, label, description) => {
    const c = toPlain(raw);
    if (!c) return;
    if (c.type === 18 || (c.component && c.label)) return walk(c.component, c.label, c.description);
    if (c.type === 10 || (c.content && !c.custom_id)) return fields.push({ kind: 'text', content: c.content });
    const isSelect = c.type === 3 || (Array.isArray(c.options) && c.custom_id && c.style === undefined);
    if (c.type === 4 || (c.custom_id && c.style !== undefined)) {
      return fields.push({ kind: 'input', id: c.custom_id, label: c.label ?? label ?? c.custom_id, description, long: c.style === 2, required: c.required !== false, value: c.value ?? '', placeholder: c.placeholder ?? '', max: c.max_length });
    }
    if (isSelect) {
      const options = (c.options ?? []).map((o) => toPlain(o)).map((o) => ({ value: o.value, label: o.label, selected: Boolean(o.default) }));
      return fields.push({ kind: 'select', id: c.custom_id, label: label ?? c.placeholder ?? c.custom_id, description, multi: (c.max_values ?? 1) > 1, required: c.required !== false && (c.min_values ?? 1) > 0, options });
    }
    for (const k of c.components ?? []) walk(k, label, description);
  };
  for (const c of j?.components ?? []) walk(c);
  return { customId: j?.custom_id, title: j?.title ?? 'Form', fields };
}

/**
 * Runs a command (or answers a form it opened). Returns
 * { outputs: [...], modal?: {...}, error? }.
 */
async function run({ client, guild, member, channel, mode = 'command', commandName, group = null, sub = null, values = {}, customId, fieldValues = {}, post = false }) {
  const outputs = [];
  let modal = null;
  let realReply = null;
  const state = { replied: false, deferred: false };
  const capture = async (kind, payload) => {
    const p = plain(payload);
    outputs.push({ kind, ...p });
    if (post && !p.ephemeral && channel && (p.content || p.embeds.length || payload?.files?.length)) {
      try {
        if (kind === 'edit' && realReply) realReply = await realReply.edit(forChannel(payload));
        else if (kind !== 'edit' || !realReply) {
          const sent = await channel.send(forChannel(payload));
          if (kind !== 'followup') realReply = sent;
        }
      } catch (error) {
        outputs.push({ kind: 'note', content: `Couldn't post that in #${channel.name}: ${error.message}`, embeds: [], buttons: [], files: [] });
      }
    }
  };
  const fakeMessage = () => realReply ?? {
    id: '0', createdTimestamp: Date.now(), content: outputs.at(-1)?.content ?? '',
    edit: async (p) => { await capture('edit', p); return fakeMessage(); },
    delete: async () => {},
    createMessageComponentCollector: () => ({ on() { return this; }, stop() {} }),
    awaitMessageComponent: () => Promise.reject(new Error('Buttons only work in Discord.')),
  };

  // Option getters read the form (IDs) and turn them into Discord objects.
  const opt = (name) => (Object.hasOwn(values, name) && values[name] !== '' ? values[name] : null);
  const need = (name, required, value) => {
    if (required && (value === null || value === undefined)) throw new Error(`Fill in "${name}".`);
    return value ?? null;
  };
  const options = {
    getString: (n, r) => need(n, r, opt(n)),
    getInteger: (n, r) => need(n, r, opt(n) === null ? null : parseInt(opt(n), 10)),
    getNumber: (n, r) => need(n, r, opt(n) === null ? null : Number(opt(n))),
    getBoolean: (n, r) => need(n, r, opt(n) === null ? null : opt(n) === 'true'),
    getUser: (n, r) => need(n, r, opt(n) ? client.users.cache.get(opt(n)) ?? guild.members.cache.get(opt(n))?.user ?? null : null),
    getMember: (n) => (opt(n) ? guild.members.cache.get(opt(n)) ?? null : null),
    getChannel: (n, r) => need(n, r, opt(n) ? guild.channels.cache.get(opt(n)) ?? null : null),
    getRole: (n, r) => need(n, r, opt(n) ? guild.roles.cache.get(opt(n)) ?? null : null),
    getMentionable: (n, r) => need(n, r, opt(n) ? guild.members.cache.get(opt(n)) ?? guild.roles.cache.get(opt(n)) ?? client.users.cache.get(opt(n)) ?? null : null),
    getAttachment: (n, r) => need(n, r, null),
    getSubcommand: (r = true) => need('subcommand', r && !sub ? false : r, sub),
    getSubcommandGroup: () => group,
    getFocused: () => '',
    get: (n) => (opt(n) === null ? null : { name: n, value: opt(n) }),
    data: Object.entries(values).filter(([, v]) => v !== '').map(([name, value]) => ({ name, value })),
  };

  const fieldMap = new Collection(Object.entries(fieldValues).map(([id, v]) => [id, { customId: id, type: Array.isArray(v) ? 3 : 4, value: Array.isArray(v) ? v.join(',') : v, values: Array.isArray(v) ? v : [v] }]));
  const fields = {
    fields: fieldMap,
    getTextInputValue: (id) => { const f = fieldMap.get(id); if (!f) throw new Error(`No field ${id}`); return String(f.value ?? ''); },
    getField: (id) => fieldMap.get(id) ?? null,
    getStringSelectValues: (id) => fieldMap.get(id)?.values ?? [],
  };

  const interaction = {
    id: String(Date.now()), type: mode === 'modal' ? 5 : 2, applicationId: client.application?.id, commandName, commandId: '0',
    customId, client, guild, guildId: guild.id, member, user: member.user, channel, channelId: channel?.id ?? null,
    createdTimestamp: Date.now(), createdAt: new Date(), locale: 'en-US', guildLocale: guild.preferredLocale ?? 'en-US',
    memberPermissions: member.permissions, appPermissions: channel?.permissionsFor?.(guild.members.me) ?? null,
    options, fields, message: null, fromDashboard: true,
    get replied() { return state.replied; }, get deferred() { return state.deferred; },
    inGuild: () => true, inCachedGuild: () => true, inRawGuild: () => false,
    isChatInputCommand: () => mode === 'command', isCommand: () => mode === 'command', isRepliable: () => true,
    isAutocomplete: () => false, isButton: () => false, isStringSelectMenu: () => false, isAnySelectMenu: () => false,
    isModalSubmit: () => mode === 'modal', isFromMessage: () => false, isMessageComponent: () => false,
    async reply(p) { state.replied = true; await capture('reply', p); return fakeMessage(); },
    async deferReply(p) { state.deferred = true; if (plain(p).ephemeral) state.ephemeral = true; return fakeMessage(); },
    async deferUpdate() { state.deferred = true; return fakeMessage(); },
    async editReply(p) { state.replied = true; await capture(state.replied && outputs.some((o) => o.kind !== 'note') ? 'edit' : 'reply', state.ephemeral ? { ...(typeof p === 'string' ? { content: p } : p), flags: EPHEMERAL } : p); return fakeMessage(); },
    async update(p) { state.replied = true; await capture('edit', p); return fakeMessage(); },
    async followUp(p) { await capture('followup', p); return fakeMessage(); },
    async fetchReply() { return fakeMessage(); },
    async deleteReply() {},
    async showModal(m) { modal = modalFields(m); state.replied = true; },
    async awaitModalSubmit() { throw new Error('Forms continue on the dashboard.'); },
  };

  let error = null;
  try {
    await Promise.race([
      require('../events/interactionCreate').execute(interaction),
      new Promise((_, reject) => setTimeout(() => reject(new Error('That command took too long to answer.')), 60_000).unref?.()),
    ]);
  } catch (e) {
    error = e.message;
  }
  return { outputs, modal, error };
}

/** Pre-loads the people picked in the form so the command can find them. */
async function loadPicked(guild, json, values) {
  for (const o of json ?? []) {
    const v = values[o.name];
    if (!v || ![T.USER, T.MENTIONABLE].includes(o.type)) continue;
    await guild.members.fetch(v).catch(() => guild.client.users.fetch(v).catch(() => null));
  }
}

/** Suggestions for an autocomplete option (what Discord would show while typing). */
async function suggestions(client, guild, member, commandName, optionName) {
  const command = client.commands.get(commandName);
  if (!command?.autocomplete) return [];
  let list = [];
  const fake = {
    client, guild, guildId: guild.id, member, user: member.user, commandName, isAutocomplete: () => true,
    options: { getFocused: (full) => (full ? { name: optionName, value: '' } : ''), getSubcommand: () => null, getString: () => null, getInteger: () => null },
    respond: async (choices) => { list = choices; },
  };
  try { await command.autocomplete(fake); } catch {}
  return list.slice(0, 25);
}

module.exports = { T, commandList, variants, allowed, run, loadPicked, suggestions, modalFields, plain };
