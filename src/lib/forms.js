// Small helpers for pop-up forms (modals).
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

/**
 * fields: [{ id, label, long?, required?, max?, value?, placeholder? }] (up to 5)
 */
function form(customId, title, fields) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label.slice(0, 45))
      .setStyle(field.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(Boolean(field.required))
      .setMaxLength(field.max ?? (field.long ? 4000 : 256));
    if (field.placeholder) input.setPlaceholder(field.placeholder.slice(0, 100));
    if (field.value) input.setValue(String(field.value).slice(0, field.max ?? 4000));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

/** A submitted field, trimmed, or null if empty. */
function value(interaction, id) {
  try {
    const text = interaction.fields.getTextInputValue(id)?.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}

/** "#7c5cff" or "7c5cff" -> number; undefined if empty; NaN if invalid. */
function parseColor(text) {
  if (!text) return undefined;
  const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  return match ? parseInt(match[1], 16) : NaN;
}

const isHttpsUrl = (text) => /^https:\/\/\S+$/i.test(text ?? '');

module.exports = { form, value, parseColor, isHttpsUrl };
