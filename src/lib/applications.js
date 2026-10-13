// Applications (staff, partner, anything): members fill in a form from an
// applications panel, it lands in a private review channel, staff vote
// (👍 / 🛑 veto) and someone makes the call with ✅ Accept or ❌ Decline.
// Accepting can hand out roles; the applicant gets a DM either way.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const { findCategory } = require('./resolve');
const db = require('./storage');
const questions = require('./questions');
const { embed, ephemeral, truncate, hexColor, fill, COLORS } = require('./ui');
const { form, value } = require('./forms');
const { sendLog, logEntry } = require('./log');

function store(guildId) {
  const g = db.guild(guildId);
  g.applications ??= { counter: 0, items: {} };
  return g.applications;
}

const STATUS = {
  pending: { text: '⏳ Waiting for review', color: null },
  accepted: { text: '✅ Accepted', color: COLORS.success },
  declined: { text: '❌ Declined', color: COLORS.danger },
};

/** Who can review this kind of application: its reviewer roles, or managers. */
function canReview(member, item) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild) || member.guild.ownerId === member.id) return true;
  return (item?.reviewers ?? []).some((id) => member.roles.cache.has(id));
}

/** Why this member can't apply right now, or null. */
function blocked(interaction, panel, index) {
  const item = panel.items[index];
  if (!item) return 'That application was removed.';
  if (item.open === false) return `${item.label || 'This application'} is closed right now. Check back later!`;
  if (!findCategory(interaction.guild, item.reviewCategory)) return 'This application isn\'t set up yet (it needs a review category). Let a manager know.';
  const mine = Object.values(store(interaction.guildId).items).filter((a) => a.userId === interaction.user.id && a.panelId === panel.id && a.index === index);
  if (mine.some((a) => a.status === 'pending')) return 'You already have an application waiting for review. Hang tight!';
  const lastDecline = mine.filter((a) => a.status === 'declined').sort((a, b) => b.decidedAt - a.decidedAt)[0];
  const days = Number(item.cooldownDays ?? 0);
  if (lastDecline && days > 0 && Date.now() - lastDecline.decidedAt < days * 86_400_000) {
    return `You can apply again <t:${Math.floor((lastDecline.decidedAt + days * 86_400_000) / 1000)}:R>.`;
  }
  return null;
}

function reviewCards(guild, app, item) {
  const color = STATUS[app.status].color ?? hexColor(item?.color) ?? undefined;
  const head = embed(color)
    .setTitle(truncate(`${item?.emoji ? `${item.emoji} ` : ''}${app.kind} #${app.id}`, 256))
    .setDescription(`From <@${app.userId}> (${app.tag})`)
    .addFields(
      { name: 'Status', value: STATUS[app.status].text + (app.decidedBy ? ` by <@${app.decidedBy}>` : ''), inline: true },
      { name: 'Votes', value: `👍 ${app.yes.length} · 🛑 ${app.veto.length}`, inline: true },
      { name: 'Account made', value: app.created ? `<t:${Math.floor(app.created / 1000)}:R>` : 'unknown', inline: true },
    )
    .setTimestamp(app.at);
  if (app.reason) head.addFields({ name: app.status === 'declined' ? 'Reason' : 'Note', value: truncate(app.reason, 1024) });
  const answers = questions.answerBlocks(app.answers).map((text, i) => embed(color).setTitle(i === 0 ? 'Answers' : 'Answers (continued)').setDescription(text));
  return [head, ...answers].slice(0, 10);
}

function reviewButtons(app) {
  const done = app.status !== 'pending';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pb:app:accept:${app.id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(done),
    new ButtonBuilder().setCustomId(`pb:app:decline:${app.id}`).setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(done),
    new ButtonBuilder().setCustomId(`pb:app:yes:${app.id}`).setLabel(`${app.yes.length}`).setEmoji('👍').setStyle(ButtonStyle.Secondary).setDisabled(done),
    new ButtonBuilder().setCustomId(`pb:app:veto:${app.id}`).setLabel(`Veto ${app.veto.length}`).setEmoji('🛑').setStyle(ButtonStyle.Secondary).setDisabled(done),
  );
  if (done) row.addComponents(new ButtonBuilder().setCustomId(`pb:app:delete:${app.id}`).setLabel('Delete channel').setEmoji('🗑️').setStyle(ButtonStyle.Secondary));
  return [row];
}

