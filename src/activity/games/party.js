// Party games: everyone in the room plays at once, Pixel Bot joins in when picked.
const { BOT, party, finishParty, people, rand, chance, pick, lvl, shuffle, credit } = require('./kit');
const { WORDS, EMOJI, CAPITALS, TRUE_FALSE, SENTENCES } = require('./words');

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const add = (obj, id, n) => { obj[id] = (obj[id] ?? 0) + n; };

// ================================================================ quiz engine
// A run of rounds: show a prompt, people answer (pick a choice, or type until
// right), quicker right answers score more, then the answer is revealed.
function quiz(def) {
  const TIME = def.time ?? 20_000;
  const REVEAL = 3500;
  return party({
    ...def,
    create(r, { level }) {
      const questions = def.make(level);
      return { questions, index: 0, phase: 'question', phaseEnds: Date.now() + TIME, started: Date.now(), roundStart: Date.now(), answers: {}, points: {}, time: TIME };
    },
    act(r, g, userId, move) {
      if (g.phase !== 'question') return 'Wait for the next one!';
      const q = g.questions[g.index];
      const a = g.answers[userId];
      if (a?.ok || (a && !def.typed)) return 'You already answered this one.';
      const ms = Date.now() - g.roundStart;
      if (def.typed) {
        const text = String(move ?? '').slice(0, 200);
        if (!norm(text)) return 'Type an answer.';
        if (!q.check(text)) { g.answers[userId] = { ok: false, tries: (a?.tries ?? 0) + 1 }; return 'Not quite. Try again!'; }
        const first = !Object.values(g.answers).some((x) => x.ok);
        g.answers[userId] = { ok: true, ms, first };
        add(g.points, userId, 100 + Math.round(Math.max(0, TIME - ms) / TIME * 100) + (first ? 50 : 0));
      } else {
        const choice = Number(move);
        if (!(choice >= 0 && choice < q.choices.length)) return 'Pick an answer.';
        const ok = q.check ? q.check(choice) : choice === q.answer;
        g.answers[userId] = { ok, ms, choice };
        if (ok) add(g.points, userId, 100 + Math.round(Math.max(0, TIME - ms) / TIME * 100));
      }
      this.tick(r, g, Date.now());
      return null;
    },
    tick(r, g, now) {
      if (g.finished) return false;
      const here = people(r, g);
      const done = here.length && here.every((id) => (def.typed ? g.answers[id]?.ok || (id === BOT && g.botGaveUp === g.index) : g.answers[id]));
      if (g.phase === 'question' && (now >= g.phaseEnds || done)) { g.phase = 'reveal'; g.phaseEnds = now + REVEAL; return true; }
      if (g.phase === 'reveal' && now >= g.phaseEnds) {
        if (g.index >= g.questions.length - 1) { finishParty(r, g, g.points, { divide: 100 }); return true; }
        g.index += 1; g.phase = 'question'; g.phaseEnds = now + TIME; g.roundStart = now; g.answers = {}; g.botAt = null;
        return true;
      }
      return false;
    },
    bot(r, g, now) {
      if (g.phase !== 'question' || g.answers[BOT]?.ok || (!def.typed && g.answers[BOT]) || g.botGaveUp === g.index) return false;
      const q = g.questions[g.index];
      if (!g.botAt) { g.botAt = now + def.botDelay(g.level, q); return false; }
      if (now < g.botAt) return false;
      g.botAt = null;
      const right = chance(def.botAccuracy(g.level));
      if (def.typed) {
        if (!right) { g.botGaveUp = g.index; return false; }
        this.act(r, g, BOT, q.answerText);
      } else {
        const wrong = q.choices.map((_, i) => i).filter((i) => !(q.check ? q.check(i) : i === q.answer));
        const correct = q.choices.map((_, i) => i).filter((i) => (q.check ? q.check(i) : i === q.answer));
        this.act(r, g, BOT, right || !wrong.length ? pick(correct) : pick(wrong));
      }
      return true;
    },
    view(g, userId) {
      const q = g.questions[g.index];
      const reveal = g.phase !== 'question';
      return {
        kind: 'quiz', typed: Boolean(def.typed), index: g.index, total: g.questions.length, phase: g.phase, phaseEnds: g.phaseEnds, time: TIME,
        prompt: q?.prompt, big: q?.big ?? null, choices: q?.choices ?? null, hint: q?.hint ?? null,
        answer: reveal ? (def.typed ? q?.answerText : q?.answer) : null, answerText: reveal ? q?.answerText ?? null : null,
        mine: g.answers[userId] ?? null, answered: Object.entries(g.answers).filter(([, a]) => (def.typed ? a.ok : true)).map(([id]) => id),
        picks: reveal && !def.typed ? Object.fromEntries(Object.entries(g.answers).map(([id, a]) => [id, a.choice])) : null,
        points: g.points, final: g.final ?? null, ties: q?.ties ?? null,
      };
    },
  });
}

