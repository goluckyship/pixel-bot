// Ticket questions: any number, any length, many kinds of answer.
//
// Discord forms show at most 5 boxes at a time, so long question lists are split
// into pages: after one page is sent, a "Continue" button opens the next.
// Discord also cuts box titles at 45 characters, so a longer question is shown
// in full as text above its answer box (that uses 2 of the 5 spots on a page).
const djs = require('discord.js');
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = djs;
const { truncate } = require('./ui');

const TYPES = {
  short: 'Short answer',
  long: 'Paragraph',
  dropdown: 'Dropdown (pick one)',
  multi: 'Dropdown (pick several)',
  radio: 'Multiple choice (pick one)',
  checkboxes: 'Checkboxes (tick any)',
  yesno: 'Yes / no tick box',
  file: 'File or screenshot upload',
};
const CHOICE_TYPES = ['dropdown', 'multi', 'radio', 'checkboxes'];
const SLOTS_PER_PAGE = 5; // Discord's limit per form
const DISCORD = { label: 45, labelHelp: 100, placeholder: 100, answer: 4000, display: 4000, dropdownChoices: 25, groupChoices: 10 };

// Newer form parts. If the installed discord.js is too old for them, questions
// fall back to text boxes so tickets keep working.
const has = (name) => name in djs && typeof djs[name] === 'function';
const MODERN = ['LabelBuilder', 'TextDisplayBuilder', 'CheckboxBuilder', 'CheckboxGroupBuilder', 'CheckboxGroupOptionBuilder', 'RadioGroupBuilder', 'RadioGroupOptionBuilder', 'FileUploadBuilder'].every(has);

/** Fills in defaults. Older saves stored questions as plain text. */
function normalize(q) {
  if (typeof q === 'string') q = { text: q };
  const type = TYPES[q?.type] ? q.type : 'long';
  return {
    text: String(q?.text ?? '').trim(),
    help: String(q?.help ?? '').trim(),
    type,
    required: q?.required !== false,
    placeholder: String(q?.placeholder ?? '').trim(),
    choices: (q?.choices ?? []).map((c) => String(c).trim()).filter(Boolean),
  };
}

const list = (item) => (item?.questions ?? []).map(normalize).filter((q) => q.text);

/** How the question will really be asked, after fitting Discord's rules. */
function effectiveType(q) {
  if (!MODERN) return 'long';
  if (CHOICE_TYPES.includes(q.type) && !q.choices.length) return 'long';
  if ((q.type === 'radio' || q.type === 'checkboxes') && q.choices.length > DISCORD.groupChoices) return q.type === 'radio' ? 'dropdown' : 'multi';
  if (q.type === 'radio' && q.choices.length < 2) return 'dropdown';
  return q.type;
}

/** Spots a question takes on a page: 1, or 2 when its text is too long for a box title. */
const fitsInLabel = (q) => q.text.length <= DISCORD.label && q.help.length <= DISCORD.labelHelp;
const fitsInHint = (q) => q.text.length <= DISCORD.labelHelp && !q.help;
const slots = (q) => (MODERN && !fitsInLabel(q) && !fitsInHint(q) ? 2 : 1);

/** Splits questions into pages of up to 5 spots. Returns [[{ q, n }]] where n is the question number. */
function pages(questions) {
  const out = [];
  let page = [];
  let used = 0;
  questions.forEach((q, i) => {
    const need = slots(q);
    if (used + need > SLOTS_PER_PAGE) {
      out.push(page);
      page = [];
      used = 0;
    }
    page.push({ q, n: i });
    used += need;
  });
  if (page.length) out.push(page);
  return out;
}

/** Things worth warning about in the dashboard (nothing here stops a question being saved). */
function notes(q) {
  const out = [];
  const type = effectiveType(q);
  if (CHOICE_TYPES.includes(q.type) && !q.choices.length) out.push('has no choices yet, so it will be a text box');
  else if (type !== q.type && q.type !== 'long') out.push(`has more than ${DISCORD.groupChoices} choices, so it shows as a dropdown`);
  if (['dropdown', 'multi'].includes(type) && q.choices.length > DISCORD.dropdownChoices) out.push(`Discord dropdowns show the first ${DISCORD.dropdownChoices} choices`);
  return out;
}

