// Shared building blocks for the Pixel Arcade games in this folder.
//
// Each game file exports one or more games. A game is either:
//  - a "duel": two seats taking turns (or picking at the same time), e.g. Checkers.
//    The kit handles whose turn it is, Pixel Bot's thinking time and the winner.
//  - a "party": everyone in the room plays at once, e.g. Word Scramble.
//    The game handles its own rounds; the kit gives it timers and scoring helpers.
const crypto = require('node:crypto');

const BOT = 'pixelbot';
const rand = (n) => (n > 0 ? crypto.randomInt(n) : 0);
const chance = (p) => Math.random() < p;
const pick = (list) => list[rand(list.length)];
const lvl = (level, easy, normal, hard) => ({ easy, normal, hard }[level] ?? normal);
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Adds to a player's arcade score (and a win, when they won). */
function credit(r, id, points, win = false) {
  const p = r.players.get(id);
  if (!p) return;
  p.score += Math.max(0, Math.round(points));
  if (win) p.wins += 1;
}

// ---------------------------------------------------------------- duels
/**
 * def: { id, name, icon, blurb, setup(level) -> fields, move(g, seat, move) -> error|null,
 *        botMove(g, seat, level) -> move, view?(g, seat) -> fields, legal?(g, seat) -> [moves],
 *        simultaneous?: bool, waiting?(g, seat) -> bool (simultaneous: does this seat still need to pick?),
 *        tick?(g, now) -> bool, thinkMs?: [min, extra] }
 * A move sets g.finished and g.winner (seat) or g.draw when the game ends.
 */
function duel(def) {
  return {
    ...def,
    mode: 'duel',
    players: def.players ?? '2 players',
    create(r, { seats, level }) {
      return { type: def.id, seats, turn: 0, winner: null, draw: false, finished: false, level, moves: 0, ...def.setup(level, seats) };
    },
    act(r, g, userId, move) {
      if (g.finished) return 'The game is over.';
      const seat = g.seats.indexOf(userId);
      if (seat < 0) return 'You\'re watching this one.';
      if (!def.simultaneous && seat !== g.turn) return 'Wait for your turn.';
      if (def.simultaneous && def.waiting && !def.waiting(g, seat)) return 'You already picked. Waiting for the other player…';
      if (g.pauseUntil && Date.now() < g.pauseUntil) return 'One moment…';
      const error = def.move(g, seat, move);
      if (error) return error;
      g.moves += 1;
      g.botAt = null;
      settle(r, g);
      return null;
    },
    tick(r, g, now) {
      let changed = false;
      if (def.tick && !g.finished && def.tick(g, now)) { changed = true; settle(r, g); }
      const seat = g.seats.indexOf(BOT);
      if (g.finished || seat < 0 || !r.players.has(BOT)) return changed;
      if (g.pauseUntil && now < g.pauseUntil) return changed;
      const myTurn = def.simultaneous ? (def.waiting ? def.waiting(g, seat) : true) : g.turn === seat;
      if (!myTurn) return changed;
      const [min, extra] = def.thinkMs ?? [550, 600];
      if (!g.botAt) { g.botAt = now + min + rand(extra); return changed; }
      if (now < g.botAt) return changed;
      g.botAt = null;
      let move;
      try { move = def.botMove(g, seat, g.level); } catch (e) { move = undefined; }
      let error = move === undefined ? 'no move' : def.move(g, seat, move);
      if (error && def.legal) { // never get stuck: fall back to any legal move
        const options = def.legal(g, seat);
        if (options.length) error = def.move(g, seat, pick(options));
      }
      if (!error) { g.moves += 1; settle(r, g); }
      return true;
    },
    view(g, userId) {
      const seat = g.seats.indexOf(userId);
      const base = { seats: g.seats, turn: g.turn, winner: g.winner, draw: g.draw, mySeat: seat };
      if (def.legal && !g.finished && (def.simultaneous || seat === g.turn) && seat >= 0) base.legal = def.legal(g, seat);
      return { ...base, ...(def.view ? def.view(g, seat) : {}) };
    },
    rematch(r, g) {
      const next = this.create(r, { seats: [g.seats[1], g.seats[0]], level: g.level });
      return next;
    },
  };
}

function settle(r, g) {
  if (!g.finished || g.credited) return;
  g.credited = true;
  if (g.winner !== null && g.winner !== undefined) credit(r, g.seats[g.winner], 10, true);
}

// ---------------------------------------------------------------- parties
/**
 * def: { id, name, icon, blurb, create(r, { level, people }) -> g, act(r, g, userId, move) -> error|null,
 *        tick?(r, g, now) -> bool, bot?(r, g, now) -> bool, view(g, userId, r) -> fields }
 * People: everyone in the room when it starts (plus Pixel Bot if picked). Late joiners can join in
 * where the game allows (people()).
 */
function party(def) {
  return {
    ...def,
    mode: 'party',
    players: def.players ?? 'Everyone',
    create(r, opts) {
      return { type: def.id, finished: false, level: opts.level, people: [...r.players.keys()], ...def.create(r, opts) };
    },
    tick(r, g, now) {
      if (g.finished) return false;
      let changed = false;
      if (def.tick && def.tick(r, g, now)) changed = true;
      if (!g.finished && r.players.has(BOT) && def.bot && def.bot(r, g, now)) changed = true;
      return changed;
    },
    rematch(r, g) { return this.create(r, { level: g.level }); },
  };
}

/** Ends a party game: winners get a win, everyone gets their points. scores: { id: points } */
function finishParty(r, g, scores, { divide = 1 } = {}) {
  if (g.finished) return;
  g.finished = true;
  g.phase = 'done';
  g.final = scores;
  const top = Math.max(0, ...Object.values(scores));
  for (const [id, pts] of Object.entries(scores)) credit(r, id, pts / divide, top > 0 && pts === top);
}

/** Everyone currently in the room who is playing this game (joiners count too). */
const people = (r, g) => [...r.players.keys()].filter((id) => g.people.includes(id) || !g.closed);

module.exports = { BOT, rand, chance, pick, lvl, shuffle, credit, duel, party, finishParty, people };