const scramble = (w) => { let s = w; for (let k = 0; k < 10 && s === w; k++) s = shuffle([...w]).join(''); return s; };
const typingDelay = (level, q) => Math.round((q.answerText.length / lvl(level, 3.2, 5, 7.5)) * 1000) + rand(1500);

const wordScramble = quiz({
  id: 'scramble', name: 'Word Scramble', icon: 'scramble', blurb: 'Unscramble the word. Fastest wins.', typed: true,
  make: () => shuffle(WORDS.filter((w) => w.length >= 5 && w.length <= 8)).slice(0, 8).map((w) => ({ prompt: 'Unscramble this word:', big: scramble(w).toUpperCase(), answerText: w, check: (t) => norm(t) === w })),
  botAccuracy: (l) => lvl(l, 0.45, 0.7, 0.9), botDelay: (l) => lvl(l, 9000, 6000, 3500) + rand(5000),
});

function mathQ() {
  const kind = rand(4);
  let a; let b; let text; let ans;
  if (kind === 0) { a = 10 + rand(90); b = 10 + rand(90); text = `${a} + ${b}`; ans = a + b; }
  else if (kind === 1) { a = 30 + rand(70); b = 1 + rand(a); text = `${a} − ${b}`; ans = a - b; }
  else if (kind === 2) { a = 2 + rand(11); b = 2 + rand(11); text = `${a} × ${b}`; ans = a * b; }
  else { b = 2 + rand(10); ans = 2 + rand(11); a = b * ans; text = `${a} ÷ ${b}`; }
  return { prompt: 'Solve it:', big: `${text} = ?`, answerText: String(ans), check: (t) => Number(String(t).replace(/[^\d-]/g, '')) === ans && /\d/.test(t) };
}
const quickMath = quiz({
  id: 'math', name: 'Quick Math', icon: 'math', blurb: 'Solve sums faster than everyone else.', typed: true, time: 15_000,
  make: () => Array.from({ length: 10 }, mathQ),
  botAccuracy: (l) => lvl(l, 0.55, 0.8, 0.95), botDelay: (l) => lvl(l, 7000, 4500, 2500) + rand(3000),
});

const emojiRiddles = quiz({
  id: 'emoji', name: 'Emoji Riddles', icon: 'emoji', blurb: 'Guess the word or phrase from the emojis.', typed: true, time: 30_000,
  make: () => shuffle(EMOJI).slice(0, 8).map(([e, answer, ...alts]) => ({ prompt: 'What do these emojis mean?', big: e, answerText: answer, check: (t) => [answer, ...alts].some((a) => norm(a) === norm(t) || norm(a).replace(/ /g, '') === norm(t).replace(/ /g, '')) })),
  botAccuracy: (l) => lvl(l, 0.35, 0.6, 0.85), botDelay: (l) => lvl(l, 15000, 10000, 6000) + rand(8000),
});

const trueFalse = quiz({
  id: 'truefalse', name: 'True or False', icon: 'truefalse', blurb: 'Weird facts. Real or fake?', time: 12_000,
  make: () => shuffle(TRUE_FALSE).slice(0, 10).map(([s, t]) => ({ prompt: s, choices: ['True', 'False'], answer: t ? 0 : 1, answerText: t ? 'True' : 'False' })),
  botAccuracy: (l) => lvl(l, 0.55, 0.72, 0.9), botDelay: (l) => lvl(l, 6000, 4000, 2000) + rand(3000),
});

const capitals = quiz({
  id: 'capitals', name: 'Capitals Quiz', icon: 'capitals', blurb: 'Name the capital city.', time: 15_000,
  make: () => shuffle(CAPITALS).slice(0, 10).map(([country, city]) => {
    const choices = shuffle([city, ...shuffle(CAPITALS.filter(([, c]) => c !== city)).slice(0, 3).map(([, c]) => c)]);
    return { prompt: `What is the capital of ${country}?`, choices, answer: choices.indexOf(city), answerText: city };
  }),
  botAccuracy: (l) => lvl(l, 0.5, 0.75, 0.92), botDelay: (l) => lvl(l, 7000, 4500, 2500) + rand(4000),
});

