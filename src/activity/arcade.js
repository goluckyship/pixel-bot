// Pixel Arcade: the game rooms behind Pixel Bot's Discord Activity.
// One room per activity session (Discord's instance_id). Everyone in the
// session shares the room; the server decides who won, so nobody can cheat
// from their own screen.
const crypto = require('node:crypto');
const QUESTIONS = require('./trivia');
const ai = require('./ai');
const MODS = require('./games').GAMES; // the 26 newer games (src/activity/games)

const BOT = 'pixelbot'; // Pixel Bot's player id when you play against it

const GAMES = {
  tictactoe: { name: 'Tic-Tac-Toe', icon: 'ttt', players: '2 players', blurb: 'Three in a row wins.', mode: 'duel' },
  connect4: { name: 'Connect Four', icon: 'c4', players: '2 players', blurb: 'Drop discs, get four in a line.', mode: 'duel' },
  trivia: { name: 'Trivia Party', icon: 'trivia', players: 'Everyone', blurb: '10 questions. Fast right answers score more.', mode: 'party' },
  reaction: { name: 'Reaction Race', icon: 'bolt', players: 'Everyone', blurb: 'Click the moment it turns green. Too early is a foul!', mode: 'party' },
};
for (const m of Object.values(MODS)) GAMES[m.id] = { name: m.name, icon: m.icon, players: m.players, blurb: m.blurb, mode: m.mode };

const rooms = new Map();
const SEEN_TIMEOUT = 35_000; // a player who stops checking in for this long has left

function room(id) {
  let r = rooms.get(id);
  if (!r) {
    r = { id, players: new Map(), game: null, version: 1, waiters: new Set(), created: Date.now(), touched: Date.now() };
    rooms.set(id, r);
  }
  r.touched = Date.now();
  return r;
}

function bump(r) {
  r.version += 1;
  for (const wake of r.waiters) wake();
  r.waiters.clear();
}

function join(r, user) {
  const p = r.players.get(user.id);
  if (p) {
    p.lastSeen = Date.now();
    p.name = user.username;
    return p;
  }
  const used = new Set([...r.players.values()].map((x) => x.color));
  used.add('#7db4ee');
  const color = COLORS.find((c) => !used.has(c)) ?? colorFor(user.id);
  const player = { id: user.id, name: user.username, color, score: 0, wins: 0, lastSeen: Date.now(), joined: Date.now() };
  r.players.set(user.id, player);
  bump(r);
  return player;
}

function addBot(r) {
  if (!r.players.has(BOT)) r.players.set(BOT, { id: BOT, name: 'Pixel Bot', color: '#7db4ee', score: 0, wins: 0, lastSeen: Date.now(), joined: Date.now(), bot: true });
}
const removeBot = (r) => r.players.delete(BOT);
const humans = (r) => [...r.players.keys()].filter((id) => id !== BOT);

const COLORS = ['#7db4ee', '#ff8fbf', '#7ff0ff', '#ffd166', '#a78bfa', '#5fd6a8', '#ff9f6b', '#f472b6'];
function colorFor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- two-player board games ----------
const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function c4Win(board, cols = 7, rows = 6) {
  const at = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? board[r * cols + c] : null);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = at(c, r);
      if (v === null) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const cells = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k]);
        if (cells.every(([x, y]) => at(x, y) === v)) return { winner: v, line: cells.map(([x, y]) => y * cols + x) };
      }
    }
  }
  return null;
}

function newBoardGame(type, seats) {
  return { type, seats, board: Array(type === 'tictactoe' ? 9 : 42).fill(null), turn: 0, winner: null, line: [], draw: false, started: Date.now(), finished: false };
}

function boardMove(r, g, userId, cell) {
  const seat = g.seats.indexOf(userId);
  if (g.finished) return 'The game is over.';
  if (seat < 0) return 'You\'re watching this one.';
  if (seat !== g.turn) return 'Wait for your turn.';
  let index = Number(cell);
  if (g.type === 'connect4') {
    const col = index;
    if (!(col >= 0 && col < 7)) return 'Pick a column.';
    index = -1;
    for (let row = 5; row >= 0; row--) if (g.board[row * 7 + col] === null) { index = row * 7 + col; break; }
    if (index < 0) return 'That column is full.';
  } else if (!(index >= 0 && index < 9) || g.board[index] !== null) {
    return 'Pick an empty square.';
  }
  g.board[index] = seat;
  g.last = index;
  const won = g.type === 'tictactoe'
    ? (() => { const line = LINES3.find((l) => l.every((i) => g.board[i] === seat)); return line ? { winner: seat, line } : null; })()
    : c4Win(g.board);
  if (won) {
    g.winner = seat;
    g.line = won.line;
    g.finished = true;
    const p = r.players.get(userId);
    if (p) { p.wins += 1; p.score += 10; }
  } else if (g.board.every((v) => v !== null)) {
    g.draw = true;
    g.finished = true;
  } else {
    g.turn = 1 - g.turn;
  }
  return null;
}

