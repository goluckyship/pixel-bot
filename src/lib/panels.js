// Custom panels: as many as you like, each a message with buttons or a
// dropdown. Two kinds:
//   roles   - members click to get or remove roles
//   tickets - members click to open a private ticket (each button can be a
//             different kind of ticket with its own staff, category and questions)
// Panels are made and edited in the web dashboard (or listed and posted with /panel).
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('./storage');
const settings = require('./settings');
const { embed, hexColor, ephemeral, truncate } = require('./ui');
const { findRole, findCategory, findChannel } = require('./resolve');

const MAX_PANELS = 200;
const MAX_ITEMS = 25; // Discord allows 25 buttons (5 rows of 5) or 25 dropdown choices per message
const MAX_QUESTIONS = 5; // Discord forms hold up to 5 boxes

const STYLES = {
  blurple: { name: 'Blurple', value: ButtonStyle.Primary },
  grey: { name: 'Grey', value: ButtonStyle.Secondary },
  green: { name: 'Green', value: ButtonStyle.Success },
  red: { name: 'Red', value: ButtonStyle.Danger },
};

function store(guildId) {
  const g = db.guild(guildId);
  g.panels ??= { counter: 0, items: {} };
  if (!g.panels.seeded) seedFromOldSettings(guildId, g.panels);
  return g.panels;
}

/** The first time panels are used, turn the old single ticket panel into Panel #1. */
function seedFromOldSettings(guildId, panels) {
  panels.seeded = true;
  if (Object.keys(panels.items).length) return;
  const T = settings.get(guildId).tickets;
  const panel = blank('tickets', 'Tickets');
  panel.id = ++panels.counter;
  panel.title = T.panelTitle;
  panel.description = T.panelText;
  panel.transcriptChannel = T.transcriptChannel ?? '';
  Object.assign(panel.items[0], {
    category: T.category ?? '',
    staffRoles: [...(T.staffRoles ?? [])],
    questions: [T.question],
  });
  panels.items[panel.id] = panel;
  panels.legacyTicketPanel = panel.id; // the "Create ticket" button that's already posted opens this one
  db.save();
}

function blankItem(type) {
  return type === 'tickets'
    ? {
        label: 'Create ticket', emoji: '🎟️', style: 'blurple', description: '',
        category: '', staffRoles: [], questions: ['What do you need help with?'],
        namePrefix: 'ticket', welcome: 'Thanks for opening a ticket! Staff will be with you shortly.', pingStaff: false,
      }
    : { roleId: '', label: '', emoji: '', style: 'grey', description: '' };
}

function blank(type, name) {
  return {
    id: 0,
    type,
    name,
    title: type === 'tickets' ? 'Tickets' : 'Roles',
    description: type === 'tickets' ? 'Click a button below to open a ticket.' : 'Click a button to get or remove a role.',
    color: '',
    image: '',
    thumbnail: '',
    footer: '',
    mode: 'buttons', // or 'dropdown'
    placeholder: type === 'tickets' ? 'Pick a ticket type' : 'Pick your roles',
    listRoles: true, // roles panels: list the roles under the description
    exclusive: false, // roles panels: members can only have one role from this panel
    maxOpen: 1, // tickets panels: open tickets one member can have from this panel
    transcriptChannel: '', // tickets panels: blank = the server's default
    items: type === 'tickets' ? [blankItem('tickets')] : [],
    channelId: null,
    messageId: null,
  };
}

const list = (guildId) => Object.values(store(guildId).items).sort((a, b) => a.id - b.id);
const get = (guildId, id) => store(guildId).items[Number(id)] ?? null;

function create(guildId, type, name) {
  const panels = store(guildId);
  if (Object.keys(panels.items).length >= MAX_PANELS) return null;
  const panel = blank(type === 'tickets' ? 'tickets' : 'roles', name || (type === 'tickets' ? 'Tickets' : 'Roles'));
  panel.id = ++panels.counter;
  panels.items[panel.id] = panel;
  db.save();
  return panel;
}

function remove(guildId, id) {
  const panels = store(guildId);
  if (!panels.items[id]) return false;
  delete panels.items[id];
  db.save();
  return true;
}

/** Copies a panel (not where it's posted). */
function duplicate(guildId, id) {
  const source = get(guildId, id);
  if (!source) return null;
  const panels = store(guildId);
  if (Object.keys(panels.items).length >= MAX_PANELS) return null;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = ++panels.counter;
  copy.name = `${source.name} (copy)`;
  copy.channelId = null;
  copy.messageId = null;
  panels.items[copy.id] = copy;
  db.save();
  return copy;
}