const CARD = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const higherLower = quiz({
  id: 'higherlower', name: 'Higher or Lower', icon: 'higherlower', blurb: 'Will the next card be higher or lower?', time: 10_000,
  make() {
    const cards = Array.from({ length: 11 }, () => 1 + rand(13));
    return cards.slice(0, 10).map((cur, i) => {
      const next = cards[i + 1];
      const answer = next > cur ? 0 : next < cur ? 1 : -1;
      return { prompt: `The card is ${CARD[cur - 1]}. Is the next one higher or lower?`, big: CARD[cur - 1], choices: ['Higher', 'Lower'], answer, ties: answer === -1, answerText: `Next card: ${CARD[next - 1]}${answer === -1 ? ' (same, so everyone is right!)' : ''}`, check: (c) => answer === -1 || c === answer, cur };
    });
  },
  // Pixel Bot plays the odds: higher on low cards, lower on high cards.
  botAccuracy: (l) => lvl(l, 0.5, 0.62, 0.72), botDelay: (l) => lvl(l, 4500, 3000, 1500) + rand(2500),
});

const typingRace = quiz({
  id: 'typing', name: 'Typing Race', icon: 'typing', blurb: 'Type the sentence exactly. Speed counts!', typed: true, time: 45_000,
  make: () => shuffle(SENTENCES).slice(0, 4).map((s) => ({ prompt: 'Type this as fast as you can:', big: s, answerText: s, check: (t) => norm(t) === norm(s) })),
  botAccuracy: (l) => lvl(l, 0.8, 0.9, 0.97), botDelay: typingDelay,
});

// ================================================================ Guess the Number
const GN_TIME = 60_000;
const guessNumber = party({
  id: 'guess', name: 'Guess the Number', icon: 'guess', blurb: 'I\'m thinking of 1 to 100. Hints say higher or lower.',
  create: () => ({ round: 1, rounds: 3, secret: 1 + rand(100), phase: 'play', phaseEnds: Date.now() + GN_TIME, guesses: {}, points: {}, roundWinner: null }),
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'Wait for the next round!';
    const n = Number(String(move).trim());
    if (!Number.isInteger(n) || n < 1 || n > 100) return 'Guess a whole number from 1 to 100.';
    const mine = (g.guesses[userId] ??= []);
    const hint = n === g.secret ? 'yes' : n < g.secret ? 'higher' : 'lower';
    mine.push({ n, hint });
    if (hint === 'yes') { g.roundWinner = userId; add(g.points, userId, Math.max(20, 110 - mine.length * 10)); g.phase = 'reveal'; g.phaseEnds = Date.now() + 4000; }
    return null;
  },
  tick(r, g, now) {
    if (g.phase === 'play' && now >= g.phaseEnds) { g.phase = 'reveal'; g.phaseEnds = now + 4000; return true; }
    if (g.phase === 'reveal' && now >= g.phaseEnds) {
      if (g.round >= g.rounds) { finishParty(r, g, g.points, { divide: 10 }); return true; }
      Object.assign(g, { round: g.round + 1, secret: 1 + rand(100), phase: 'play', phaseEnds: now + GN_TIME, guesses: {}, roundWinner: null, botAt: null });
      return true;
    }
    return false;
  },
  bot(r, g, now) {
    if (g.phase !== 'play') return false;
    if (!g.botAt) { g.botAt = now + lvl(g.level, 5000, 3500, 2500) + rand(1500); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    let lo = 1; let hi = 100;
    for (const { n, hint } of g.guesses[BOT] ?? []) { if (hint === 'higher') lo = Math.max(lo, n + 1); if (hint === 'lower') hi = Math.min(hi, n - 1); }
    const mid = Math.floor((lo + hi) / 2);
    const guess = g.level === 'easy' ? lo + rand(hi - lo + 1) : g.level === 'normal' ? Math.min(hi, Math.max(lo, mid + rand(7) - 3)) : mid;
    this.act(r, g, BOT, guess);
    return true;
  },
  view: (g, userId) => ({ round: g.round, rounds: g.rounds, phase: g.phase, phaseEnds: g.phaseEnds, mine: g.guesses[userId] ?? [], counts: Object.fromEntries(Object.entries(g.guesses).map(([id, l]) => [id, l.length])), points: g.points, roundWinner: g.roundWinner, secret: g.phase === 'play' ? null : g.secret, final: g.final ?? null, time: GN_TIME }),
});

