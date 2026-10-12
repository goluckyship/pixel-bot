// Turns text like "10m", "2h 30m" or "3 days" into milliseconds, and back.
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const UNIT_WORDS = {
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  d: ['d', 'day', 'days'],
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
};

function unitFor(word) {
  return Object.keys(UNIT_WORDS).find((unit) => UNIT_WORDS[unit].includes(word)) ?? null;
}

/** Returns milliseconds, or null if the text isn't a valid duration. */
function parseDuration(input) {
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return null;

  let total = 0;
  const leftover = text.replace(/(\d+)\s*([a-z]+)/g, (match, amount, word) => {
    const unit = unitFor(word);
    if (!unit) return match; // unknown unit: leave it so the check below fails
    total += Number(amount) * UNIT_MS[unit];
    return '';
  });

  // Anything left other than spaces, commas or "and" means we didn't understand it.
  if (leftover.replace(/and|[\s,]/g, '') !== '') return null;
  return total > 0 && Number.isSafeInteger(total) ? total : null;
}

/** 5400000 -> "1 hour 30 minutes" */
function formatDuration(ms) {
  const parts = [];
  let rest = ms;
  for (const [unit, label] of [['w', 'week'], ['d', 'day'], ['h', 'hour'], ['m', 'minute'], ['s', 'second']]) {
    const count = Math.floor(rest / UNIT_MS[unit]);
    if (count > 0) {
      parts.push(`${count} ${label}${count === 1 ? '' : 's'}`);
      rest -= count * UNIT_MS[unit];
    }
  }
  return parts.length ? parts.join(' ') : 'less than a second';
}

module.exports = { parseDuration, formatDuration };