/** What a role item's button/choice says. */
function itemLabel(guild, panel, item) {
  if (item.label) return item.label;
  if (panel.type === 'roles') return guild.roles.cache.get(item.roleId)?.name ?? 'Role';
  return 'Open ticket';
}

/** Items that can actually be shown (roles that still exist). */
function usableItems(guild, panel) {
  return panel.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => panel.type !== 'roles' || guild.roles.cache.has(item.roleId))
    .slice(0, MAX_ITEMS);
}

/** Builds the Discord message for a panel. */
function message(guild, panel) {
  const card = embed(hexColor(panel.color) ?? undefined);
  const items = usableItems(guild, panel);
  let description = panel.description ?? '';
  if (panel.type === 'roles' && panel.listRoles && items.length) {
    const lines = items.map(({ item }) => `${item.emoji ? `${item.emoji} ` : ''}<@&${item.roleId}>${item.description ? ` — ${item.description}` : ''}`);
    description = [description, lines.join('\n')].filter(Boolean).join('\n\n');
  }
  if (panel.title) card.setTitle(truncate(panel.title, 256));
  if (description) card.setDescription(truncate(description, 4096));
  if (!panel.title && !description) card.setDescription(panel.name);
  if (panel.image) card.setImage(panel.image);
  if (panel.thumbnail) card.setThumbnail(panel.thumbnail);
  if (panel.footer) card.setFooter({ text: truncate(panel.footer, 2048) });

  const rows = [];
  if (items.length && panel.mode === 'dropdown') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`pb:pnl:${panel.id}:sel`)
      .setPlaceholder(truncate(panel.placeholder || 'Pick one', 150))
      .setMinValues(1)
      .setMaxValues(panel.type === 'roles' && !panel.exclusive ? items.length : 1);
    for (const { item, index } of items) {
      const option = new StringSelectMenuOptionBuilder().setLabel(truncate(itemLabel(guild, panel, item), 100)).setValue(String(index));
      if (item.description) option.setDescription(truncate(item.description, 100));
      if (item.emoji) option.setEmoji(item.emoji);
      menu.addOptions(option);
    }
    rows.push(new ActionRowBuilder().addComponents(menu));
  } else if (items.length) {
    for (let start = 0; start < items.length; start += 5) {
      const row = new ActionRowBuilder();
      for (const { item, index } of items.slice(start, start + 5)) {
        const button = new ButtonBuilder()
          .setCustomId(`pb:pnl:${panel.id}:b:${index}`)
          .setLabel(truncate(itemLabel(guild, panel, item), 80))
          .setStyle((STYLES[item.style] ?? STYLES[panel.type === 'roles' ? 'grey' : 'blurple']).value);
        if (item.emoji) button.setEmoji(item.emoji);
        row.addComponents(button);
      }
      rows.push(row);
    }
  }
  return { embeds: [card], components: rows };
}

/** Posts the panel, or updates it in place if it's already posted in that channel. */
async function post(guild, panel, channelId = panel.channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased?.()) return { ok: false, text: 'Pick a text channel to post the panel in.' };
  if (panel.type === 'roles' && !usableItems(guild, panel).length) return { ok: false, text: 'Add at least one role first.' };
  const body = message(guild, panel);
  if (panel.messageId && panel.channelId === channel.id) {
    const existing = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (existing) {
      await existing.edit(body);
      return { ok: true, text: `Updated the panel in #${channel.name}.` };
    }
  }
  const sent = await channel.send(body);
  panel.channelId = channel.id;
  panel.messageId = sent.id;
  db.save();
  return { ok: true, text: `Posted the panel in #${channel.name}.` };
}

/** After a save: if the panel is already posted, refresh it. Never throws. */
async function refresh(guild, panel) {
  if (!panel.messageId) return null;
  return post(guild, panel).catch((error) => ({ ok: false, text: `Saved, but the posted panel couldn't be updated (${error.message}).` }));
}

// ---- What happens when members click ----

