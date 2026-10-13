// Small helpers so every command looks consistent.
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('./storage');

const COLORS = {
  brand: 0x7c5cff, // Pixel Bot purple
  success: 0x3ecf8e,
  warning: 0xf5a623,
  danger: 0xe5484d,
};

/** The bot's main colour: the one picked in the dashboard, or purple. */
function brandColor() {
  const saved = db.data.bot?.color;
  return Number.isInteger(saved) && saved >= 0 && saved <= 0xffffff ? saved : COLORS.brand;
}

/** A new embed in Pixel Bot's colour. */
function embed(color) {
  return new EmbedBuilder().setColor(color ?? brandColor());
}

/** "#7c5cff" or "7c5cff" -> number, or null if it isn't a colour. */
function hexColor(text) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(text ?? '').trim());
  return match ? parseInt(match[1], 16) : null;
}

/** Fills in {user}, {username}, {server}, {count} and {channel} placeholders. */
function fill(template, { member, user = member?.user, guild = member?.guild, channel } = {}) {
  let text = String(template ?? '');
  if (user) text = text.replaceAll('{user}', `<@${user.id}>`).replaceAll('{username}', user.username).replaceAll('{mention}', `<@${user.id}>`);
  if (guild) text = text.replaceAll('{server}', guild.name).replaceAll('{count}', String(guild.memberCount));
  if (channel) text = text.replaceAll('{channel}', `<#${channel.id}>`);
  return text;
}

/** A reply only the person who ran the command can see. */
function ephemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

/** Pick a random item from a list. */
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Shorten long text so it fits inside Discord's limits. */
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

module.exports = { COLORS, embed, brandColor, hexColor, fill, ephemeral, pick, truncate };
