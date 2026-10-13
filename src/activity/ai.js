// Pixel Bot's brain for the arcade games. Three levels: easy, normal, hard.
const crypto = require('node:crypto');

const LEVELS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const rand = (n) => crypto.randomInt(n);
const chance = (p) => Math.random() < p;
const pickRandom = (list) => list[rand(list.length)];

// ---------- tic-tac-toe: perfect play with minimax ----------
const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const tttWinner = (b) => { for (const [a, c, d] of LINES3) if (b[a] !== null && b[a] === b[c] && b[a] === b[d]) return b[a]; return null; };

function tttMinimax(b, turn, me, depth) {
  const w = tttWinner(b);
  if (w !== null) return w === me ? 10 - depth : depth - 10;
  if (b.every((v) => v !== null)) return 0;
  let best = turn === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== null) continue;
    b[i] = turn;
    const score = tttMinimax(b, 1 - turn, me, depth + 1);
    b[i] = null;
    best = turn === me ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

function tttMove(board, me, level) {
  const empty = board.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const sloppy = { easy: 0.6, normal: 0.25, hard: 0 }[level] ?? 0.25;
  if (chance(sloppy)) return pickRandom(empty);
  let best = -Infinity;
  let moves = [];
  for (const i of empty) {
    const b = [...board];
    b[i] = me;
    const s = tttMinimax(b, 1 - me, me, 1);
    if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i);
  }
  return pickRandom(moves);
}

// ---------- connect four: alpha-beta search ----------
const COLS = 7;
const ROWS = 6;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const at = (b, c, r) => b[r * COLS + c];

function c4Winner(b) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = at(b, c, r);
      if (v === null) continue;
      if (c + 3 < COLS && v === at(b, c + 1, r) && v === at(b, c + 2, r) && v === at(b, c + 3, r)) return v;
      if (r + 3 < ROWS && v === at(b, c, r + 1) && v === at(b, c, r + 2) && v === at(b, c, r + 3)) return v;
      if (c + 3 < COLS && r + 3 < ROWS && v === at(b, c + 1, r + 1) && v === at(b, c + 2, r + 2) && v === at(b, c + 3, r + 3)) return v;
      if (c + 3 < COLS && r - 3 >= 0 && v === at(b, c + 1, r - 1) && v === at(b, c + 2, r - 2) && v === at(b, c + 3, r - 3)) return v;
    }
  }
  return null;
}

const validCols = (b) => ORDER.filter((c) => b[c] === null);
function drop(b, col, v) {
  for (let r = ROWS - 1; r >= 0; r--) {
    const i = r * COLS + col;
    if (b[i] === null) { b[i] = v; return i; }
  }
  return -1;
}

function scoreWindow(cells, me) {
  const mine = cells.filter((v) => v === me).length;
  const theirs = cells.filter((v) => v === 1 - me).length;
  const empty = cells.filter((v) => v === null).length;
  if (mine === 4) return 1000;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  if (theirs === 2 && empty === 2) return -1;
  return 0;
}

function c4Evaluate(b, me) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (at(b, 3, r) === me) s += 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) s += scoreWindow([0, 1, 2, 3].map((k) => at(b, c + k, r)), me);
      if (r + 3 < ROWS) s += scoreWindow([0, 1, 2, 3].map((k) => at(b, c, r + k)), me);
      if (c + 3 < COLS && r + 3 < ROWS) s += scoreWindow([0, 1, 2, 3].map((k) => at(b, c + k, r + k)), me);
      if (c + 3 < COLS && r - 3 >= 0) s += scoreWindow([0, 1, 2, 3].map((k) => at(b, c + k, r - k)), me);
    }
  }
  return s;
}

function alphabeta(b, depth, alpha, beta, turn, me) {
  const w = c4Winner(b);
  if (w !== null) return w === me ? 100000 + depth : -100000 - depth;
  const moves = validCols(b);
  if (!moves.length) return 0;
  if (depth === 0) return c4Evaluate(b, me);
  if (turn === me) {
    let best = -Infinity;
    for (const col of moves) {
      const i = drop(b, col, turn);
      best = Math.max(best, alphabeta(b, depth - 1, alpha, beta, 1 - turn, me));
      b[i] = null;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const col of moves) {
    const i = drop(b, col, turn);
    best = Math.min(best, alphabeta(b, depth - 1, alpha, beta, 1 - turn, me));
    b[i] = null;
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function c4Move(board, me, level) {
  const moves = validCols(board);
  const sloppy = { easy: 0.35, normal: 0.08, hard: 0 }[level] ?? 0.08;
  const depth = { easy: 2, normal: 4, hard: 5 }[level] ?? 4;
  if (chance(sloppy)) return pickRandom(moves);
  const b = [...board];
  let best = -Infinity;
  let choices = [];
  for (const col of moves) {
    const i = drop(b, col, me);
    const s = alphabeta(b, depth - 1, -Infinity, Infinity, 1 - me, me);
    b[i] = null;
    if (s > best) { best = s; choices = [col]; } else if (s === best) choices.push(col);
  }
  return pickRandom(choices);
}

// ---------- trivia & reaction ----------
const triviaAccuracy = (level) => ({ easy: 0.45, normal: 0.7, hard: 0.9 }[level] ?? 0.7);
const triviaDelay = (level) => ({ easy: 5000 + rand(7000), normal: 3000 + rand(6000), hard: 1500 + rand(4000) }[level] ?? 3000 + rand(6000));
const reactionMs = (level) => ({ easy: 420 + rand(260), normal: 300 + rand(140), hard: 215 + rand(90) }[level] ?? 300 + rand(140));

module.exports = { LEVELS, tttMove, c4Move, c4Winner, triviaAccuracy, triviaDelay, reactionMs };
