// More duels: Dots and Boxes, Mancala, Battleship, Chopsticks, Nim,
// Rock-Paper-Scissors and Memory Match.
const { duel, rand, chance, pick, lvl, shuffle } = require('./kit');

// ================================================================ Dots and Boxes
// 4x4 boxes. Lines 0-19 are horizontal (5 rows of 4), 20-39 vertical (4 rows of 5).
// Finish a box to score it and go again.
const B = 4;
const H = (r, c) => r * B + c; // r 0..4, c 0..3
const V = (r, c) => 20 + r * (B + 1) + c; // r 0..3, c 0..4
const boxLines = (r, c) => [H(r, c), H(r + 1, c), V(r, c), V(r, c + 1)];
function boxesOf(line) {
  const out = [];
  if (line < 20) {
    const r = Math.floor(line / B); const c = line % B;
    if (r > 0) out.push([r - 1, c]);
    if (r < B) out.push([r, c]);
  } else {
    const k = line - 20; const r = Math.floor(k / (B + 1)); const c = k % (B + 1);
    if (c > 0) out.push([r, c - 1]);
    if (c < B) out.push([r, c]);
  }
  return out;
}
const sides = (lines, r, c) => boxLines(r, c).filter((l) => lines[l] !== null).length;
function dbDraw(state, line, seat) {
  state.lines[line] = seat;
  let made = 0;
  for (const [r, c] of boxesOf(line)) if (sides(state.lines, r, c) === 4) { state.boxes[r * B + c] = seat; made += 1; }
  return made;
}
const dbFree = (lines) => lines.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
/** How many boxes the next player could grab in a row if this line is drawn. */
function giveaway(lines, boxes, line) {
  const s = { lines: lines.slice(), boxes: boxes.slice() };
  dbDraw(s, line, 9);
  let taken = 0;
  for (;;) {
    const grab = dbFree(s.lines).find((l) => boxesOf(l).some(([r, c]) => sides(s.lines, r, c) === 3));
    if (grab === undefined) break;
    taken += dbDraw(s, grab, 8);
  }
  return taken;
}

const dots = duel({
  id: 'dots', name: 'Dots and Boxes', icon: 'dots', blurb: 'Close a box to keep it and go again.',
  setup: () => ({ lines: Array(40).fill(null), boxes: Array(B * B).fill(null) }),
  legal: (g) => dbFree(g.lines),
  move(g, seat, move) {
    const line = Number(move);
    if (!(line >= 0 && line < 40) || g.lines[line] !== null) return 'Pick a line that isn\'t drawn yet.';
    const made = dbDraw(g, line, seat);
    g.last = line;
    if (!made) g.turn = 1 - seat;
    if (!dbFree(g.lines).length) {
      g.finished = true;
      const a = g.boxes.filter((v) => v === 0).length; const b = g.boxes.filter((v) => v === 1).length;
      if (a === b) g.draw = true; else g.winner = a > b ? 0 : 1;
    }
    return null;
  },
  botMove(g, seat, level) {
    const free = dbFree(g.lines);
    if (chance(lvl(level, 0.4, 0.05, 0))) return pick(free);
    const finishing = free.find((l) => boxesOf(l).some(([r, c]) => sides(g.lines, r, c) === 3));
    if (finishing !== undefined) return finishing;
    const safe = free.filter((l) => boxesOf(l).every(([r, c]) => sides(g.lines, r, c) < 2));
    if (safe.length) return pick(safe);
    if (level === 'easy') return pick(free);
    let best = Infinity; let choice = [];
    for (const l of free) { const n = giveaway(g.lines, g.boxes, l); if (n < best) { best = n; choice = [l]; } else if (n === best) choice.push(l); }
    return pick(choice);
  },
  view: (g) => ({ lines: g.lines, boxes: g.boxes, last: g.last ?? null, size: B, score: [g.boxes.filter((v) => v === 0).length, g.boxes.filter((v) => v === 1).length] }),
});

