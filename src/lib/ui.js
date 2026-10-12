// Small helpers so every command looks consistent.
const { EmbedBuilder, MessageFlags } = require('discord.js');

const COLORS = {
  brand: 0x7c5cff, // Pixel Bot purple
  success: 0x3ecf8e,
  warning: 0xf5a623,
  danger: 0xe5484d,
};

/** A new embed in Pixel Bot's colour. */
function embed(color = COLORS.brand) {
  return new EmbedBuilder().setColor(color);
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

module.exports = { COLORS, embed, ephemeral, pick, truncate };
