// Emoji helpers shared by panels, buttons and the dashboard.

/** A normal emoji like 🔴, or a server emoji like <:pixel:123...>. */
function isEmoji(text) {
  return (
    /^<a?:\w{2,32}:\d{17,20}>$/.test(text) ||
    (/^[\p{Extended_Pictographic}\p{Regional_Indicator}‍️⃣#*0-9\p{Emoji_Modifier}]+$/u.test(text) &&
      /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(text))
  );
}

/**
 * Turns what someone typed into an emoji Discord accepts.
 * Accepts 🔴, <:name:id>, or :name: / name for one of this server's emojis.
 * Returns { emoji } (null when blank) or { error }.
 */
function resolveEmoji(guild, input) {
  const text = String(input ?? '').trim();
  if (!text) return { emoji: null };
  if (isEmoji(text)) return { emoji: text };
  const name = /^:?(\w{2,32}):?$/.exec(text)?.[1];
  const found = name && guild?.emojis?.cache?.find?.((e) => e.name === name || e.name?.toLowerCase() === name.toLowerCase());
  if (found) return { emoji: `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>` };
  return { error: `"${text}" isn't an emoji. Use a normal emoji like 🔴, or the name of one of this server's emojis like :pixel:.` };
}

module.exports = { isEmoji, resolveEmoji };