// ================================================================ Mancala (Kalah)
// pits 0-5 are seat 0's, 6 is seat 0's store, 7-12 seat 1's, 13 seat 1's store.
const store = (seat) => (seat === 0 ? 6 : 13);
const ownPit = (seat, i) => (seat === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
function mcSow(pits, seat, pit) {
  const p = pits.slice();
  let seeds = p[pit];
  p[pit] = 0;
  let i = pit;
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === store(1 - seat)) continue;
    p[i] += 1;
    seeds -= 1;
  }
  let again = i === store(seat);
  if (!again && ownPit(seat, i) && p[i] === 1 && p[12 - i] > 0) {
    p[store(seat)] += p[12 - i] + 1;
    p[12 - i] = 0;
    p[i] = 0;
  }
  let over = false;
  const side = (s) => (s === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
  if (side(0).every((k) => p[k] === 0) || side(1).every((k) => p[k] === 0)) {
    for (const s of [0, 1]) for (const k of side(s)) { p[store(s)] += p[k]; p[k] = 0; }
    over = true;
    again = false;
  }
  return { pits: p, again, over };
}
const mcLegal = (pits, seat) => (seat === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]).filter((k) => pits[k] > 0);
function mcSearch(pits, seat, me, depth, alpha, beta) {
  const moves = mcLegal(pits, seat);
  if (depth <= 0 || !moves.length) return pits[store(me)] - pits[store(1 - me)];
  let best = seat === me ? -Infinity : Infinity;
  for (const m of moves) {
    const { pits: next, again, over } = mcSow(pits, seat, m);
    const v = over ? (next[store(me)] - next[store(1 - me)]) * 100 : mcSearch(next, again ? seat : 1 - seat, me, depth - 1, alpha, beta);
    if (seat === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}
const mancala = duel({
  id: 'mancala', name: 'Mancala', icon: 'mancala', blurb: 'Sow seeds around the board. Biggest store wins.',
  setup: () => ({ pits: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0] }),
  legal: (g, seat) => mcLegal(g.pits, seat),
  move(g, seat, move) {
    const pit = Number(move);
    if (!mcLegal(g.pits, seat).includes(pit)) return 'Pick one of your pits with seeds in it.';
    const { pits, again, over } = mcSow(g.pits, seat, pit);
    g.pits = pits;
    g.last = pit;
    g.again = again;
    if (over) {
      g.finished = true;
      if (pits[6] === pits[13]) g.draw = true; else g.winner = pits[6] > pits[13] ? 0 : 1;
    } else if (!again) g.turn = 1 - seat;
    return null;
  },
  botMove(g, seat, level) {
    const moves = mcLegal(g.pits, seat);
    if (chance(lvl(level, 0.45, 0.08, 0))) return pick(moves);
    const depth = lvl(level, 1, 5, 8);
    let best = -Infinity; let choice = [];
    for (const m of moves) {
      const { pits, again, over } = mcSow(g.pits, seat, m);
      const v = over ? (pits[store(seat)] - pits[store(1 - seat)]) * 100 : mcSearch(pits, again ? seat : 1 - seat, seat, depth - 1, -Infinity, Infinity);
      if (v > best) { best = v; choice = [m]; } else if (v === best) choice.push(m);
    }
    return pick(choice);
  },
  view: (g) => ({ pits: g.pits, last: g.last ?? null, again: Boolean(g.again) }),
});

// ================================================================ Battleship
// 8x8, ships of 4, 3, 3 and 2 placed for you. Take turns firing; sink them all.
const SN = 8;
const SHIPS = [4, 3, 3, 2];
function placeShips() {
  const grid = Array(SN * SN).fill(-1);
  SHIPS.forEach((len, ship) => {
    for (;;) {
      const across = chance(0.5);
      const r = rand(across ? SN : SN - len + 1);
      const c = rand(across ? SN - len + 1 : SN);
      const cells = Array.from({ length: len }, (_, k) => (across ? r * SN + c + k : (r + k) * SN + c));
      if (cells.every((i) => grid[i] === -1)) { for (const i of cells) grid[i] = ship; break; }
    }
  });
  return grid;
}
const sunk = (grid, shots, ship) => grid.every((v, i) => v !== ship || shots[i]);
const bsWon = (grid, shots) => grid.every((v, i) => v === -1 || shots[i]);
const battleship = duel({
  id: 'battleship', name: 'Battleship', icon: 'battleship', blurb: 'Hunt down the hidden fleet before yours sinks.',
  setup: () => ({ fleets: [placeShips(), placeShips()], shots: [Array(SN * SN).fill(false), Array(SN * SN).fill(false)] }),
  // shots[s] = cells seat s has fired at on the OTHER fleet
  legal: (g, seat) => g.shots[seat].map((v, i) => (v ? -1 : i)).filter((i) => i >= 0),
  move(g, seat, move) {
    const i = Number(move);
    if (!(i >= 0 && i < SN * SN) || g.shots[seat][i]) return 'Pick a square you haven\'t fired at.';
    g.shots[seat][i] = true;
    const enemy = g.fleets[1 - seat];
    const hit = enemy[i] >= 0;
    g.lastShot = { seat, cell: i, hit, sank: hit && sunk(enemy, g.shots[seat], enemy[i]) ? SHIPS[enemy[i]] : 0 };
    if (bsWon(enemy, g.shots[seat])) { g.finished = true; g.winner = seat; } else g.turn = 1 - seat;
    return null;
  },
  botMove(g, seat, level) {
    const shots = g.shots[seat];
    const enemy = g.fleets[1 - seat];
    const open = shots.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (level === 'easy' && chance(0.7)) return pick(open);
    // Target mode: next to hits on ships that aren't sunk yet.
    const hits = shots.map((v, i) => (v && enemy[i] >= 0 && !sunk(enemy, shots, enemy[i]) ? i : -1)).filter((i) => i >= 0);
    const around = [];
    for (const h of hits) {
      const r = Math.floor(h / SN); const c = h % SN;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const rr = r + dr; const cc = c + dc;
        if (rr >= 0 && rr < SN && cc >= 0 && cc < SN && !shots[rr * SN + cc]) {
          // Prefer cells in line with two hits.
          const lined = hits.some((o) => o !== h && (Math.floor(o / SN) === r && dr === 0 ? true : o % SN === c && dc === 0));
          around.push({ i: rr * SN + cc, w: lined ? 2 : 1 });
        }
      }
    }
    if (around.length) { const top = Math.max(...around.map((a) => a.w)); return pick(around.filter((a) => a.w === top)).i; }
    const parity = level === 'hard' ? open.filter((i) => (Math.floor(i / SN) + (i % SN)) % 2 === 0) : open;
    return pick(parity.length ? parity : open);
  },
  view(g, seat) {
    const me = seat < 0 ? 0 : seat;
    const mask = (grid, shots, reveal) => grid.map((v, i) => (shots[i] ? (v >= 0 ? 'hit' : 'miss') : reveal && v >= 0 ? 'ship' : ''));
    const left = (s) => SHIPS.filter((_, ship) => !sunk(g.fleets[s], g.shots[1 - s], ship)).length;
    return {
      size: SN,
      mine: mask(g.fleets[me], g.shots[1 - me], seat >= 0 || g.finished),
      theirs: mask(g.fleets[1 - me], g.shots[me], g.finished),
      lastShot: g.lastShot ?? null,
      shipsLeft: [left(0), left(1)],
      viewSeat: me,
    };
  },
});