/** Lowercase, dash-separated text Discord accepts in a channel name. */
const slug = (text) => String(text).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** Makes the private review channel for one application, under the category. */
async function makeChannel(guild, item, app, user) {
  const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const reviewers = (item.reviewers ?? []).map((id) => guild.roles.cache.get(id)).filter(Boolean);
  const name = `${slug(item.label || 'application').slice(0, 40) || 'application'}-${slug(user.username).slice(0, 30) || app.id}`.slice(0, 100);
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: findCategory(guild, item.reviewCategory)?.id ?? null,
    topic: `${app.kind} #${app.id} from ${user.tag ?? user.username}`.slice(0, 1024),
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...reviewers.map((role) => ({ id: role.id, allow: access })),
      ...(item.applicantSees ? [{ id: user.id, allow: access }] : []),
      { id: guild.members.me.id, allow: [...access, PermissionFlagsBits.ManageChannels] },
    ],
    reason: `${app.kind} from ${user.tag ?? user.username}`,
  });
}

/** The form was filled in: post it for staff to review. */
async function submit(interaction, panel, index, answers) {
  const { guild, user } = interaction;
  const item = panel.items[index];
  if (!findCategory(guild, item.reviewCategory)) return interaction.editReply('This application isn\'t set up yet (it needs a review category). Let a manager know.');
  const st = store(guild.id);
  const app = {
    id: ++st.counter, panelId: panel.id, index, kind: item.label || 'Application', userId: user.id, tag: user.tag ?? user.username,
    created: user.createdTimestamp ?? null, answers: answers.map(({ question, answer }) => ({ question, answer })), at: Date.now(),
    status: 'pending', yes: [], veto: [],
  };
  const channel = await makeChannel(guild, item, app, user);
  app.channelId = channel.id;
  const pings = item.pingReviewers ? (item.reviewers ?? []).map((id) => `<@&${id}>`) : [];
  const sent = await channel.send({
    content: pings.length ? pings.join(' ') : undefined,
    allowedMentions: { roles: item.pingReviewers ? item.reviewers ?? [] : [] },
    embeds: reviewCards(guild, app, item),
    components: reviewButtons(app),
  });
  app.messageId = sent.id;
  st.items[app.id] = app;
  db.save();
  // Files uploaded in the form go along with it.
  const files = answers.flatMap((a) => a.files ?? []);
  for (let i = 0; i < files.length; i += 10) {
    await channel.send({ content: `📎 Files for ${app.kind} #${app.id}`, files: files.slice(i, i + 10).map((f) => ({ attachment: f.url, name: f.name })) }).catch(() => {});
  }
  return interaction.editReply(fill(item.thanks || '📝 Thanks for applying! The team will review it and you\'ll get a DM with the result.', { user, guild }));
}

async function refreshCard(guild, app) {
  const item = itemFor(guild.id, app);
  const channel = guild.channels.cache.get(app.channelId);
  const msg = await channel?.messages.fetch(app.messageId).catch(() => null);
  await msg?.edit({ embeds: reviewCards(guild, app, item), components: reviewButtons(app) }).catch(() => {});
}

function itemFor(guildId, app) {
  const panel = require('./panels').get(guildId, app.panelId);
  return panel?.items[app.index] ?? null;
}