// ---------- trivia ----------
const Q_TIME = 15_000;
const REVEAL_TIME = 4_000;

function newTrivia() {
  const picked = shuffle(QUESTIONS).slice(0, 10).map(([q, right, ...wrong]) => {
    const options = shuffle([right, ...wrong]);
    return { q, options, answer: options.indexOf(right) };
  });
  return { type: 'trivia', questions: picked, index: 0, phase: 'question', phaseEnds: Date.now() + Q_TIME, answers: {}, points: {}, finished: false, started: Date.now() };
}

function triviaTick(r, g, now = Date.now()) {
  if (g.finished) return false;
  const everyone = [...r.players.keys()].every((id) => g.answers[id] !== undefined);
  if (g.phase === 'question' && (now >= g.phaseEnds || (everyone && r.players.size > 0))) {
    const q = g.questions[g.index];
    for (const [id, a] of Object.entries(g.answers)) {
      if (a.choice === q.answer) {
        const speed = Math.max(0, Q_TIME - a.ms);
        const pts = 100 + Math.round((speed / Q_TIME) * 100);
        g.points[id] = (g.points[id] ?? 0) + pts;
        a.pts = pts;
      }
    }
    g.phase = 'reveal';
    g.phaseEnds = now + REVEAL_TIME;
    return true;
  }
  if (g.phase === 'reveal' && now >= g.phaseEnds) {
    if (g.index >= g.questions.length - 1) {
      g.finished = true;
      g.phase = 'done';
      const best = Object.entries(g.points).sort((a, b) => b[1] - a[1])[0];
      if (best) { const p = r.players.get(best[0]); if (p) { p.wins += 1; } }
      for (const [id, pts] of Object.entries(g.points)) { const p = r.players.get(id); if (p) p.score += Math.round(pts / 100); }
    } else {
      g.index += 1;
      g.phase = 'question';
      g.phaseEnds = now + Q_TIME;
      g.answers = {};
      g.botAt = null;
    }
    return true;
  }
  return false;
}

function triviaAnswer(g, userId, choice) {
  if (g.phase !== 'question') return 'Too late for that one!';
  if (g.answers[userId] !== undefined) return 'You already answered.';
  const c = Number(choice);
  if (!(c >= 0 && c < 4)) return 'Pick an answer.';
  g.answers[userId] = { choice: c, ms: Q_TIME - (g.phaseEnds - Date.now()) };
  return null;
}

// ---------- reaction race ----------
const ROUNDS = 5;
function newReaction() {
  return { type: 'reaction', round: 1, phase: 'wait', goAt: Date.now() + 2500 + crypto.randomInt(3000), results: {}, fouls: {}, roundWinner: null, wins: {}, phaseEnds: null, finished: false, started: Date.now() };
}

function reactionTick(r, g, now = Date.now()) {
  if (g.finished) return false;
  if (g.phase === 'wait' && now >= g.goAt) { g.phase = 'go'; g.phaseEnds = now + 3000; return true; }
  if (g.phase === 'go' && now >= g.phaseEnds) return endRound(r, g, now);
  if (g.phase === 'result' && now >= g.phaseEnds) {
    if (g.round >= ROUNDS) {
      g.finished = true;
      g.phase = 'done';
      const best = Object.entries(g.wins).sort((a, b) => b[1] - a[1])[0];
      if (best) { const p = r.players.get(best[0]); if (p) p.wins += 1; }
      for (const [id, w] of Object.entries(g.wins)) { const p = r.players.get(id); if (p) p.score += w * 3; }
    } else {
      g.round += 1;
      g.phase = 'wait';
      g.goAt = now + 2000 + crypto.randomInt(3500);
      g.results = {};
      g.fouls = {};
      g.roundWinner = null;
      g.botMs = null;
    }
    return true;
  }
  return false;
}

function endRound(r, g, now) {
  const best = Object.entries(g.results).sort((a, b) => a[1] - b[1])[0];
  g.roundWinner = best ? best[0] : null;
  if (best) g.wins[best[0]] = (g.wins[best[0]] ?? 0) + 1;
  g.phase = 'result';
  g.phaseEnds = now + 3000;
  return true;
}