// ================================================================ Chopsticks
// Each player has two hands with 1 finger up. Tap an opponent's hand to add
// your fingers to it; 5 or more and that hand is out. Or split your fingers
// between your hands. Lose both hands and you lose.
function cpMoves(hands, seat) {
  const mine = hands[seat]; const theirs = hands[1 - seat];
  const out = [];
  for (const a of [0, 1]) for (const b of [0, 1]) if (mine[a] > 0 && theirs[b] > 0) out.push(`tap:${a}:${b}`);
  const total = mine[0] + mine[1];
  for (let left = 0; left <= total; left++) {
    const right = total - left;
    if (left > 4 || right > 4) continue;
    if ((left === mine[0] && right === mine[1]) || (left === mine[1] && right === mine[0])) continue;
    out.push(`split:${left}:${right}`);
  }
  return out;
}
function cpApply(hands, seat, move) {
  const h = [hands[0].slice(), hands[1].slice()];
  const [kind, x, y] = String(move).split(':');
  if (kind === 'tap') { const v = h[1 - seat][Number(y)] + h[seat][Number(x)]; h[1 - seat][Number(y)] = v >= 5 ? 0 : v; } else { h[seat] = [Number(x), Number(y)]; }
  return h;
}
const cpLost = (hands, seat) => hands[seat][0] === 0 && hands[seat][1] === 0;
function cpSearch(hands, seat, me, depth, seen) {
  if (cpLost(hands, me)) return -100 - depth;
  if (cpLost(hands, 1 - me)) return 100 + depth;
  if (depth <= 0) return (hands[1 - me].filter((v) => v === 0).length - hands[me].filter((v) => v === 0).length) * 10;
  const key = `${hands}|${seat}`;
  if (seen.has(key)) return 0;
  seen.add(key);
  let best = seat === me ? -Infinity : Infinity;
  for (const m of cpMoves(hands, seat)) {
    const v = cpSearch(cpApply(hands, seat, m), 1 - seat, me, depth - 1, seen);
    best = seat === me ? Math.max(best, v) : Math.min(best, v);
  }
  seen.delete(key);
  return best;
}
const chopsticks = duel({
  id: 'chopsticks', name: 'Chopsticks', icon: 'chopsticks', blurb: 'Tap hands, split fingers, knock both out.',
  setup: () => ({ hands: [[1, 1], [1, 1]] }),
  legal: (g, seat) => cpMoves(g.hands, seat),
  move(g, seat, move) {
    if (!cpMoves(g.hands, seat).includes(String(move))) return 'You can\'t do that move.';
    g.hands = cpApply(g.hands, seat, move);
    g.lastMove = { seat, move: String(move) };
    if (cpLost(g.hands, 1 - seat)) { g.finished = true; g.winner = seat; } else if (g.moves >= 79) { g.finished = true; g.draw = true; } else g.turn = 1 - seat;
    return null;
  },
  botMove(g, seat, level) {
    const moves = cpMoves(g.hands, seat);
    if (chance(lvl(level, 0.5, 0.15, 0))) return pick(moves);
    const depth = lvl(level, 2, 5, 7);
    let best = -Infinity; let choice = [];
    for (const m of moves) {
      const v = cpSearch(cpApply(g.hands, seat, m), 1 - seat, seat, depth - 1, new Set());
      if (v > best) { best = v; choice = [m]; } else if (v === best) choice.push(m);
    }
    return pick(choice);
  },
  view: (g) => ({ hands: g.hands, lastMove: g.lastMove ?? null }),
});