// ================================================================ Code Breaker
const CB_COLORS = 6;
const CB_LEN = 4;
const CB_MAX = 10;
const CB_TIME = 150_000;
function cbScore(secret, guess) {
  let black = 0; const s = []; const gs = [];
  for (let k = 0; k < CB_LEN; k++) { if (secret[k] === guess[k]) black += 1; else { s.push(secret[k]); gs.push(guess[k]); } }
  let white = 0;
  for (const c of gs) { const at = s.indexOf(c); if (at >= 0) { white += 1; s.splice(at, 1); } }
  return { black, white };
}
const ALL_CODES = Array.from({ length: CB_COLORS ** CB_LEN }, (_, n) => Array.from({ length: CB_LEN }, (__, k) => Math.floor(n / CB_COLORS ** k) % CB_COLORS));
const newCode = () => Array.from({ length: CB_LEN }, () => rand(CB_COLORS));
const codeBreaker = party({
  id: 'codebreaker', name: 'Code Breaker', icon: 'codebreaker', blurb: 'Crack the secret colour code first.',
  create: () => ({ round: 1, rounds: 2, secret: newCode(), phase: 'play', phaseEnds: Date.now() + CB_TIME, tries: {}, points: {}, roundWinner: null }),
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'Wait for the next round!';
    const code = String(move ?? '').split('').map(Number);
    if (code.length !== CB_LEN || code.some((c) => !(c >= 0 && c < CB_COLORS))) return 'Fill all four slots first.';
    const mine = (g.tries[userId] ??= []);
    if (mine.length >= CB_MAX) return 'You\'re out of guesses this round.';
    const fb = cbScore(g.secret, code);
    mine.push({ code, ...fb });
    if (fb.black === CB_LEN) { g.roundWinner = userId; add(g.points, userId, 50 + (CB_MAX - mine.length + 1) * 10); g.phase = 'reveal'; g.phaseEnds = Date.now() + 5000; }
    else if (people(r, g).every((id) => (g.tries[id]?.length ?? 0) >= CB_MAX)) { g.phase = 'reveal'; g.phaseEnds = Date.now() + 5000; }
    return null;
  },
  tick(r, g, now) {
    if (g.phase === 'play' && now >= g.phaseEnds) { g.phase = 'reveal'; g.phaseEnds = now + 5000; return true; }
    if (g.phase === 'reveal' && now >= g.phaseEnds) {
      if (g.round >= g.rounds) { finishParty(r, g, g.points, { divide: 10 }); return true; }
      Object.assign(g, { round: g.round + 1, secret: newCode(), phase: 'play', phaseEnds: now + CB_TIME, tries: {}, roundWinner: null, botAt: null });
      return true;
    }
    return false;
  },
  bot(r, g, now) {
    if (g.phase !== 'play' || (g.tries[BOT]?.length ?? 0) >= CB_MAX) return false;
    if (!g.botAt) { g.botAt = now + lvl(g.level, 11000, 8000, 5500) + rand(3000); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    const mine = g.tries[BOT] ?? [];
    const fits = ALL_CODES.filter((c) => mine.every((t) => { const f = cbScore(c, t.code); return f.black === t.black && f.white === t.white; }));
    const smart = chance(lvl(g.level, 0.4, 0.75, 1));
    const guess = smart && fits.length ? pick(fits) : newCode();
    this.act(r, g, BOT, guess.join(''));
    return true;
  },
  view: (g, userId) => ({ round: g.round, rounds: g.rounds, phase: g.phase, phaseEnds: g.phaseEnds, time: CB_TIME, mine: g.tries[userId] ?? [], max: CB_MAX, colors: CB_COLORS, len: CB_LEN, counts: Object.fromEntries(Object.entries(g.tries).map(([id, l]) => [id, l.length])), points: g.points, roundWinner: g.roundWinner, secret: g.phase === 'play' ? null : g.secret, final: g.final ?? null }),
});

