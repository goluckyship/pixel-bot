// Turns "in 2h", "18:30", "6:30pm", "tomorrow 9am" or "2026-10-20 18:30" into a time,
// read in the server's time zone (timezone in src/config.js).
const { parseDuration } = require('./duration');

/** Wall-clock parts of a moment in a time zone. */
function partsIn(timeZone, ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** The moment when the wall clock in `timeZone` shows the given date and time. */
function zonedToUtc(timeZone, year, month, day, hour, minute) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = partsIn(timeZone, guess);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += target - shown;
  }
  return guess;
}

/** "6:30pm" / "18:30" / "9am" -> { hour, minute } or null. */
function parseClock(text) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const half = match[3]?.toLowerCase();
  if (!half && match[2] === undefined) return null; // a bare number like "18" is too ambiguous
  if (half) {
    if (hour < 1 || hour > 12) return null;
    if (half === 'am' && hour === 12) hour = 0;
    if (half === 'pm' && hour !== 12) hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Returns a timestamp (ms) in the future, or null if the text isn't understood. */
function parseWhen(input, timeZone, now = Date.now()) {
  let text = String(input ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;

  const relative = parseDuration(text.replace(/^in /, ''));
  if (relative) return now + relative;

  const today = partsIn(timeZone, now);
  let date = null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2}) (.+)$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))? (.+)$/.exec(text);
  if (iso) {
    date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    text = iso[4];
  } else if (us) {
    date = { year: Number(us[3] ?? today.year), month: Number(us[1]), day: Number(us[2]) };
    text = us[4];
  } else if (text.startsWith('tomorrow ')) {
    const t = partsIn(timeZone, now + 86_400_000);
    date = { year: t.year, month: t.month, day: t.day };
    text = text.slice('tomorrow '.length);
  } else if (text.startsWith('today ')) {
    text = text.slice('today '.length);
  }

  const clock = parseClock(text.replace(/^at /, ''));
  if (!clock) return null;

  if (date) {
    if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null;
    const at = zonedToUtc(timeZone, date.year, date.month, date.day, clock.hour, clock.minute);
    const check = partsIn(timeZone, at);
    if (check.day !== date.day) return null; // e.g. February 31st
    return at > now ? at : null;
  }
  // Just a time: today if it's still ahead, otherwise tomorrow.
  let at = zonedToUtc(timeZone, today.year, today.month, today.day, clock.hour, clock.minute);
  if (at <= now) {
    const t = partsIn(timeZone, now + 86_400_000);
    at = zonedToUtc(timeZone, t.year, t.month, t.day, clock.hour, clock.minute);
  }
  return at;
}

/** Same wall-clock time `days` later (keeps the hour right across daylight saving changes). */
function addDays(ms, days, timeZone) {
  const p = partsIn(timeZone, ms);
  const shifted = partsIn(timeZone, Date.UTC(p.year, p.month - 1, p.day + days, 12));
  const withinMinute = ((ms % 60_000) + 60_000) % 60_000; // keep the seconds part too
  return zonedToUtc(timeZone, shifted.year, shifted.month, shifted.day, p.hour, p.minute) + withinMinute;
}

module.exports = { parseWhen, addDays, zonedToUtc, partsIn };