// ================================================================ Nim
// Three piles. Take any number from one pile. Whoever takes the last one wins.
const nim = duel({
  id: 'nim', name: 'Nim', icon: 'nim', blurb: 'Take sticks from one pile. Grab the last one to win.',
  setup: () => ({ piles: [3, 5, 7] }),
  legal: (g) => g.piles.flatMap((n, p) => Array.from({ length: n }, (_, k) => `${p}:${k + 1}`)),
  move(g, seat, move) {
    const [p, n] = String(move).split(':').map(Number);
    if (!(p >= 0 && p < 3) || !(n >= 1 && n <= g.piles[p])) return 'Take at least one stick from a single pile.';
    g.piles[p] -= n;
    g.lastMove = { seat, pile: p, took: n };
    if (g.piles.every((v) => v === 0)) { g.finished = true; g.winner = seat; } else g.turn = 1 - seat;
    return null;
  },
  botMove(g, seat, level) {
    const x = g.piles.reduce((a, b) => a ^ b, 0);
    if (x !== 0 && !chance(lvl(level, 0.6, 0.2, 0))) {
      for (let p = 0; p < 3; p++) { const target = g.piles[p] ^ x; if (target < g.piles[p]) return `${p}:${g.piles[p] - target}`; }
    }
    const piles = g.piles.map((n, p) => (n > 0 ? p : -1)).filter((p) => p >= 0);
    const p = pick(piles);
    return `${p}:${1 + rand(Math.min(g.piles[p], 3))}`;
  },
  view: (g) => ({ piles: g.piles, lastMove: g.lastMove ?? null }),
});