async function toggleRole(interaction, panel, item) {
  const role = interaction.guild.roles.cache.get(item.roleId);
  if (!role) return interaction.reply(ephemeral('That role no longer exists. Ask a moderator to update this panel.'));
  if (!role.editable) return interaction.reply(ephemeral("I can't give out that role. A moderator needs to move my role above it."));
  const member = interaction.member;
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, `Role panel: ${panel.name}`);
    return interaction.reply(ephemeral(`Removed ${role}.`));
  }
  const others = panel.exclusive
    ? panel.items.map((i) => i.roleId).filter((id) => id !== role.id && member.roles.cache.has(id))
    : [];
  if (others.length) await member.roles.remove(others, `Role panel: ${panel.name} (one role only)`);
  await member.roles.add(role, `Role panel: ${panel.name}`);
  return interaction.reply(ephemeral(`Gave you ${role}.${others.length ? ` Removed ${others.map((id) => `<@&${id}>`).join(', ')}.` : ''}`));
}

/** Dropdown on a roles panel: each picked role is switched on or off. */
async function pickRoles(interaction, panel, indexes) {
  const member = interaction.member;
  const added = [];
  const removed = [];
  const blocked = [];
  const picked = indexes.map((i) => panel.items[i]).filter(Boolean);
  for (const item of picked) {
    const role = interaction.guild.roles.cache.get(item.roleId);
    if (!role) continue;
    if (!role.editable) {
      blocked.push(role);
      continue;
    }
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, `Role panel: ${panel.name}`);
      removed.push(role);
    } else {
      if (panel.exclusive) {
        const others = panel.items.map((i) => i.roleId).filter((id) => id !== role.id && member.roles.cache.has(id));
        if (others.length) {
          await member.roles.remove(others, `Role panel: ${panel.name} (one role only)`);
          removed.push(...others.map((id) => `<@&${id}>`));
        }
      }
      await member.roles.add(role, `Role panel: ${panel.name}`);
      added.push(role);
    }
  }
  const lines = [];
  if (added.length) lines.push(`Gave you ${added.join(', ')}.`);
  if (removed.length) lines.push(`Removed ${removed.join(', ')}.`);
  if (blocked.length) lines.push(`I can't hand out ${blocked.join(', ')} (my role needs to be above it).`);
  return interaction.reply(ephemeral(lines.join('\n') || 'Nothing changed.'));
}

/** Handles every panel button, dropdown and form: custom ID "pb:pnl:<panel>:<what>:<index>". */
async function onInteraction(interaction, panelId, what, index) {
  const tickets = require('./tickets'); // required here to avoid a loop between the two files
  const panel = get(interaction.guildId, panelId);
  if (!panel) return interaction.reply(ephemeral('This panel was deleted. Ask a moderator to post a new one.'));

  if (what === 'form') return tickets.onPanelSubmit(interaction, panel, Number(index));

  let indexes;
  if (what === 'sel') indexes = (interaction.values ?? []).map(Number);
  else indexes = [Number(index)];
  indexes = indexes.filter((i) => Number.isInteger(i) && panel.items[i]);
  if (!indexes.length) return interaction.reply(ephemeral('That option was removed from this panel. Ask a moderator to update it.'));

  if (panel.type === 'tickets') return tickets.onPanelOpen(interaction, panel, indexes[0]);
  if (what === 'sel') return pickRoles(interaction, panel, indexes);
  return toggleRole(interaction, panel, panel.items[indexes[0]]);
}

/** Problems that would stop a panel working, for the dashboard. */
function problems(guild, panel) {
  const out = [];
  if (panel.type === 'roles') {
    for (const item of panel.items) {
      const role = guild.roles.cache.get(item.roleId);
      if (!role) out.push('A role on this panel was deleted.');
      else if (!role.editable) out.push(`Pixel Bot's role must be above "${role.name}" to hand it out.`);
    }
    if (!panel.items.length) out.push('Add at least one role.');
  } else {
    for (const item of panel.items) {
      if (item.category && !findCategory(guild, item.category)) out.push(`The category for "${item.label}" was deleted.`);
      for (const r of item.staffRoles ?? []) if (!findRole(guild, r)) out.push(`A staff role for "${item.label}" was deleted.`);
    }
    if (panel.transcriptChannel && !findChannel(guild, panel.transcriptChannel)) out.push('The transcript channel was deleted.');
  }
  if (panel.channelId && !guild.channels.cache.has(panel.channelId)) out.push('The channel it was posted in was deleted.');
  return [...new Set(out)];
}

module.exports = {
  STYLES, MAX_ITEMS, MAX_PANELS, MAX_QUESTIONS,
  store, list, get, create, remove, duplicate, blankItem, message, post, refresh, onInteraction, problems, itemLabel,
};