/** The form for one page. */
function modal(customId, title, page, total, pageIndex) {
  const form = new ModalBuilder().setCustomId(customId).setTitle(truncate(total > 1 ? `${title} (${pageIndex + 1}/${total})` : title, 45));
  for (const { q, n } of page) {
    const id = `q${n}`;
    if (!MODERN) {
      const input = new TextInputBuilder().setCustomId(id).setLabel(truncate(q.text, DISCORD.label)).setStyle(TextInputStyle.Paragraph).setRequired(q.required).setMaxLength(DISCORD.answer);
      if (q.placeholder) input.setPlaceholder(truncate(q.placeholder, DISCORD.placeholder));
      form.addComponents(new ActionRowBuilder().addComponents(input));
      continue;
    }
    const label = new djs.LabelBuilder();
    if (fitsInLabel(q)) {
      label.setLabel(q.text);
      if (q.help) label.setDescription(q.help);
    } else if (fitsInHint(q)) {
      label.setLabel(`Question ${n + 1}`).setDescription(q.text);
    } else {
      form.addTextDisplayComponents(new djs.TextDisplayBuilder().setContent(truncate(`**${n + 1}. ${q.text}**${q.help ? `\n${q.help}` : ''}`, DISCORD.display)));
      label.setLabel('Your answer');
    }

    const type = effectiveType(q);
    const choices = q.choices.slice(0, type === 'dropdown' || type === 'multi' ? DISCORD.dropdownChoices : DISCORD.groupChoices);
    if (type === 'short' || type === 'long') {
      const input = new TextInputBuilder()
        .setCustomId(id)
        .setStyle(type === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(q.required)
        .setMaxLength(DISCORD.answer);
      if (q.placeholder) input.setPlaceholder(truncate(q.placeholder, DISCORD.placeholder));
      label.setTextInputComponent(input);
    } else if (type === 'dropdown' || type === 'multi') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(id)
        .setMinValues(q.required ? 1 : 0)
        .setMaxValues(type === 'multi' ? choices.length : 1)
        .setRequired(q.required)
        .addOptions(choices.map((c, i) => new StringSelectMenuOptionBuilder().setLabel(truncate(c, 100)).setValue(String(i))));
      if (q.placeholder) menu.setPlaceholder(truncate(q.placeholder, 150));
      label.setStringSelectMenuComponent(menu);
    } else if (type === 'radio') {
      label.setRadioGroupComponent(
        new djs.RadioGroupBuilder()
          .setCustomId(id)
          .setRequired(q.required)
          .addOptions(choices.map((c, i) => new djs.RadioGroupOptionBuilder().setLabel(truncate(c, 100)).setValue(String(i)))),
      );
    } else if (type === 'checkboxes') {
      const group = new djs.CheckboxGroupBuilder()
        .setCustomId(id)
        .addOptions(choices.map((c, i) => new djs.CheckboxGroupOptionBuilder().setLabel(truncate(c, 100)).setValue(String(i))))
        .setMinValues(q.required ? 1 : 0)
        .setMaxValues(choices.length);
      if (q.required) group.setRequired(true);
      label.setCheckboxGroupComponent(group);
    } else if (type === 'yesno') {
      label.setCheckboxComponent(new djs.CheckboxBuilder().setCustomId(id));
    } else if (type === 'file') {
      label.setFileUploadComponent(new djs.FileUploadBuilder().setCustomId(id).setMinValues(q.required ? 1 : 0).setMaxValues(10).setRequired(q.required));
    }
    form.addLabelComponents(label);
  }
  return form;
}

/** Reads one page's answers: [{ question, answer, files: [url] }] */
function read(interaction, page) {
  const f = interaction.fields;
  const safe = (fn, fallback) => {
    try {
      const v = fn();
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };
  return page.map(({ q, n }) => {
    const id = `q${n}`;
    const type = effectiveType(q);
    const pick = (values) => values.map((v) => q.choices[Number(v)] ?? v).join(', ');
    let answer = '';
    let files = [];
    if (type === 'short' || type === 'long') answer = safe(() => f.getTextInputValue(id), '').trim();
    else if (type === 'dropdown' || type === 'multi') answer = pick(safe(() => f.getStringSelectValues(id), []));
    else if (type === 'radio') answer = pick([safe(() => f.getRadioGroup(id), null)].filter((v) => v !== null));
    else if (type === 'checkboxes') answer = pick(safe(() => f.getCheckboxGroup(id), []));
    else if (type === 'yesno') answer = safe(() => f.getCheckbox(id), false) ? 'Yes' : 'No';
    else if (type === 'file') {
      const uploaded = safe(() => f.getUploadedFiles(id), null);
      files = uploaded ? [...uploaded.values()].map((a) => ({ url: a.url, name: a.name })) : [];
      answer = files.length ? files.map((file) => file.name).join(', ') : '';
    }
    return { question: q.text, answer, files };
  });
}

/** Turns answers into chunks that each fit in one card (Discord: 4096 characters). */
function answerBlocks(answers, max = 4000) {
  const blocks = [];
  let current = '';
  for (const { question, answer } of answers) {
    let piece = `**${question}**\n${answer || '—'}\n\n`;
    while (piece.length > max) {
      if (current) {
        blocks.push(current.trim());
        current = '';
      }
      blocks.push(piece.slice(0, max));
      piece = piece.slice(max);
    }
    if (current.length + piece.length > max) {
      blocks.push(current.trim());
      current = '';
    }
    current += piece;
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks;
}

module.exports = { TYPES, CHOICE_TYPES, MODERN, normalize, list, pages, modal, read, answerBlocks, notes, effectiveType };