// ================================================================ Rock-Paper-Scissors
const RPS = ['rock', 'paper', 'scissors'];
const beats = (a, b) => (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper');
const rps = duel({
  id: 'rps', name: 'Rock Paper Scissors', icon: 'rps', blurb: 'Best of five. Pick at the same time.',
  simultaneous: true,
  thinkMs: [900, 1200],
  setup: () => ({ picks: [null, null], wins: [0, 0], rounds: [], history: [[], []] }),
  waiting: (g, seat) => g.picks[seat] === null,
  legal: () => RPS,
  move(g, seat, move) {
    const choice = String(move);
    if (!RPS.includes(choice)) return 'Pick rock, paper or scissors.';
    g.picks[seat] = choice;
    if (g.picks[0] && g.picks[1]) {
      const [a, b] = g.picks;
      const winner = a === b ? null : beats(a, b) ? 0 : 1;
      if (winner !== null) g.wins[winner] += 1;
      g.rounds.push({ picks: [a, b], winner });
      g.history[0].push(a); g.history[1].push(b);
      g.picks = [null, null];
      if (g.wins[0] >= 3 || g.wins[1] >= 3) { g.finished = true; g.winner = g.wins[0] >= 3 ? 0 : 1; }
    }
    return null;
  },
  botMove(g, seat, level) {
    if (level !== 'hard') return pick(RPS);
    const theirs = g.history[1 - seat];
    if (theirs.length < 2) return pick(RPS);
    const counts = { rock: 0, paper: 0, scissors: 0 };
    for (const c of theirs.slice(-6)) counts[c] += 1;
    const likely = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return chance(0.75) ? RPS.find((m) => beats(m, likely)) : pick(RPS);
  },
  view: (g, seat) => ({ wins: g.wins, rounds: g.rounds.slice(-5), picked: g.picks.map((p) => p !== null), myPick: seat >= 0 ? g.picks[seat] : null }),
});

// ================================================================ Memory Match
// 16 cards, 8 pairs. Flip two: a match scores and you go again.
const SYMBOLS = ['star', 'heart', 'bolt', 'moon', 'gem', 'leaf', 'note', 'drop'];
const memory = duel({
  id: 'memory', name: 'Memory Match', icon: 'memory', blurb: 'Flip two cards. Find the most pairs.',
  thinkMs: [700, 500],
  setup: () => ({ cards: shuffle([...SYMBOLS, ...SYMBOLS]), taken: Array(16).fill(null), open: [], pairs: [0, 0], seen: {} }),
  legal: (g) => (g.open.length >= 2 ? [] : g.taken.map((v, i) => (v === null && !g.open.includes(i) ? i : -1)).filter((i) => i >= 0)),
  move(g, seat, move) {
    const i = Number(move);
    if (g.open.length >= 2) return 'One moment…';
    if (!(i >= 0 && i < 16) || g.taken[i] !== null || g.open.includes(i)) return 'Pick a face-down card.';
    g.open.push(i);
    g.seen[i] = g.cards[i];
    if (g.open.length === 2) {
      const [a, b] = g.open;
      if (g.cards[a] === g.cards[b]) {
        g.taken[a] = seat; g.taken[b] = seat; g.pairs[seat] += 1; g.open = [];
        if (g.taken.every((v) => v !== null)) { g.finished = true; if (g.pairs[0] === g.pairs[1]) g.draw = true; else g.winner = g.pairs[0] > g.pairs[1] ? 0 : 1; }
      } else {
        g.pauseUntil = Date.now() + 1300;
        g.flipBack = true;
      }
    }
    return null;
  },
  tick(g, now) {
    if (g.flipBack && now >= g.pauseUntil) { g.flipBack = false; g.open = []; g.turn = 1 - g.turn; g.pauseUntil = null; return true; }
    return false;
  },
  botMove(g, seat, level) {
    const remember = lvl(level, 0.3, 0.7, 1);
    const down = g.taken.map((v, i) => (v === null && !g.open.includes(i) ? i : -1)).filter((i) => i >= 0);
    const known = Object.entries(g.seen).filter(([i]) => g.taken[i] === null && chance(remember)).map(([i, s]) => [Number(i), s]);
    if (g.open.length === 1) {
      const first = g.open[0];
      const twin = known.find(([i, s]) => i !== first && s === g.cards[first]);
      if (twin) return twin[0];
      const unseen = down.filter((i) => g.seen[i] === undefined);
      return pick(unseen.length ? unseen : down);
    }
    for (const [i, s] of known) { const twin = known.find(([j, t]) => j !== i && t === s); if (twin) return i; }
    const unseen = down.filter((i) => g.seen[i] === undefined);
    return pick(unseen.length ? unseen : down);
  },
  view: (g) => ({ faces: g.cards.map((c, i) => (g.taken[i] !== null || g.open.includes(i) ? c : null)), taken: g.taken, open: g.open, pairs: g.pairs }),
});

module.exports = { dots, mancala, battleship, chopsticks, nim, rps, memory, _test: { mcSow, cpMoves, giveaway, placeShips } };