// ================================================================ Simon Says
const simon = party({
  id: 'simon', name: 'Simon Says', icon: 'simon', blurb: 'Watch the colours, then repeat them. Miss and you\'re out.',
  create(r) {
    const g = { seq: [rand(4), rand(4)], round: 1, alive: [...r.players.keys()], subs: {}, survived: {}, closed: true };
    return { ...g, ...simonShow(g, Date.now()) };
  },
  act(r, g, userId, move) {
    if (g.phase !== 'input') return 'Watch the pattern first!';
    if (!g.alive.includes(userId)) return 'You\'re out this game. Watch the others!';
    if (g.subs[userId] !== undefined) return 'Already in!';
    const ok = String(move ?? '') === g.seq.join('');
    g.subs[userId] = ok;
    if (g.alive.every((id) => g.subs[id] !== undefined)) simonResult(r, g, Date.now());
    return null;
  },
  tick(r, g, now) {
    if (g.phase === 'show' && now >= g.phaseEnds) { g.phase = 'input'; g.phaseEnds = now + 5000 + g.seq.length * 900; return true; }
    if (g.phase === 'input' && now >= g.phaseEnds) { simonResult(r, g, now); return true; }
    if (g.phase === 'result' && now >= g.phaseEnds) {
      const startedWith = g.people.length;
      if (!g.alive.length || (startedWith > 1 && g.alive.length <= 1)) {
        for (const id of g.alive) add(g.survived, id, 1);
        finishParty(r, g, Object.fromEntries(g.people.map((id) => [id, (g.survived[id] ?? 0) * 10])), { divide: 10 });
        return true;
      }
      g.seq.push(rand(4)); g.round += 1; g.subs = {}; g.botAt = null;
      Object.assign(g, simonShow(g, now));
      return true;
    }
    return false;
  },
  bot(r, g, now) {
    if (g.phase !== 'input' || !g.alive.includes(BOT) || g.subs[BOT] !== undefined) return false;
    if (!g.botAt) { g.botAt = now + 1500 + g.seq.length * 350 + rand(1200); return false; }
    if (now < g.botAt) return false;
    const slip = Math.min(0.9, g.seq.length * lvl(g.level, 0.07, 0.035, 0.015));
    const answer = chance(slip) ? g.seq.map((c, k) => (k === g.seq.length - 1 ? (c + 1) % 4 : c)).join('') : g.seq.join('');
    this.act(r, g, BOT, answer);
    return true;
  },
  view: (g, userId) => ({ phase: g.phase, phaseEnds: g.phaseEnds, round: g.round, seq: g.phase === 'show' ? g.seq : null, length: g.seq.length, alive: g.alive, done: Object.keys(g.subs), mine: g.subs[userId] ?? null, lastOut: g.lastOut ?? [], survived: g.survived, final: g.final ?? null, showAt: g.showAt }),
});
function simonShow(g, now) { return { phase: 'show', showAt: now + 600, phaseEnds: now + 900 + g.seq.length * 700 }; }
function simonResult(r, g, now) {
  const out = g.alive.filter((id) => !g.subs[id]);
  for (const id of g.alive) if (g.subs[id]) add(g.survived, id, 1);
  g.alive = g.alive.filter((id) => g.subs[id]);
  g.lastOut = out;
  g.phase = 'result';
  g.phaseEnds = now + 2500;
}

