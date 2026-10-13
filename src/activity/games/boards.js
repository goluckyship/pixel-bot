// Board duels: Checkers, Reversi, Gomoku and Ultimate Tic-Tac-Toe.
const { duel, rand, chance, pick, lvl } = require('./kit');

// ================================================================ Checkers
// 8x8, played on dark squares. Seat 0 starts at the bottom and moves up.
// Captures are compulsory; a piece keeps jumping while it can. Reaching the
// far row makes a king (which ends the move).
const N = 8;
const dark = (i) => ((Math.floor(i / N) + (i % N)) % 2 === 1);
const rc = (i) => [Math.floor(i / N), i % N];
const idx = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1);

function ckSetup() {
  const board = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if (!dark(i)) continue;
    const [r] = rc(i);
    if (r <= 2) board[i] = { s: 1, k: false };
    if (r >= 5) board[i] = { s: 0, k: false };
  }
  return { board, chain: null, quiet: 0 };
}

function ckDirs(p) {
  if (p.k) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return p.s === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function ckPieceMoves(board, i) {
  const p = board[i];
  const [r, c] = rc(i);
  const jumps = [];
  const steps = [];
  for (const [dr, dc] of ckDirs(p)) {
    const a = idx(r + dr, c + dc);
    if (a < 0) continue;
    if (board[a] === null) steps.push({ from: i, to: a });
    else if (board[a].s !== p.s) {
      const b = idx(r + 2 * dr, c + 2 * dc);
      if (b >= 0 && board[b] === null) jumps.push({ from: i, to: b, cap: a });
    }
  }
  return { jumps, steps };
}

function ckMoves(board, seat, chain) {
  if (chain !== null && chain !== undefined) return ckPieceMoves(board, chain).jumps;
  let jumps = [];
  let steps = [];
  for (let i = 0; i < 64; i++) {
    if (board[i]?.s !== seat) continue;
    const m = ckPieceMoves(board, i);
    jumps = jumps.concat(m.jumps);
    steps = steps.concat(m.steps);
  }
  return jumps.length ? jumps : steps;
}

/** Applies one step. Returns { more: bool } (true if the same piece must keep jumping). */
function ckApply(state, m) {
  const p = state.board[m.from];
  state.board[m.to] = p;
  state.board[m.from] = null;
  if (m.cap !== undefined) state.board[m.cap] = null;
  const [r] = rc(m.to);
  let crowned = false;
  if (!p.k && ((p.s === 0 && r === 0) || (p.s === 1 && r === N - 1))) { state.board[m.to] = { ...p, k: true }; crowned = true; }
  if (m.cap !== undefined && !crowned && ckPieceMoves(state.board, m.to).jumps.length) { state.chain = m.to; return { more: true }; }
  state.chain = null;
  return { more: false };
}

const ckKey = (m) => `${m.from}-${m.to}`;

function ckEval(board, me) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const [r, c] = rc(i);
    let v = p.k ? 1.7 : 1 + (p.s === 0 ? (7 - r) : r) * 0.04;
    if (c === 0 || c === 7) v += 0.05;
    s += p.s === me ? v : -v;
  }
  return s;
}