function reactionClick(r, g, userId) {
  const now = Date.now();
  if (g.phase === 'wait') {
    if (g.fouls[userId]) return 'You already jumped the gun this round.';
    g.fouls[userId] = true;
    return null;
  }
  if (g.phase !== 'go') return 'Wait for the next round.';
  if (g.fouls[userId] || g.results[userId] !== undefined) return 'You\'re out of this round.';
  g.results[userId] = now - g.goAt;
  const active = [...r.players.keys()].filter((id) => !g.fouls[id]);
  if (active.every((id) => g.results[id] !== undefined)) endRound(r, g, now);
  return null;
}

// ---------- Pixel Bot's turns ----------
function botTick(r, g, now) {
  if (g.finished) return false;
  const level = g.level ?? 'normal';
  if (g.type === 'tictactoe' || g.type === 'connect4') {
    const seat = g.seats.indexOf(BOT);
    if (seat < 0 || g.turn !== seat) return false;
    if (!g.botAt) { g.botAt = now + 550 + crypto.randomInt(500); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    const cell = g.type === 'tictactoe' ? ai.tttMove(g.board, seat, level) : ai.c4Move(g.board, seat, level);
    return boardMove(r, g, BOT, cell) === null;
  }
  if (g.type === 'trivia' && g.phase === 'question' && g.answers[BOT] === undefined) {
    if (!g.botAt) { g.botAt = now + ai.triviaDelay(level); return false; }
    if (now < g.botAt && !humans(r).every((id) => g.answers[id] !== undefined)) return false;
    const q = g.questions[g.index];
    const wrong = [0, 1, 2, 3].filter((i) => i !== q.answer);
    const choice = Math.random() < ai.triviaAccuracy(level) ? q.answer : wrong[crypto.randomInt(3)];
    triviaAnswer(g, BOT, choice);
    triviaTick(r, g, now);
    return true;
  }
  if (g.type === 'reaction' && g.phase === 'go' && g.results[BOT] === undefined) {
    g.botMs ??= ai.reactionMs(level);
    if (now - g.goAt < g.botMs) return false;
    g.results[BOT] = g.botMs;
    const active = [...r.players.keys()].filter((id) => !g.fouls[id]);
    if (active.every((id) => g.results[id] !== undefined)) endRound(r, g, now);
    return true;
  }
  return false;
}

// ---------- shared ----------
function tick(r) {
  const now = Date.now();
  let changed = false;
  for (const [id, p] of r.players) {
    if (!p.bot && now - p.lastSeen > SEEN_TIMEOUT) { r.players.delete(id); changed = true; }
  }
  if (r.players.has(BOT) && !humans(r).length) { removeBot(r); r.game = null; changed = true; }
  const g = r.game;
  if (g && MODS[g.type]) { if (MODS[g.type].tick(r, g, now)) changed = true; } else if (g && r.players.has(BOT) && botTick(r, g, now)) changed = true;
  if (g?.type === 'trivia' && triviaTick(r, g, now)) changed = true;
  if (g?.type === 'reaction' && reactionTick(r, g, now)) changed = true;
  if (changed) bump(r);
}

/** Does something in the room. Returns an error message or null. */
function act(r, user, body) {
  const action = String(body?.action ?? '');
  const g = r.game;
  let error = null;
  if (action === 'start') {
    const type = String(body.game ?? '');
    if (!GAMES[type]) return 'Pick a game.';
    if (g && !g.finished) return 'A game is already going. Finish it or press "Back to lobby".';
    const vsBot = body.with === BOT || body.bot === true || body.bot === 'true';
    const level = ai.LEVELS[body.level] ? body.level : 'normal';
    if (vsBot) addBot(r); else if (GAMES[type].mode === 'party') removeBot(r);
    if (GAMES[type].mode === 'duel') {
      const others = humans(r).filter((id) => id !== user.id);
      const rival = vsBot ? BOT : body.with && r.players.has(body.with) && body.with !== user.id ? body.with : others[0];
      if (!rival) return 'You need someone to play with. Pick Pixel Bot, or invite a friend!';
      const seats = crypto.randomInt(2) ? [user.id, rival] : [rival, user.id];
      r.game = MODS[type] ? MODS[type].create(r, { seats, level }) : newBoardGame(type, seats);
    } else if (MODS[type]) {
      r.game = MODS[type].create(r, { level });
    } else if (type === 'tictactoe' || type === 'connect4') {
      const others = humans(r).filter((id) => id !== user.id);
      const rival = vsBot ? BOT : body.with && r.players.has(body.with) && body.with !== user.id ? body.with : others[0];
      if (!rival) return 'You need someone to play with. Pick Pixel Bot, or invite a friend!';
      r.game = newBoardGame(type, crypto.randomInt(2) ? [user.id, rival] : [rival, user.id]);
    } else if (type === 'trivia') {
      r.game = newTrivia();
    } else {
      r.game = newReaction();
    }
    r.game.by = user.id;
    r.game.level = level;
  } else if (action === 'lobby') {
    r.game = null;
  } else if (action === 'rematch') {
    if (!g?.finished) return 'Finish this game first.';
    if (MODS[g.type]) {
      if (g.seats && !g.seats.every((id) => r.players.has(id) || id === BOT)) return 'Your opponent left. Start a new game from the lobby.';
      if (g.seats?.includes(BOT)) addBot(r);
      r.game = MODS[g.type].rematch(r, g);
    } else if (g.type === 'tictactoe' || g.type === 'connect4') {
      if (!g.seats.every((id) => r.players.has(id) || id === BOT)) return 'Your opponent left. Start a new game from the lobby.';
      r.game = newBoardGame(g.type, [g.seats[1], g.seats[0]]);
    } else {
      r.game = g.type === 'trivia' ? newTrivia() : newReaction();
    }
    r.game.level = g.level;
    r.game.by = g.by;
  } else if (action === 'play') {
    if (!g || !MODS[g.type]) return 'No game is going.';
    error = MODS[g.type].act(r, g, user.id, body.move);
  } else if (action === 'move') {
    if (!g || !['tictactoe', 'connect4'].includes(g.type)) return 'No board game is going.';
    error = boardMove(r, g, user.id, body.cell);
  } else if (action === 'answer') {
    if (g?.type !== 'trivia') return 'No trivia game is going.';
    error = triviaAnswer(g, user.id, body.choice);
    if (!error) triviaTick(r, g);
  } else if (action === 'click') {
    if (g?.type !== 'reaction') return 'No reaction race is going.';
    error = reactionClick(r, g, user.id);
  } else {
    return 'Unknown action.';
  }
  if (!error) bump(r);
  return error;
}

/** What one player's screen shows (hides answers until they're revealed). */
function view(r, userId) {
  const players = [...r.players.values()].sort((a, b) => a.joined - b.joined).map(({ id, name, color, score, wins, bot }) => ({ id, name, color, score, wins, bot: Boolean(bot) }));
  const g = r.game;
  let game = null;
  if (g) {
    game = { type: g.type, finished: g.finished, by: g.by, level: g.level, now: Date.now() };
    if (g.type === 'tictactoe' || g.type === 'connect4') Object.assign(game, { seats: g.seats, board: g.board, turn: g.turn, winner: g.winner, line: g.line, draw: g.draw, last: g.last });
    if (g.type === 'trivia') {
      const q = g.questions[g.index];
      Object.assign(game, {
        index: g.index, total: g.questions.length, phase: g.phase, phaseEnds: g.phaseEnds, question: q?.q, options: q?.options,
        answer: g.phase === 'question' ? null : q?.answer, mine: g.answers[userId] ?? null,
        answered: Object.keys(g.answers), points: g.points,
        picks: g.phase === 'question' ? null : Object.fromEntries(Object.entries(g.answers).map(([id, a]) => [id, a.choice])),
      });
    }
    if (MODS[g.type]) Object.assign(game, MODS[g.type].view(g, userId, r));
    if (g.type === 'reaction') {
      Object.assign(game, { round: g.round, rounds: ROUNDS, phase: g.phase, results: g.results, fouls: g.fouls, roundWinner: g.roundWinner, wins: g.wins, phaseEnds: g.phaseEnds });
    }
  }
  return { version: r.version, me: userId, players, game, games: GAMES, levels: ai.LEVELS, bot: BOT };
}

/** Waits (up to `ms`) for the room to change after `since`, then returns. */
function waitFor(r, since, ms = 15_000) {
  if (r.version !== since) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); r.waiters.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    timer.unref?.();
    r.waiters.add(done);
  });
}

// Timers: trivia and reaction rounds move on by themselves; empty rooms are cleaned up.
let ticker = null;
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    for (const [id, r] of rooms) {
      tick(r);
      if (!r.players.size && Date.now() - r.touched > 10 * 60_000) rooms.delete(id);
    }
  }, 250);
  ticker.unref?.();
}

module.exports = { BOT, GAMES, rooms, room, join, act, view, tick, waitFor, startTicker, c4Win, QUESTIONS, _internal: { triviaTick, reactionTick, Q_TIME, REVEAL_TIME } };