// ================================================================ Hangman
const HM_MAX = 7;
const LETTER_ORDER = 'etaoinsrhldcumfpgwybvkxjqz';
function hmNext(g, now) {
  const word = g.words[g.round - 1];
  return { word, guessed: [], wrong: 0, phase: 'play', phaseEnds: now + 120_000, solvedBy: null, botAt: null };
}
const hmDone = (g) => [...g.word].every((ch) => g.guessed.includes(ch));
const hangman = party({
  id: 'hangman', name: 'Hangman', icon: 'hangman', blurb: 'Guess letters together. Score for each one you find.',
  create() {
    const words = shuffle(WORDS.filter((w) => w.length >= 5 && w.length <= 9)).slice(0, 3);
    const g = { words, round: 1, rounds: 3, points: {} };
    return { ...g, ...hmNext(g, Date.now()) };
  },
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'Wait for the next word!';
    const guess = norm(move).replace(/ /g, '');
    if (!guess) return 'Type a letter or the whole word.';
    if (guess.length === 1) {
      if (g.guessed.includes(guess)) return `${guess.toUpperCase()} was already guessed.`;
      g.guessed.push(guess);
      const hits = [...g.word].filter((ch) => ch === guess).length;
      if (hits) add(g.points, userId, hits * 10); else g.wrong += 1;
    } else if (guess === g.word) {
      const left = new Set([...g.word].filter((ch) => !g.guessed.includes(ch))).size;
      add(g.points, userId, 30 + left * 10);
      g.guessed = [...new Set([...g.guessed, ...g.word])];
      g.solvedBy = userId;
    } else {
      g.wrong += 1;
    }
    if (hmDone(g) || g.wrong >= HM_MAX) { g.phase = 'reveal'; g.phaseEnds = Date.now() + 4000; }
    return null;
  },
  tick(r, g, now) {
    if (g.phase === 'play' && now >= g.phaseEnds) { g.phase = 'reveal'; g.phaseEnds = now + 4000; return true; }
    if (g.phase === 'reveal' && now >= g.phaseEnds) {
      if (g.round >= g.rounds) { finishParty(r, g, g.points, { divide: 10 }); return true; }
      g.round += 1;
      Object.assign(g, hmNext(g, now));
      return true;
    }
    return false;
  },
  bot(r, g, now) {
    if (g.phase !== 'play') return false;
    if (!g.botAt) { g.botAt = now + lvl(g.level, 6000, 4000, 2800) + rand(2500); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    const pattern = new RegExp(`^${[...g.word].map((ch) => (g.guessed.includes(ch) ? ch : `[^${g.guessed.join('') || '_'}]`)).join('')}$`);
    const fits = g.level === 'hard' ? WORDS.filter((w) => w.length === g.word.length && pattern.test(w)) : [];
    if (fits.length === 1 && chance(0.8)) { this.act(r, g, BOT, fits[0]); return true; }
    let letter;
    if (fits.length) {
      const counts = {};
      for (const w of fits) for (const ch of new Set(w)) if (!g.guessed.includes(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
      letter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    }
    if (!letter) {
      const open = [...LETTER_ORDER].filter((ch) => !g.guessed.includes(ch));
      letter = g.level === 'easy' ? pick(open) : open[0];
    }
    if (letter) this.act(r, g, BOT, letter);
    return true;
  },
  view: (g) => ({ round: g.round, rounds: g.rounds, phase: g.phase, phaseEnds: g.phaseEnds, slots: [...g.word].map((ch) => (g.guessed.includes(ch) || g.phase !== 'play' ? ch : null)), guessed: g.guessed, wrong: g.wrong, max: HM_MAX, points: g.points, solvedBy: g.solvedBy, word: g.phase === 'play' ? null : g.word, final: g.final ?? null }),
});

// ================================================================ Word Chain
const WC_TIME = 20_000;
const wordChain = party({
  id: 'wordchain', name: 'Word Chain', icon: 'wordchain', blurb: 'Your word starts with the last letter of theirs.',
  create(r) {
    const order = shuffle([...r.players.keys()]);
    const first = pick(WORDS.filter((w) => w.length >= 4));
    return { order, alive: [...order], turn: 0, last: first, used: [first], chain: [{ id: null, word: first }], phase: 'play', phaseEnds: Date.now() + WC_TIME, points: {}, closed: true };
  },
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'The game is over.';
    if (g.alive[g.turn] !== userId) return 'Wait for your turn.';
    const word = norm(move).replace(/ /g, '');
    const letter = g.last.slice(-1);
    if (!/^[a-z]{3,20}$/.test(word)) return 'Use one real word, 3 letters or more.';
    if (word[0] !== letter) return `Your word has to start with "${letter.toUpperCase()}".`;
    if (g.used.includes(word)) return 'That word was already used!';
    g.used.push(word);
    g.chain.push({ id: userId, word });
    g.last = word;
    add(g.points, userId, 5 + Math.max(0, word.length - 4));
    g.turn = (g.turn + 1) % g.alive.length;
    g.phaseEnds = Date.now() + WC_TIME;
    g.botAt = null;
    return null;
  },
  tick(r, g, now) {
    if (g.phase !== 'play') return false;
    let changed = false;
    // Players who left are out.
    const gone = g.alive.filter((id) => !r.players.has(id));
    if (gone.length) { changed = true; const cur = g.alive[g.turn]; g.alive = g.alive.filter((id) => r.players.has(id)); g.turn = Math.max(0, g.alive.indexOf(cur)); if (g.turn >= g.alive.length) g.turn = 0; }
    if (now >= g.phaseEnds && g.alive.length) {
      changed = true;
      const out = g.alive[g.turn];
      g.chain.push({ id: out, word: null });
      g.alive.splice(g.turn, 1);
      if (g.turn >= g.alive.length) g.turn = 0;
      g.phaseEnds = now + WC_TIME;
      g.botAt = null;
    }
    if ((g.order.length > 1 && g.alive.length <= 1) || !g.alive.length) {
      for (const id of g.alive) add(g.points, id, 20);
      finishParty(r, g, g.points);
      return true;
    }
    return changed;
  },
  bot(r, g, now) {
    if (g.phase !== 'play' || g.alive[g.turn] !== BOT) return false;
    if (!g.botAt) { g.botAt = now + lvl(g.level, 6000, 4000, 2500) + rand(3000); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    if (chance(lvl(g.level, 0.12, 0.04, 0))) { g.botAt = g.phaseEnds + 1000; return false; } // stumped
    const letter = g.last.slice(-1);
    const options = WORDS.filter((w) => w[0] === letter && !g.used.includes(w));
    if (!options.length) { g.botAt = g.phaseEnds + 1000; return false; }
    const choice = g.level === 'hard' ? options.sort((a, b) => { const ends = (w) => WORDS.filter((x) => x[0] === w.slice(-1)).length; return ends(a) - ends(b); })[0] : pick(options);
    this.act(r, g, BOT, choice);
    return true;
  },
  view: (g) => ({ phase: g.phase, phaseEnds: g.phaseEnds, time: WC_TIME, turnId: g.alive[g.turn] ?? null, alive: g.alive, order: g.order, last: g.last, letter: g.last.slice(-1).toUpperCase(), chain: g.chain.slice(-12), points: g.points, final: g.final ?? null }),
});

// ================================================================ Blackjack
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const newDeck = () => shuffle(Array.from({ length: 52 * 4 }, (_, i) => ({ r: RANKS[i % 13], s: SUITS[Math.floor(i / 13) % 4] })));
function handValue(cards) {
  let total = 0; let aces = 0;
  for (const c of cards) { if (c.r === 'A') { aces += 1; total += 11; } else total += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); }
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return total;
}
const BJ_TURN = 25_000;
function bjDeal(r, g, now) {
  if (g.deck.length < 40) g.deck = newDeck();
  const players = [...r.players.keys()].filter((id) => id !== BOT);
  g.hands = {};
  for (const id of players) g.hands[id] = { cards: [g.deck.pop(), g.deck.pop()], done: false, result: null };
  for (const h of Object.values(g.hands)) if (handValue(h.cards) === 21) h.done = true;
  g.dealer = [g.deck.pop(), g.deck.pop()];
  g.phase = 'play';
  g.phaseEnds = now + BJ_TURN;
}
const blackjack = party({
  id: 'blackjack', name: 'Blackjack', icon: 'blackjack', blurb: 'Beat Pixel Bot the dealer. Get close to 21!',
  players: 'Everyone vs Pixel Bot',
  create(r) {
    const g = { deck: newDeck(), hand: 1, hands_total: 3, points: {}, phase: 'play' };
    bjDeal(r, g, Date.now());
    return g;
  },
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'Wait for the next hand!';
    const h = g.hands[userId];
    if (!h) return 'You\'ll be dealt in next hand.';
    if (h.done) return 'You\'re done this hand.';
    if (move === 'hit') { h.cards.push(g.deck.pop()); if (handValue(h.cards) >= 21) h.done = true; } else if (move === 'stand') h.done = true; else return 'Hit or stand?';
    if (Object.values(g.hands).every((x) => x.done)) { g.phase = 'dealer'; g.phaseEnds = Date.now() + 1200; }
    return null;
  },
  tick(r, g, now) {
    if (g.phase === 'play' && now >= g.phaseEnds) { for (const h of Object.values(g.hands)) h.done = true; g.phase = 'dealer'; g.phaseEnds = now + 1200; return true; }
    if (g.phase === 'dealer' && now >= g.phaseEnds) {
      const someoneLive = Object.values(g.hands).some((h) => handValue(h.cards) <= 21);
      if (someoneLive && handValue(g.dealer) < 17) { g.dealer.push(g.deck.pop()); g.phaseEnds = now + 900; return true; }
      const d = handValue(g.dealer);
      const dealerBJ = d === 21 && g.dealer.length === 2;
      for (const [id, h] of Object.entries(g.hands)) {
        const v = handValue(h.cards);
        const bj = v === 21 && h.cards.length === 2;
        if (v > 21) h.result = 'bust';
        else if (bj && !dealerBJ) { h.result = 'blackjack'; add(g.points, id, 30); }
        else if (d > 21 || v > d) { h.result = 'win'; add(g.points, id, 20); }
        else if (v === d) { h.result = 'push'; add(g.points, id, 5); }
        else h.result = 'lose';
      }
      g.phase = 'result';
      g.phaseEnds = now + 4500;
      return true;
    }
    if (g.phase === 'result' && now >= g.phaseEnds) {
      if (g.hand >= g.hands_total) { finishParty(r, g, g.points, { divide: 10 }); return true; }
      g.hand += 1;
      bjDeal(r, g, now);
      return true;
    }
    return false;
  },
  view(g, userId) {
    const showDealer = g.phase !== 'play';
    return {
      phase: g.phase, phaseEnds: g.phaseEnds, time: BJ_TURN, hand: g.hand, hands: g.hands_total, points: g.points, final: g.final ?? null,
      dealer: showDealer ? g.dealer : [g.dealer[0], null], dealerValue: showDealer ? handValue(g.dealer) : null,
      players: Object.fromEntries(Object.entries(g.hands).map(([id, h]) => [id, { cards: h.cards, value: handValue(h.cards), done: h.done, result: h.result }])),
      me: userId,
    };
  },
});

