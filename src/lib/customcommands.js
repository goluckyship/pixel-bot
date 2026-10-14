// Custom slash commands made in the dashboard, like /rules or /socials.
// Each one replies with text and/or a styled card, and can switch a role on/off.
// They're registered as this server's own slash commands, so they autofill too.
const { MessageFlags } = require('discord.js');
const db = require('./storage');
const { embed, hexColor, fill, truncate, ephemeral } = require('./ui');

const MAX = 100; // Discord allows 100 slash commands per server
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

function all(guildId) {
  const g = db.guild(guildId);
  g.customCommands ??= {};
  return g.customCommands;
}

const list = (guildId) => Object.values(all(guildId)).sort((a, b) => a.name.localeCompare(b.name));
const find = (guildId, name) => (guildId ? all(guildId)[name] ?? null : null);

/** Lowercase, no spaces: what Discord allows in a command name. */
const cleanName = (text) => String(text ?? '').trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, '-');

/** Saves a command (new or replacing one with the same name). Returns { ok, text }. */
function save(guild, builtInNames, input) {
  const name = cleanName(input.name);
  if (!NAME_RE.test(name)) return { ok: false, text: 'Command names can only use lowercase letters, numbers, - and _ (up to 32).' };
  if (builtInNames.has(name)) return { ok: false, text: `/${name} is already one of Pixel Bot's own commands. Pick another name.` };
  const commands = all(guild.id);
  if (!commands[name] && Object.keys(commands).length >= MAX) return { ok: false, text: `You can have up to ${MAX} custom commands.` };
  if (!input.response && !input.title && !input.image) return { ok: false, text: 'Give the command some text, a title or an image to reply with.' };
  if (input.color && hexColor(input.color) === null) return { ok: false, text: 'The colour should look like #7c5cff.' };
  for (const link of [input.image, input.thumbnail]) {
    if (link && !/^https:\/\/\S+$/i.test(link)) return { ok: false, text: 'Image links must start with https://' };
  }
  commands[name] = {
    name,
    description: input.description || 'A custom command',
    response: input.response ?? '',
    title: input.title ?? '',
    color: input.color ?? '',
    image: input.image ?? '',
    thumbnail: input.thumbnail ?? '',
    footer: input.footer ?? '',
    asCard: Boolean(input.asCard),
    private: Boolean(input.private),
    allowedRoles: input.allowedRoles ?? [],
    toggleRole: input.toggleRole ?? '',
    uses: commands[name]?.uses ?? 0,
  };
  db.save();
  return { ok: true, text: `/${name} saved. It shows up in Discord within a few seconds.` };
}

function remove(guildId, name) {
  const commands = all(guildId);
  if (!commands[name]) return false;
  delete commands[name];
  db.save();
  return true;
}

/** Tells Discord about this server's custom commands. */
async function register(guild, { onlyIfChanged = false } = {}) {
  const body = list(guild.id).map((c) => ({ name: c.name, description: truncate(c.description || 'A custom command', 100), type: 1 }));
  // On start-up, skip the call to Discord when nothing changed since last time (less traffic).
  const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  const g = db.guild(guild.id);
  if (onlyIfChanged && g.customCommandsHash === hash) return body.length;
  await guild.commands.set(body);
  g.customCommandsHash = hash;
  db.saveSoon?.();
  return body.length;
}

/** Someone used a custom command. */
async function run(interaction) {
  const command = find(interaction.guildId, interaction.commandName);
  const member = interaction.member;
  if (command.allowedRoles?.length && !command.allowedRoles.some((id) => member.roles.cache.has(id)) && interaction.guild.ownerId !== member.id) {
    return interaction.reply(ephemeral("You don't have a role that can use this command."));
  }

  const vars = { member, guild: interaction.guild, channel: interaction.channel };
  const extra = [];
  if (command.toggleRole) {
    const role = interaction.guild.roles.cache.get(command.toggleRole);
    if (role?.editable) {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, `/${command.name}`);
        extra.push(`Removed ${role}.`);
      } else {
        await member.roles.add(role, `/${command.name}`);
        extra.push(`Gave you ${role}.`);
      }
    } else {
      extra.push("(I couldn't change your role. A moderator needs to move my role above it.)");
    }
  }

  const text = fill(command.response, vars);
  const reply = { allowedMentions: { parse: ['users'] } };
  if (command.asCard || command.title || command.image || command.thumbnail) {
    const card = embed(hexColor(command.color) ?? undefined);
    if (command.title) card.setTitle(truncate(fill(command.title, vars), 256));
    if (text) card.setDescription(truncate(text, 4096));
    if (command.image) card.setImage(command.image);
    if (command.thumbnail) card.setThumbnail(command.thumbnail);
    if (command.footer) card.setFooter({ text: truncate(fill(command.footer, vars), 2048) });
    if (!command.title && !text && !command.image) card.setDescription(`/${command.name}`);
    reply.embeds = [card];
    if (extra.length) reply.content = extra.join(' ');
  } else {
    reply.content = truncate([text, ...extra].filter(Boolean).join('\n') || `/${command.name}`, 2000);
  }
  if (command.private) reply.flags = MessageFlags.Ephemeral;

  command.uses = (command.uses ?? 0) + 1;
  db.save();
  return interaction.reply(reply);
}

module.exports = { MAX, list, find, save, remove, register, run, cleanName };