/** Accept or decline, with the reason from the little form. */
async function decide(interaction, app, accepted, reason) {
  const { guild } = interaction;
  const item = itemFor(guild.id, app);
  app.status = accepted ? 'accepted' : 'declined';
  app.decidedBy = interaction.user.id;
  app.decidedAt = Date.now();
  app.reason = reason ?? '';
  db.save();

  const member = guild.members.cache.get(app.userId) ?? (await guild.members.fetch(app.userId).catch(() => null));
  const problems = [];
  if (accepted && member && item) {
    for (const id of item.acceptRoles ?? []) {
      const role = guild.roles.cache.get(id);
      if (role?.editable) await member.roles.add(role, `${app.kind} accepted`).catch(() => problems.push(role.name));
      else if (role) problems.push(role.name);
    }
    for (const id of item.removeRoles ?? []) {
      const role = guild.roles.cache.get(id);
      if (role?.editable && member.roles.cache.has(id)) await member.roles.remove(role, `${app.kind} accepted`).catch(() => {});
    }
  }
  const template = accepted
    ? item?.acceptMessage || '🎉 Good news! Your {application} in **{server}** was accepted.'
    : item?.declineMessage || 'Thanks for applying in **{server}**. Your {application} wasn\'t accepted this time.';
  const dmText = fill(template, { member, guild }).replaceAll('{application}', app.kind);
  const dm = embed(accepted ? COLORS.success : COLORS.danger).setDescription(truncate(`${dmText}${app.reason ? `\n\n**${accepted ? 'Note' : 'Reason'}:** ${app.reason}` : ''}`, 4096));
  const dmed = member ? await member.send({ embeds: [dm] }).then(() => true).catch(() => false) : false;

  await refreshCard(guild, app);
  const channel = guild.channels.cache.get(app.channelId);
  if (channel?.setName && !channel.name.startsWith(accepted ? '✅' : '❌')) await channel.setName(`${accepted ? '✅' : '❌'}-${channel.name}`.slice(0, 100), `${app.kind} ${app.status}`).catch(() => {});
  await sendLog(guild, logEntry({ color: accepted ? COLORS.success : COLORS.danger, user: member?.user, description: `${accepted ? '✅' : '❌'} ${app.kind} #${app.id} from <@${app.userId}> was ${app.status} by ${interaction.user}${app.reason ? `\n**Reason:** ${app.reason}` : ''}` })).catch(() => {});
  const notes = [];
  if (!member) notes.push('they\'ve left the server');
  else if (!dmed) notes.push('I couldn\'t DM them (their DMs are closed)');
  if (problems.length) notes.push(`I couldn't give ${problems.join(', ')} (my role needs to be higher)`);
  return `${accepted ? '✅ Accepted' : '❌ Declined'} ${app.kind} #${app.id}.${notes.length ? ` Heads up: ${notes.join('; ')}.` : ''}`;
}

/** Review buttons: pb:app:<accept|decline|yes|veto|reason>:<id>[:<accept|decline>] */
async function onButton(interaction, action, id, choice) {
  const app = store(interaction.guildId).items[id];
  if (!app) return interaction.reply(ephemeral('That application is gone.'));
  const item = itemFor(interaction.guildId, app);
  if (!canReview(interaction.member, item)) return interaction.reply(ephemeral('Only the reviewers for this application can do that.'));

  if (action === 'yes' || action === 'veto') {
    if (app.status !== 'pending') return interaction.reply(ephemeral('That application has already been decided.'));
    const [mine, other] = action === 'yes' ? [app.yes, app.veto] : [app.veto, app.yes];
    if (other.includes(interaction.user.id)) other.splice(other.indexOf(interaction.user.id), 1);
    if (mine.includes(interaction.user.id)) mine.splice(mine.indexOf(interaction.user.id), 1);
    else mine.push(interaction.user.id);
    db.saveSoon();
    return interaction.update({ embeds: reviewCards(interaction.guild, app, item), components: reviewButtons(app) });
  }
  if (action === 'accept' || action === 'decline') {
    if (app.status !== 'pending') return interaction.reply(ephemeral('That application has already been decided.'));
    return interaction.showModal(form(`pb:app:reason:${id}:${action}`, `${action === 'accept' ? 'Accept' : 'Decline'} ${app.kind} #${id}`.slice(0, 45), [
      { id: 'reason', label: action === 'accept' ? 'Note for them (optional)' : 'Reason (optional, they\'ll see it)', long: true, max: 1000 },
    ]));
  }
  if (action === 'delete') {
    if (app.status === 'pending') return interaction.reply(ephemeral('Accept or decline it first.'));
    const channel = interaction.guild.channels.cache.get(app.channelId);
    await interaction.reply(`🗑️ Deleting this channel in 5 seconds…`);
    setTimeout(() => channel?.delete?.(`Application #${app.id} cleaned up by ${interaction.user.tag ?? interaction.user.id}`).catch(() => {}), 5000).unref?.();
    return null;
  }
  if (action === 'reason') {
    if (app.status !== 'pending') return interaction.reply(ephemeral('That application has already been decided.'));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return interaction.editReply(await decide(interaction, app, choice === 'accept', value(interaction, 'reason')));
  }
  return null;
}

module.exports = { store, blocked, submit, decide, onButton, canReview, reviewCards, reviewButtons, STATUS, makeChannel };