// ================================================================ Pig
const PIG_GOAL = 50;
const PIG_TURN = 30_000;
const pig = party({
  id: 'pig', name: 'Pig', icon: 'pig', blurb: 'Roll to build points, hold to bank them. A 1 loses it all!',
  create(r) {
    const order = shuffle([...r.players.keys()]);
    return { order, turn: 0, banked: Object.fromEntries(order.map((id) => [id, 0])), pot: 0, roll: null, phase: 'play', phaseEnds: Date.now() + PIG_TURN, log: [], closed: true };
  },
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'The game is over.';
    if (g.order[g.turn] !== userId) return 'Wait for your turn.';
    if (move === 'roll') {
      const d = 1 + rand(6);
      g.roll = { id: userId, d };
      if (d === 1) { g.log.unshift({ id: userId, text: 'rolled a 1 and lost the pot' }); g.pot = 0; pigNext(g); } else g.pot += d;
    } else if (move === 'hold') {
      g.banked[userId] += g.pot;
      g.log.unshift({ id: userId, text: `banked ${g.pot}` });
      g.pot = 0;
      if (g.banked[userId] >= PIG_GOAL) { finishParty(r, g, Object.fromEntries(g.order.map((id) => [id, id === userId ? 30 : Math.floor(g.banked[id] / 5)]))); return null; }
      pigNext(g);
    } else return 'Roll or hold?';
    g.log = g.log.slice(0, 6);
    g.phaseEnds = Date.now() + PIG_TURN;
    g.botAt = null;
    return null;
  },
  tick(r, g, now) {
    if (g.phase !== 'play') return false;
    const cur = g.order[g.turn];
    if (!r.players.has(cur) || now >= g.phaseEnds) { this.act(r, g, cur, g.pot > 0 ? 'hold' : 'roll'); if (!r.players.has(cur)) { g.order = g.order.filter((id) => id !== cur); if (g.turn >= g.order.length) g.turn = 0; if (!g.order.length) finishParty(r, g, {}); } return true; }
    return false;
  },
  bot(r, g, now) {
    if (g.phase !== 'play' || g.order[g.turn] !== BOT) return false;
    if (!g.botAt) { g.botAt = now + 900 + rand(600); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    const need = PIG_GOAL - g.banked[BOT];
    const leader = Math.max(...g.order.filter((id) => id !== BOT).map((id) => g.banked[id]), 0);
    const target = g.level === 'easy' ? 8 + rand(8) : g.level === 'normal' ? 20 : leader >= PIG_GOAL - 12 ? need : Math.min(need, 22);
    this.act(r, g, BOT, g.pot >= target || g.pot >= need ? 'hold' : 'roll');
    return true;
  },
  view: (g) => ({ phase: g.phase, phaseEnds: g.phaseEnds, time: PIG_TURN, order: g.order, turnId: g.order[g.turn] ?? null, banked: g.banked, pot: g.pot, roll: g.roll, goal: PIG_GOAL, log: g.log, final: g.final ?? null }),
});
function pigNext(g) { g.turn = (g.turn + 1) % g.order.length; }