function ckSearch(state, seat, me, depth, alpha, beta) {
  const moves = ckMoves(state.board, seat, state.chain);
  if (!moves.length) return seat === me ? -100 - depth : 100 + depth;
  if (depth <= 0) return ckEval(state.board, me);
  let best = seat === me ? -Infinity : Infinity;
  for (const m of moves) {
    const next = { board: state.board.slice(), chain: state.chain };
    const { more } = ckApply(next, m);
    const v = ckSearch(next, more ? seat : 1 - seat, me, more ? depth : depth - 1, alpha, beta);
    if (seat === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

const checkers = duel({
  id: 'checkers', name: 'Checkers', icon: 'checkers', blurb: 'Jump every piece. Captures are a must!',
  setup: ckSetup,
  legal: (g, seat) => ckMoves(g.board, seat, g.chain).map(ckKey),
  move(g, seat, move) {
    const options = ckMoves(g.board, seat, g.chain);
    const m = options.find((o) => ckKey(o) === String(move));
    if (!m) return options.some((o) => o.cap !== undefined) ? 'You have to jump when you can.' : 'You can\'t move there.';
    const { more } = ckApply(g, m);
    g.last = [m.from, m.to];
    g.quiet = m.cap !== undefined ? 0 : g.quiet + 1;
    if (!more) g.turn = 1 - seat;
    if (!ckMoves(g.board, g.turn, g.chain).length) { g.finished = true; g.winner = 1 - g.turn; } else if (g.quiet >= 80) { g.finished = true; g.draw = true; }
    return null;
  },
  botMove(g, seat, level) {
    const moves = ckMoves(g.board, seat, g.chain);
    if (chance(lvl(level, 0.45, 0.1, 0))) return ckKey(pick(moves));
    const depth = lvl(level, 1, 3, 5);
    let best = -Infinity;
    let choice = [];
    for (const m of moves) {
      const next = { board: g.board.slice(), chain: g.chain };
      const { more } = ckApply(next, m);
      const v = ckSearch(next, more ? seat : 1 - seat, seat, more ? depth : depth - 1, -Infinity, Infinity);
      if (v > best + 1e-9) { best = v; choice = [m]; } else if (Math.abs(v - best) < 1e-9) choice.push(m);
    }
    return ckKey(pick(choice));
  },
  view: (g) => ({ board: g.board, chain: g.chain, last: g.last ?? null }),
});

// ================================================================ Reversi
const RW = [
  100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, 1, 1, 1, 1, -2, 10, 5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5, 10, -2, 1, 1, 1, 1, -2, 10, -20, -50, -2, -2, -2, -2, -50, -20, 100, -20, 10, 5, 5, 10, -20, 100,
];
const DIRS8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function rvFlips(board, i, seat) {
  if (board[i] !== null) return [];
  const [r, c] = rc(i);
  let all = [];
  for (const [dr, dc] of DIRS8) {
    const line = [];
    let k = 1;
    for (;;) {
      const j = idx(r + dr * k, c + dc * k);
      if (j < 0 || board[j] === null) { line.length = 0; break; }
      if (board[j] === seat) break;
      line.push(j);
      k += 1;
    }
    if (line.length) all = all.concat(line);
  }
  return all;
}
const rvLegal = (board, seat) => board.map((_, i) => i).filter((i) => rvFlips(board, i, seat).length);
function rvPlay(board, i, seat) {
  const b = board.slice();
  for (const j of rvFlips(board, i, seat)) b[j] = seat;
  b[i] = seat;
  return b;
}
function rvEval(b, me) {
  let s = 0;
  for (let i = 0; i < 64; i++) if (b[i] !== null) s += b[i] === me ? RW[i] : -RW[i];
  return s + (rvLegal(b, me).length - rvLegal(b, 1 - me).length) * 3;
}
function rvSearch(b, seat, me, depth, alpha, beta) {
  const moves = rvLegal(b, seat);
  if (!moves.length) {
    if (!rvLegal(b, 1 - seat).length) {
      const diff = b.filter((v) => v === me).length - b.filter((v) => v === 1 - me).length;
      return diff * 1000;
    }
    return rvSearch(b, 1 - seat, me, depth - 1, alpha, beta);
  }
  if (depth <= 0) return rvEval(b, me);
  let best = seat === me ? -Infinity : Infinity;
  for (const m of moves) {
    const v = rvSearch(rvPlay(b, m, seat), 1 - seat, me, depth - 1, alpha, beta);
    if (seat === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

const reversi = duel({
  id: 'reversi', name: 'Reversi', icon: 'reversi', blurb: 'Trap discs to flip them. Most discs wins.',
  setup() {
    const board = Array(64).fill(null);
    board[27] = 1; board[28] = 0; board[35] = 0; board[36] = 1;
    return { board, passed: false };
  },
  legal: (g, seat) => rvLegal(g.board, seat),
  move(g, seat, move) {
    const i = Number(move);
    if (!rvFlips(g.board, i, seat).length) return 'That square doesn\'t flip anything.';
    g.board = rvPlay(g.board, i, seat);
    g.last = i;
    g.passed = false;
    if (rvLegal(g.board, 1 - seat).length) g.turn = 1 - seat;
    else if (rvLegal(g.board, seat).length) { g.turn = seat; g.passed = true; } // the other player has to pass
    else {
      g.finished = true;
      const a = g.board.filter((v) => v === 0).length;
      const b = g.board.filter((v) => v === 1).length;
      if (a === b) g.draw = true; else g.winner = a > b ? 0 : 1;
    }
    return null;
  },
  botMove(g, seat, level) {
    const moves = rvLegal(g.board, seat);
    if (chance(lvl(level, 0.5, 0.12, 0))) return pick(moves);
    const depth = lvl(level, 1, 2, 3);
    let best = -Infinity;
    let choice = [];
    for (const m of moves) {
      const v = rvSearch(rvPlay(g.board, m, seat), 1 - seat, seat, depth - 1, -Infinity, Infinity);
      if (v > best) { best = v; choice = [m]; } else if (v === best) choice.push(m);
    }
    return pick(choice);
  },
  view: (g) => ({ board: g.board, last: g.last ?? null, passed: g.passed, counts: [g.board.filter((v) => v === 0).length, g.board.filter((v) => v === 1).length] }),
});

// ================================================================ Gomoku
const GN = 13;
function gmLine(board, i, seat) {
  const r = Math.floor(i / GN);
  const c = i % GN;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const s of [1, -1]) {
      let k = 1;
      for (;;) {
        const rr = r + dr * k * s;
        const cc = c + dc * k * s;
        if (rr < 0 || rr >= GN || cc < 0 || cc >= GN || board[rr * GN + cc] !== seat) break;
        cells.push(rr * GN + cc);
        k += 1;
      }
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

function gmScoreCell(board, i, seat) {
  const r = Math.floor(i / GN);
  const c = i % GN;
  let total = 0;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1;
    let open = 0;
    for (const s of [1, -1]) {
      let k = 1;
      for (;;) {
        const rr = r + dr * k * s;
        const cc = c + dc * k * s;
        if (rr < 0 || rr >= GN || cc < 0 || cc >= GN) break;
        const v = board[rr * GN + cc];
        if (v === seat) { count += 1; k += 1; continue; }
        if (v === null) open += 1;
        break;
      }
    }
    if (count >= 5) total += 100000;
    else if (count === 4) total += open === 2 ? 10000 : open === 1 ? 1200 : 0;
    else if (count === 3) total += open === 2 ? 900 : open === 1 ? 120 : 0;
    else if (count === 2) total += open === 2 ? 60 : open === 1 ? 12 : 0;
    else total += open;
  }
  return total;
}

const gomoku = duel({
  id: 'gomoku', name: 'Gomoku', icon: 'gomoku', blurb: 'Get five in a row on a big board.',
  setup: () => ({ board: Array(GN * GN).fill(null), line: [] }),
  move(g, seat, move) {
    const i = Number(move);
    if (!(i >= 0 && i < GN * GN) || g.board[i] !== null) return 'Pick an empty spot.';
    g.board[i] = seat;
    g.last = i;
    const line = gmLine(g.board, i, seat);
    if (line) { g.finished = true; g.winner = seat; g.line = line; } else if (g.board.every((v) => v !== null)) { g.finished = true; g.draw = true; } else g.turn = 1 - seat;
    return null;
  },
  botMove(g, seat, level) {
    const empty = g.board.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (empty.length === GN * GN) return Math.floor((GN * GN) / 2);
    const near = empty.filter((i) => {
      const r = Math.floor(i / GN); const c = i % GN;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr; const cc = c + dc; if (rr >= 0 && rr < GN && cc >= 0 && cc < GN && g.board[rr * GN + cc] !== null) return true; }
      return false;
    });
    const defend = lvl(level, 0.6, 0.95, 1.05);
    const scored = near.map((i) => ({ i, s: gmScoreCell(g.board, i, seat) + gmScoreCell(g.board, i, 1 - seat) * defend })).sort((a, b) => b.s - a.s);
    const top = lvl(level, 6, 2, 1);
    if (level === 'easy' && chance(0.25)) return pick(near);
    return pick(scored.slice(0, top)).i;
  },
  view: (g) => ({ board: g.board, last: g.last ?? null, line: g.line, size: GN }),
});

// ================================================================ Ultimate Tic-Tac-Toe
// 9 small boards. Where you play inside a small board sends your opponent to
// that board next. Win three small boards in a row to win.
const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const small = (cells, b) => cells.slice(b * 9, b * 9 + 9);
function lineWinner(arr) {
  for (const [a, b, c] of L3) if (arr[a] !== null && arr[a] !== 'd' && arr[a] === arr[b] && arr[a] === arr[c]) return arr[a];
  return null;
}
function utLegal(g) {
  const boards = g.forced !== null && g.big[g.forced] === null ? [g.forced] : [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => g.big[b] === null);
  const out = [];
  for (const b of boards) for (let k = 0; k < 9; k++) if (g.cells[b * 9 + k] === null) out.push(b * 9 + k);
  return out;
}
function utPlay(g, i, seat) {
  g.cells[i] = seat;
  const b = Math.floor(i / 9);
  const w = lineWinner(small(g.cells, b));
  if (w !== null) g.big[b] = w;
  else if (small(g.cells, b).every((v) => v !== null)) g.big[b] = 'd';
  const next = i % 9;
  g.forced = g.big[next] === null ? next : null;
}
function utScore(g, me) {
  const w = lineWinner(g.big);
  if (w !== null) return w === me ? 1000 : -1000;
  let s = 0;
  for (let b = 0; b < 9; b++) {
    if (g.big[b] === me) s += b === 4 ? 30 : 20;
    else if (g.big[b] === 1 - me) s -= b === 4 ? 30 : 20;
    else if (g.big[b] === null) {
      const cells = small(g.cells, b);
      for (const line of L3) {
        const vals = line.map((k) => cells[k]);
        const mine = vals.filter((v) => v === me).length;
        const theirs = vals.filter((v) => v === 1 - me).length;
        if (mine === 2 && !theirs) s += 4;
        if (theirs === 2 && !mine) s -= 4;
      }
    }
  }
  return s;
}
function utSearch(g, seat, me, depth, alpha, beta) {
  const w = lineWinner(g.big);
  if (w !== null) return w === me ? 1000 + depth : -1000 - depth;
  const moves = utLegal(g);
  if (!moves.length) return 0;
  if (depth <= 0) return utScore(g, me);
  let best = seat === me ? -Infinity : Infinity;
  for (const m of moves) {
    const next = { cells: g.cells.slice(), big: g.big.slice(), forced: g.forced };
    utPlay(next, m, seat);
    const v = utSearch(next, 1 - seat, me, depth - 1, alpha, beta);
    if (seat === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

const ultimate = duel({
  id: 'ultimate', name: 'Ultimate Tic-Tac-Toe', icon: 'ultimate', blurb: 'Nine boards in one. Your move picks their board.',
  setup: () => ({ cells: Array(81).fill(null), big: Array(9).fill(null), forced: null }),
  legal: (g) => utLegal(g),
  move(g, seat, move) {
    const i = Number(move);
    if (!utLegal(g).includes(i)) return g.forced !== null ? 'You have to play in the highlighted board.' : 'Pick an empty square.';
    utPlay(g, i, seat);
    g.last = i;
    const w = lineWinner(g.big);
    if (w !== null) { g.finished = true; g.winner = w; } else if (!utLegal(g).length) { g.finished = true; g.draw = true; } else g.turn = 1 - seat;
    return null;
  },
  botMove(g, seat, level) {
    const moves = utLegal(g);
    if (chance(lvl(level, 0.5, 0.1, 0))) return pick(moves);
    const depth = lvl(level, 1, 2, 3);
    let best = -Infinity;
    let choice = [];
    for (const m of moves) {
      const next = { cells: g.cells.slice(), big: g.big.slice(), forced: g.forced };
      utPlay(next, m, seat);
      const v = utSearch(next, 1 - seat, seat, depth - 1, -Infinity, Infinity);
      if (v > best) { best = v; choice = [m]; } else if (v === best) choice.push(m);
    }
    return pick(choice);
  },
  view: (g) => ({ cells: g.cells, big: g.big, forced: g.forced, last: g.last ?? null }),
});

module.exports = { checkers, reversi, gomoku, ultimate, _test: { ckMoves, ckApply, rvLegal, gmLine, utLegal } };