// ================================================================ Snakes and Ladders
const JUMPS = { 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100, 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
const SL_TURN = 20_000;
const snakes = party({
  id: 'snakes', name: 'Snakes and Ladders', icon: 'snakes', blurb: 'Climb ladders, dodge snakes, reach 100.',
  create(r) {
    const order = shuffle([...r.players.keys()]);
    return { order, turn: 0, pos: Object.fromEntries(order.map((id) => [id, 0])), last: null, phase: 'play', phaseEnds: Date.now() + SL_TURN, closed: true };
  },
  act(r, g, userId, move) {
    if (g.phase !== 'play') return 'The game is over.';
    if (g.order[g.turn] !== userId) return 'Wait for your turn.';
    if (move !== 'roll') return 'Roll the dice!';
    const d = 1 + rand(6);
    const from = g.pos[userId];
    let to = from + d;
    if (to > 100) to = 100 - (to - 100);
    const landed = to;
    if (JUMPS[to]) to = JUMPS[to];
    g.pos[userId] = to;
    g.last = { id: userId, d, from, landed, to, kind: to > landed ? 'ladder' : to < landed ? 'snake' : null };
    if (to === 100) { finishParty(r, g, Object.fromEntries(g.order.map((id) => [id, id === userId ? 30 : Math.floor(g.pos[id] / 10)]))); return null; }
    if (d !== 6) g.turn = (g.turn + 1) % g.order.length; // a six rolls again
    g.phaseEnds = Date.now() + SL_TURN;
    g.botAt = null;
    return null;
  },
  tick(r, g, now) {
    if (g.phase !== 'play') return false;
    const cur = g.order[g.turn];
    if (!r.players.has(cur)) { g.order.splice(g.turn, 1); if (g.turn >= g.order.length) g.turn = 0; if (!g.order.length) finishParty(r, g, {}); return true; }
    if (now >= g.phaseEnds) { this.act(r, g, cur, 'roll'); return true; }
    return false;
  },
  bot(r, g, now) {
    if (g.phase !== 'play' || g.order[g.turn] !== BOT) return false;
    if (!g.botAt) { g.botAt = now + 1100 + rand(700); return false; }
    if (now < g.botAt) return false;
    g.botAt = null;
    this.act(r, g, BOT, 'roll');
    return true;
  },
  view: (g) => ({ phase: g.phase, phaseEnds: g.phaseEnds, time: SL_TURN, order: g.order, turnId: g.order[g.turn] ?? null, pos: g.pos, last: g.last, jumps: JUMPS, final: g.final ?? null }),
});

module.exports = {
  wordScramble, quickMath, emojiRiddles, trueFalse, capitals, higherLower, typingRace,
  guessNumber, codeBreaker, simon, hangman, wordChain, blackjack, pig, snakes,
  _test: { handValue, cbScore, norm, JUMPS },
};
