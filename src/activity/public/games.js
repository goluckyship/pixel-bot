// Pixel Arcade: screens for the 26 newer games. arcade.js calls
// window.PAGames[type](game, helpers) and shows the HTML it returns.
// Buttons use data-act="play" data-move="…"; text boxes use <form data-act="say">.
(function () {
  const G = {};
  let sel = null; // checkers: picked piece
  let cpPick = null; // chopsticks: picked hand
  let draft = []; // code breaker / simon clicks
  let draftKey = '';

  // ---------- shared bits ----------
  const timer = (ends, total) => `<div class="bar"><i class="tbar" data-ends="${ends}" data-total="${total}"></i></div>`;
  function duelTop(g, H, marks) {
    const seats = g.seats.map((id, i) => H.chip(H.player(id), ` <span class="mark">${marks[i]}</span>`, !g.finished && g.turn === i ? 'turn' : '')).join('<span class="pixel">vs</span>');
    let status;
    const me = g.mySeat;
    if (g.finished) status = g.draw ? "It's a draw!" : g.seats[g.winner] === H.state.me ? `${H.ic('crown', 20)} You win!` : `${H.ic('trophy', 20)} ${H.esc(H.player(g.seats[g.winner]).name)} wins!`;
    else if (me < 0) status = `Watching: ${H.esc(H.player(g.seats[g.turn]).name)}'s turn`;
    else if (g.simultaneous) status = '';
    else status = g.turn === me ? `${H.ic('sparkle', 18)} Your turn!` : H.player(g.seats[g.turn]).bot ? `${H.ic('robot', 18)} Pixel Bot is thinking…` : `Waiting for ${H.esc(H.player(g.seats[g.turn]).name)}…`;
    return `<div class="seat">${seats}</div><div class="status">${status}</div>`;
  }
  const myTurn = (g) => !g.finished && g.mySeat >= 0 && g.turn === g.mySeat;
  const disc = (seat) => `<i class="disc d${seat}"></i>`;
  const end = (g, H) => (g.finished ? H.finished() : '');
  const say = (key, placeholder, opts = '') => `<form class="say" data-act="say"><input id="say" data-key="${key}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${placeholder}" ${opts}><button class="btn" type="submit">Send</button></form>`;
  function finalScreen(g, H, title, unit = 'pts') {
    return `${H.header(title)}<div class="card"><h2 style="text-align:center">${H.ic('trophy', 24)} Final scores</h2>${H.lb(g.final || {}, unit)}</div>${H.finished()}`;
  }
  function scoreRow(points, H) {
    return `<div class="who">${H.state.players.map((p) => H.chip(p, ` <span class="score">${points[p.id] || 0}</span>`)).join('')}</div>`;
  }

  // ================================================================ duels
  G.checkers = (g, H) => {
    const flip = g.mySeat === 1;
    const legal = g.legal || [];
    if (g.chain !== null && g.chain !== undefined && myTurn(g)) sel = g.chain;
    if (sel !== null && !legal.some((m) => m.startsWith(`${sel}-`))) sel = null;
    const targets = sel === null ? [] : legal.filter((m) => m.startsWith(`${sel}-`)).map((m) => Number(m.split('-')[1]));
    const movable = new Set(legal.map((m) => Number(m.split('-')[0])));
    let cells = '';
    for (let d = 0; d < 64; d++) {
      const i = flip ? 63 - d : d;
      const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
      const p = g.board[i];
      const piece = p ? `<span class="ck p${p.s}${p.k ? ' king' : ''}">${p.k ? H.ic('crown', 16) : ''}</span>` : '';
      const cls = ['sq', dark ? 'dk' : 'lt', sel === i ? 'sel' : '', targets.includes(i) ? 'tg' : '', myTurn(g) && movable.has(i) ? 'mv' : '', g.last && g.last.includes(i) ? 'ls' : ''].join(' ');
      cells += `<button class="${cls}" data-act="ck" data-i="${i}" ${dark && myTurn(g) ? '' : 'disabled'}>${piece}</button>`;
    }
    return `${H.header('Checkers')}${duelTop(g, H, [disc(0), disc(1)])}<div class="board ckb">${cells}</div><p class="foot">Tap your piece, then where it goes. Jumps are compulsory.</p>${end(g, H)}`;
  };
  G.checkersClick = (el, g, H) => {
    const i = Number(el.dataset.i);
    const legal = g.legal || [];
    if (sel !== null && legal.includes(`${sel}-${i}`)) { const m = `${sel}-${i}`; sel = null; return H.act({ action: 'play', move: m }); }
    sel = legal.some((m) => m.startsWith(`${i}-`)) ? i : null;
    H.render();
  };

  G.reversi = (g, H) => {
    const legal = new Set(myTurn(g) ? g.legal || [] : []);
    const cells = g.board.map((v, i) => `<button class="rv ${legal.has(i) ? 'can' : ''} ${g.last === i ? 'ls' : ''}" data-act="play" data-move="${i}" ${legal.has(i) ? '' : 'disabled'}>${v === null ? '' : `<span class="rd p${v}"></span>`}</button>`).join('');
    const pass = g.passed && !g.finished ? `<p class="sub">${H.esc(H.player(g.seats[1 - g.turn]).name)} had no move, so it's ${H.esc(H.player(g.seats[g.turn]).name)} again.</p>` : '';
    return `${H.header('Reversi')}${duelTop(g, H, [`${disc(0)} ${g.counts[0]}`, `${disc(1)} ${g.counts[1]}`])}${pass}<div class="board rvb">${cells}</div>${end(g, H)}`;
  };

  G.gomoku = (g, H) => {
    const can = myTurn(g);
    const cells = g.board.map((v, i) => `<button class="gm ${g.line.includes(i) ? 'win' : ''} ${g.last === i ? 'ls' : ''}" data-act="play" data-move="${i}" ${can && v === null ? '' : 'disabled'}>${v === null ? '' : `<span class="st p${v}"></span>`}</button>`).join('');
    return `${H.header('Gomoku')}${duelTop(g, H, [disc(0), disc(1)])}<div class="board gmb" style="grid-template-columns:repeat(${g.size},1fr)">${cells}</div>${end(g, H)}`;
  };

  G.ultimate = (g, H) => {
    const legal = new Set(myTurn(g) ? g.legal || [] : []);
    let boards = '';
    for (let b = 0; b < 9; b++) {
      const won = g.big[b];
      const hot = !g.finished && (g.forced === b || (g.forced === null && won === null));
      let cells = '';
      for (let k = 0; k < 9; k++) {
        const i = b * 9 + k;
        const v = g.cells[i];
        cells += `<button class="ut ${g.last === i ? 'ls' : ''}" data-act="play" data-move="${i}" ${legal.has(i) ? '' : 'disabled'}>${v === null ? '' : `<img src="/activity/i-${v === 0 ? 'x' : 'o'}.svg" alt="">`}</button>`;
      }
      boards += `<div class="utb ${hot ? 'hot' : ''} ${won !== null ? 'done' : ''}">${cells}${won === 0 || won === 1 ? `<div class="utw"><img src="/activity/i-${won === 0 ? 'x' : 'o'}.svg" alt=""></div>` : won === 'd' ? '<div class="utw">–</div>' : ''}</div>`;
    }
    return `${H.header('Ultimate Tic-Tac-Toe')}${duelTop(g, H, [H.ic('x', 14), H.ic('o', 14)])}<div class="board utbig">${boards}</div><p class="foot">Play in a glowing board. The square you pick sends your opponent to that board.</p>${end(g, H)}`;
  };

  G.dots = (g, H) => {
    const n = g.size;
    const can = myTurn(g);
    let html = '';
    for (let r = 0; r <= 2 * n; r++) {
      for (let c = 0; c <= 2 * n; c++) {
        if (r % 2 === 0 && c % 2 === 0) html += '<i class="dot"></i>';
        else if (r % 2 === 0) { const l = (r / 2) * n + (c - 1) / 2; const v = g.lines[l]; html += `<button class="ln h ${v === null ? '' : `p${v}`} ${g.last === l ? 'ls' : ''}" data-act="play" data-move="${l}" ${can && v === null ? '' : 'disabled'}></button>`; }
        else if (c % 2 === 0) { const l = 20 + ((r - 1) / 2) * (n + 1) + c / 2; const v = g.lines[l]; html += `<button class="ln v ${v === null ? '' : `p${v}`} ${g.last === l ? 'ls' : ''}" data-act="play" data-move="${l}" ${can && v === null ? '' : 'disabled'}></button>`; }
        else { const b = g.boxes[((r - 1) / 2) * n + (c - 1) / 2]; html += `<i class="bx ${b === null ? '' : `p${b}`}"></i>`; }
      }
    }
    const cols = Array.from({ length: n }, () => '14px 1fr').join(' ') + ' 14px';
    return `${H.header('Dots and Boxes')}${duelTop(g, H, [`${disc(0)} ${g.score[0]}`, `${disc(1)} ${g.score[1]}`])}<div class="board dbb" style="grid-template-columns:${cols};grid-template-rows:${cols}">${html}</div>${end(g, H)}`;
  };

  G.mancala = (g, H) => {
    const me = g.mySeat === 1 ? 1 : 0;
    const legal = new Set(myTurn(g) ? g.legal || [] : []);
    const pit = (i) => `<button class="pit ${g.last === i ? 'ls' : ''}" data-act="play" data-move="${i}" ${legal.has(i) ? '' : 'disabled'}><b>${g.pits[i]}</b><span>${'<i></i>'.repeat(Math.min(g.pits[i], 12))}</span></button>`;
    const theirs = me === 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0];
    const mine = me === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
    const myStore = me === 0 ? 6 : 13;
    const theirStore = me === 0 ? 13 : 6;
    return `${H.header('Mancala')}${duelTop(g, H, [`${disc(0)} ${g.pits[6]}`, `${disc(1)} ${g.pits[13]}`])}${g.again && !g.finished ? `<p class="sub">Landed in the store: ${H.esc(H.player(g.seats[g.turn]).name)} goes again!</p>` : ''}
<div class="board mcb"><div class="store">${g.pits[theirStore]}<small>theirs</small></div><div class="pits">${theirs.map(pit).join('')}${mine.map(pit).join('')}</div><div class="store mine">${g.pits[myStore]}<small>yours</small></div></div>
<p class="foot">Pick one of your pits (bottom row). Seeds go anticlockwise. Land in your store to go again; land in an empty pit of yours to capture.</p>${end(g, H)}`;
  };

  G.battleship = (g, H) => {
    const can = myTurn(g);
    const grid = (cells, clickable) => `<div class="board bsb">${cells.map((v, i) => `<button class="bs ${v}" data-act="play" data-move="${i}" ${clickable && !v ? '' : 'disabled'}>${v === 'hit' ? '✕' : v === 'miss' ? '•' : ''}</button>`).join('')}</div>`;
    const s = g.lastShot;
    const last = s ? `${H.esc(H.player(g.seats[s.seat]).name)} fired: ${s.hit ? (s.sank ? `HIT and sank a ${s.sank}-long ship!` : 'HIT!') : 'miss.'}` : 'Ships: 4, 3, 3 and 2 long.';
    const me = g.viewSeat;
    return `${H.header('Battleship')}${duelTop(g, H, [`⛴ ${g.shipsLeft[0]}`, `⛴ ${g.shipsLeft[1]}`])}<p class="sub">${last}</p>
<div class="bswrap"><div><h2>Enemy waters</h2>${grid(g.theirs, can)}</div><div><h2>Your fleet</h2>${grid(g.mine, false)}</div></div>${g.mySeat < 0 ? `<p class="foot">Showing ${H.esc(H.player(g.seats[me]).name)}'s side.</p>` : ''}${end(g, H)}`;
  };

  G.chopsticks = (g, H) => {
    const me = g.mySeat === 1 ? 1 : 0;
    const legal = myTurn(g) ? g.legal || [] : [];
    const hand = (seat, k) => {
      const n = g.hands[seat][k];
      const pickable = seat === me && legal.some((m) => m.startsWith(`tap:${k}:`));
      const target = seat !== me && cpPick !== null && legal.includes(`tap:${cpPick}:${k}`);
      return `<button class="hand ${n === 0 ? 'out' : ''} ${seat === me && cpPick === k ? 'sel' : ''} ${target ? 'tg' : ''}" data-act="cp" data-seat="${seat}" data-k="${k}" ${pickable || target ? '' : 'disabled'}><b>${n === 0 ? '✕' : n}</b><span>${'<i></i>'.repeat(n)}</span><small>${k ? 'right' : 'left'}</small></button>`;
    };
    const splits = legal.filter((m) => m.startsWith('split')).map((m) => { const [, a, b] = m.split(':'); return `<button class="btn ghost" data-act="play" data-move="${m}">Split ${a} / ${b}</button>`; }).join('');
    const lm = g.lastMove;
    const lastText = lm ? `${H.esc(H.player(g.seats[lm.seat]).name)} ${lm.move.startsWith('tap') ? 'tapped' : 'split their fingers'}.` : 'Tap one of your hands, then theirs. Five or more fingers knocks a hand out.';
    return `${H.header('Chopsticks')}${duelTop(g, H, ['✋', '✋'])}<p class="sub">${lastText}</p>
<div class="cp"><div class="row">${hand(1 - me, 0)}${hand(1 - me, 1)}</div><div class="pixel" style="text-align:center;margin:8px 0">vs</div><div class="row">${hand(me, 0)}${hand(me, 1)}</div></div>${splits ? `<div class="row">${splits}</div>` : ''}${end(g, H)}`;
  };
  G.chopsticksClick = (el, g, H) => {
    const seat = Number(el.dataset.seat); const k = Number(el.dataset.k);
    const me = g.mySeat === 1 ? 1 : 0;
    if (seat === me) { cpPick = cpPick === k ? null : k; return H.render(); }
    if (cpPick !== null) { const m = `tap:${cpPick}:${k}`; cpPick = null; return H.act({ action: 'play', move: m }); }
  };

  G.nim = (g, H) => {
    const can = myTurn(g);
    const piles = g.piles.map((n, p) => `<div class="pile"><b>Pile ${p + 1}</b><div>${Array.from({ length: n }, (_, k) => `<button class="stick" data-act="play" data-move="${p}:${n - k}" ${can ? '' : 'disabled'} title="Take ${n - k}"></button>`).join('') || '<span class="sub">empty</span>'}</div></div>`).join('');
    const lm = g.lastMove;
    return `${H.header('Nim')}${duelTop(g, H, ['🪵', '🪵'])}<p class="sub">${lm ? `${H.esc(H.player(g.seats[lm.seat]).name)} took ${lm.took} from pile ${lm.pile + 1}.` : 'Tap a stick to take it and every stick to its right. Take the last stick to win!'}</p><div class="card nim">${piles}</div>${end(g, H)}`;
  };

  const RPS_ICON = { rock: '✊', paper: '✋', scissors: '✌️' };
  G.rps = (g, H) => {
    g.simultaneous = true;
    const me = g.mySeat;
    const rounds = g.rounds.map((r) => `<div class="rpsr">${RPS_ICON[r.picks[0]]} <span class="pixel">vs</span> ${RPS_ICON[r.picks[1]]} <small>${r.winner === null ? 'tie' : `${H.esc(H.player(g.seats[r.winner]).name)} wins`}</small></div>`).join('');
    const waiting = g.seats.filter((id, i) => !g.picked[i]).map((id) => H.player(id).name);
    const canPick = !g.finished && me >= 0 && !g.picked[me];
    const btns = ['rock', 'paper', 'scissors'].map((m) => `<button class="rpsb ${g.myPick === m ? 'sel' : ''}" data-act="play" data-move="${m}" ${canPick ? '' : 'disabled'}>${RPS_ICON[m]}<small>${m}</small></button>`).join('');
    const status = g.finished ? '' : canPick ? `${H.ic('sparkle', 18)} Pick one!` : waiting.length ? `Waiting for ${H.esc(waiting.join(', '))}…` : '';
    return `${H.header('Rock Paper Scissors · first to 3')}${duelTop(g, H, [`${g.wins[0]}`, `${g.wins[1]}`])}<div class="status">${status}</div><div class="row">${btns}</div><div class="card" style="margin-top:14px">${rounds || '<p class="sub">No rounds yet.</p>'}</div>${end(g, H)}`;
  };

  const FACES = { star: ['★', '#ffd166'], heart: ['♥', '#ff8fbf'], bolt: ['ϟ', '#7ff0ff'], moon: ['☾', '#c9b6ff'], gem: ['◆', '#5fd6a8'], leaf: ['♣', '#8fe388'], note: ['♪', '#ff9f6b'], drop: ['●', '#7db4ee'] };
  G.memory = (g, H) => {
    const can = myTurn(g) && g.open.length < 2;
    const cards = g.faces.map((f, i) => {
      const owner = g.taken[i];
      const face = f ? `<span style="color:${FACES[f][1]}">${FACES[f][0]}</span>` : '';
      return `<button class="mem ${f ? 'up' : ''} ${owner !== null ? `got p${owner}` : ''}" data-act="play" data-move="${i}" ${can && !f ? '' : 'disabled'}>${face}</button>`;
    }).join('');
    return `${H.header('Memory Match')}${duelTop(g, H, [`${disc(0)} ${g.pairs[0]}`, `${disc(1)} ${g.pairs[1]}`])}<div class="board memb">${cards}</div>${end(g, H)}`;
  };

  // ================================================================ party
  function quiz(title) {
    return (g, H) => {
      if (g.finished) return finalScreen(g, H, title);
      const reveal = g.phase !== 'question';
      const mine = g.mine;
      let body = '';
      if (g.choices) {
        body = `<div class="opts">${g.choices.map((c, i) => {
          const right = reveal && (g.ties || i === g.answer);
          const pickers = reveal && g.picks ? Object.entries(g.picks).filter(([, x]) => x === i).map(([id]) => H.player(id).name) : [];
          return `<button class="opt o${i} ${reveal && !right ? 'dim' : ''} ${right ? 'right' : ''} ${mine && mine.choice === i ? 'mine' : ''}" data-act="play" data-move="${i}" ${mine || reveal ? 'disabled' : ''}>${H.esc(c)}${pickers.length ? `<br><small>${pickers.map(H.esc).join(', ')}</small>` : ''}</button>`;
        }).join('')}</div>`;
      } else if (!reveal && !(mine && mine.ok)) {
        body = say(`${g.index}`, g.big && g.big.length > 20 ? 'Type it here…' : 'Your answer…', g.big && g.big.length > 20 ? 'style="font-size:16px"' : '');
      }
      let status;
      if (reveal) status = mine && mine.ok ? `${H.ic('check', 18)} You got it!` : g.choices ? (mine ? `${H.ic('cross', 16)} Not this time` : `${H.ic('clock', 18)} Out of time`) : `${H.ic('clock', 18)} The answer was <b>${H.esc(g.answerText)}</b>`;
      else status = mine && mine.ok ? `${H.ic('check', 18)} Got it${mine.first ? ' first' : ''}! Waiting for the others…` : g.choices ? (mine ? 'Locked in!' : 'Quick, pick one!') : 'Type your answer. Wrong guesses are fine, keep trying!';
      if (reveal && g.choices && g.answerText) status += ` · <b>${H.esc(g.answerText)}</b>`;
      const done = H.state.players.map((p) => (g.answered.includes(p.id) ? H.chip(p, ` ${H.ic('check', 12)}`) : '')).join('');
      return `${H.header(`${title} · ${g.index + 1} of ${g.total}`)}<div class="card">${timer(reveal ? 0 : g.phaseEnds, g.time)}
<div class="q">${H.esc(g.prompt)}</div>${g.big ? `<div class="big ${g.big.length > 20 ? 'long' : ''}">${H.esc(g.big)}</div>` : ''}${body}<div class="status" style="margin-top:12px">${status}</div><div class="who">${done}</div></div>${scoreRow(g.points, H)}`;
    };
  }
  G.scramble = quiz('Word Scramble');
  G.math = quiz('Quick Math');
  G.emoji = quiz('Emoji Riddles');
  G.truefalse = quiz('True or False');
  G.capitals = quiz('Capitals Quiz');
  G.higherlower = quiz('Higher or Lower');
  G.typing = quiz('Typing Race');

  G.guess = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Guess the Number', 'pts');
    const play = g.phase === 'play';
    const mine = g.mine.map((x) => `<span class="hint ${x.hint}">${x.n} ${x.hint === 'yes' ? '🎯' : x.hint === 'higher' ? '⬆' : '⬇'}</span>`).join('');
    const status = play ? 'I\'m thinking of a number from 1 to 100…' : g.roundWinner ? `${H.ic('crown', 20)} ${H.esc(H.player(g.roundWinner).name)} found it: <b>${g.secret}</b>` : `Nobody got it. It was <b>${g.secret}</b>`;
    const counts = H.state.players.map((p) => H.chip(p, ` <span class="score">${g.counts[p.id] || 0} tries</span>`)).join('');
    return `${H.header(`Guess the Number · Round ${g.round} of ${g.rounds}`)}<div class="card">${timer(play ? g.phaseEnds : 0, g.time)}<div class="status">${status}</div>
${play ? say(`g${g.round}`, '1 to 100', 'inputmode="numeric"') : ''}<div class="hints">${mine || '<span class="sub">Your guesses show here with hints.</span>'}</div><div class="who">${counts}</div></div>${scoreRow(g.points, H)}`;
  };

  const CB = ['#ff6b81', '#ffd166', '#5fd6a8', '#7db4ee', '#c9b6ff', '#ff9f6b'];
  G.codebreaker = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Code Breaker');
    const play = g.phase === 'play';
    const key = `${g.round}:${g.mine.length}`;
    if (draftKey !== key) { draft = []; draftKey = key; }
    const peg = (c) => `<i class="cbp" style="background:${CB[c]}"></i>`;
    const rows = g.mine.map((t) => `<div class="cbrow">${t.code.map(peg).join('')}<span class="fb">${'<i class="k"></i>'.repeat(t.black)}${'<i class="w"></i>'.repeat(t.white)}</span></div>`).join('');
    const out = g.mine.length >= g.max;
    const slots = Array.from({ length: g.len }, (_, k) => (draft[k] !== undefined ? peg(draft[k]) : '<i class="cbp empty"></i>')).join('');
    const palette = CB.slice(0, g.colors).map((c, i) => `<button class="cbc" style="background:${c}" data-act="cb" data-c="${i}" ${play && !out ? '' : 'disabled'}></button>`).join('');
    const status = play ? (out ? 'Out of guesses. Watch the others!' : `Guess ${g.mine.length + 1} of ${g.max}. Black peg = right colour, right spot. White = right colour, wrong spot.`) : g.roundWinner ? `${H.ic('crown', 20)} ${H.esc(H.player(g.roundWinner).name)} cracked it!` : 'Nobody cracked it.';
    const counts = H.state.players.map((p) => H.chip(p, ` <span class="score">${g.counts[p.id] || 0}</span>`)).join('');
    return `${H.header(`Code Breaker · Round ${g.round} of ${g.rounds}`)}<div class="card">${timer(play ? g.phaseEnds : 0, g.time)}<div class="status">${status}</div>
${g.secret ? `<div class="cbrow secret">${g.secret.map(peg).join('')}</div>` : ''}
<div class="cbrows">${rows}</div>${play && !out ? `<div class="cbrow draft">${slots}</div><div class="row">${palette}</div><div class="row"><button class="btn ghost" data-act="cbx">Undo</button><button class="btn" data-act="cbgo" ${draft.length === g.len ? '' : 'disabled'}>Guess</button></div>` : ''}
<div class="who">${counts}</div></div>${scoreRow(g.points, H)}`;
  };
  G.codebreakerClick = (el, g, H, a) => {
    if (a === 'cb' && draft.length < g.len) draft.push(Number(el.dataset.c));
    if (a === 'cbx') draft.pop();
    if (a === 'cbgo' && draft.length === g.len) { const m = draft.join(''); draft = []; return H.act({ action: 'play', move: m }); }
    H.render();
  };

  const SIMON = ['#ff6b81', '#5fd6a8', '#7db4ee', '#ffd166'];
  G.simon = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Simon Says');
    const meIn = g.alive.includes(H.state.me);
    const key = `${g.round}:${g.phase}`;
    if (draftKey !== key) { draft = []; draftKey = key; }
    const input = g.phase === 'input' && meIn && g.mine === null;
    const pads = SIMON.map((c, i) => `<button class="spad" data-pad="${i}" style="--c:${c}" data-act="sp" ${input ? '' : 'disabled'}></button>`).join('');
    let status;
    if (g.phase === 'show') status = `Watch carefully… (${g.length} colours)`;
    else if (g.phase === 'input') status = !meIn ? 'You\'re out. Watching!' : g.mine !== null ? 'Locked in! Waiting for the others…' : `Your turn: repeat it! ${draft.length} / ${g.length}`;
    else status = g.lastOut.length ? `Out: ${g.lastOut.map((id) => H.esc(H.player(id).name)).join(', ')}` : 'Everyone got it!';
    const alive = H.state.players.map((p) => H.chip(p, g.alive.includes(p.id) ? ` ${g.done.includes(p.id) ? H.ic('check', 12) : ''}` : ' ✕', g.alive.includes(p.id) ? '' : 'outp')).join('');
    return `${H.header(`Simon Says · Round ${g.round}`)}<div class="card">${g.phase === 'input' ? timer(g.phaseEnds, 5000 + g.length * 900) : ''}<div class="status">${status}</div><div class="simon" data-show="${g.phase === 'show' ? g.showAt : ''}" data-seq="${g.seq ? g.seq.join('') : ''}">${pads}</div><div class="who">${alive}</div></div>`;
  };
  G.simonClick = (el, g, H) => {
    draft.push(Number(el.dataset.pad));
    el.classList.add('lit');
    setTimeout(() => el.classList.remove('lit'), 180);
    if (draft.length >= g.length) { const m = draft.join(''); draft = []; return H.act({ action: 'play', move: m }); }
    const st = document.querySelector('.status');
    if (st) st.textContent = `Your turn: repeat it! ${draft.length} / ${g.length}`;
  };

  G.hangman = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Hangman');
    const play = g.phase === 'play';
    const slots = g.slots.map((ch) => `<span class="slot">${ch ? H.esc(ch.toUpperCase()) : ''}</span>`).join('');
    const keys = 'abcdefghijklmnopqrstuvwxyz'.split('').map((ch) => `<button class="key ${g.guessed.includes(ch) ? (g.slots.includes(ch) || (g.word && g.word.includes(ch)) ? 'hitk' : 'missk') : ''}" data-act="play" data-move="${ch}" ${play && !g.guessed.includes(ch) ? '' : 'disabled'}>${ch.toUpperCase()}</button>`).join('');
    const lives = Array.from({ length: g.max }, (_, k) => `<i class="life ${k < g.wrong ? 'lost' : ''}"></i>`).join('');
    const status = play ? 'Tap letters, or type the whole word if you know it.' : g.wrong >= g.max ? `Out of lives! The word was <b>${H.esc(g.word.toUpperCase())}</b>` : `${H.ic('check', 18)} <b>${H.esc(g.word.toUpperCase())}</b>${g.solvedBy ? ` solved by ${H.esc(H.player(g.solvedBy).name)}` : ''}`;
    return `${H.header(`Hangman · Word ${g.round} of ${g.rounds}`)}<div class="card"><div class="lives">${lives}</div><div class="slots">${slots}</div><div class="status">${status}</div><div class="keys">${keys}</div>${play ? say(`h${g.round}`, 'Know the word? Type it…') : ''}</div>${scoreRow(g.points, H)}`;
  };

  G.wordchain = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Word Chain');
    const mine = g.turnId === H.state.me;
    const chain = g.chain.map((c) => (c.word ? `<span class="wc">${c.id ? `<small>${H.esc(H.player(c.id).name)}</small>` : '<small>start</small>'}${H.esc(c.word)}</span>` : `<span class="wc out"><small>${H.esc(H.player(c.id).name)}</small>ran out of time ✕</span>`)).join('<span class="arrow">→</span>');
    const alive = H.state.players.map((p) => H.chip(p, ` <span class="score">${g.points[p.id] || 0}</span>`, `${g.turnId === p.id ? 'turn' : ''} ${g.alive.includes(p.id) ? '' : 'outp'}`)).join('');
    const status = mine ? `${H.ic('sparkle', 18)} Your turn! Start with <b>${g.letter}</b>` : g.turnId ? `${H.esc(H.player(g.turnId).name)}'s turn: a word starting with <b>${g.letter}</b>` : '';
    return `${H.header('Word Chain')}<div class="card">${timer(g.phaseEnds, g.time)}<div class="status">${status}</div><div class="chain">${chain}</div>${mine ? say(`w${g.chain.length}`, `A word starting with ${g.letter}…`) : ''}<div class="who">${alive}</div></div>`;
  };

  const card = (c) => (c ? `<span class="pc ${c.s === '♥' || c.s === '♦' ? 'red' : ''}">${H_esc(c.r)}<small>${c.s}</small></span>` : '<span class="pc back"></span>');
  const H_esc = (s) => String(s).replace(/[&<>"']/g, '');
  G.blackjack = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Blackjack');
    const me = g.players[H.state.me];
    const canPlay = g.phase === 'play' && me && !me.done;
    const others = Object.entries(g.players).filter(([id]) => id !== H.state.me).map(([id, h]) => `<div class="bjo">${H.chip(H.player(id), ` <span class="score">${h.value}${h.result ? ` · ${h.result}` : h.done ? ' · stand' : ''}</span>`)}</div>`).join('');
    const res = me && me.result ? { blackjack: `${H.ic('crown', 20)} Blackjack!`, win: `${H.ic('trophy', 20)} You win!`, push: 'Push (tie)', lose: 'Pixel Bot wins this one', bust: `${H.ic('cross', 16)} Bust!` }[me.result] : '';
    return `${H.header(`Blackjack · Hand ${g.hand} of ${g.hands}`)}<div class="card">${g.phase === 'play' ? timer(g.phaseEnds, g.time) : ''}
<h2>${H.ic('robot', 18)} Pixel Bot (dealer)${g.dealerValue !== null ? ` · ${g.dealerValue}` : ''}</h2><div class="hand2">${g.dealer.map(card).join('')}</div>
<h2 style="margin-top:14px">You${me ? ` · ${me.value}` : ''}</h2><div class="hand2">${me ? me.cards.map(card).join('') : '<span class="sub">You\'ll be dealt in next hand.</span>'}</div>
<div class="status">${res || (canPlay ? 'Hit for another card, or stand.' : g.phase === 'dealer' ? 'Pixel Bot is drawing…' : me ? 'Waiting for the others…' : '')}</div>
${canPlay ? '<div class="row"><button class="btn" data-act="play" data-move="hit">Hit</button><button class="btn pink" data-act="play" data-move="stand">Stand</button></div>' : ''}${others ? `<div class="bjothers">${others}</div>` : ''}</div>${scoreRow(g.points, H)}`;
  };

  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  G.pig = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Pig');
    const mine = g.turnId === H.state.me;
    const bars = g.order.map((id) => `<div class="pigbar ${g.turnId === id ? 'turn' : ''}">${H.chip(H.player(id))}<div class="bar"><i style="width:${Math.min(100, (g.banked[id] / g.goal) * 100)}%"></i></div><b>${g.banked[id]}</b></div>`).join('');
    const roll = g.roll ? `<div class="die">${DIE[g.roll.d]}</div><p class="sub">${H.esc(H.player(g.roll.id).name)} rolled ${g.roll.d}</p>` : '<div class="die">⚄</div>';
    const log = g.log.map((l) => `<div class="sub">${H.esc(H.player(l.id).name)} ${H.esc(l.text)}</div>`).join('');
    return `${H.header(`Pig · first to ${g.goal}`)}<div class="card">${timer(g.phaseEnds, g.time)}${roll}<div class="status">${mine ? `${H.ic('sparkle', 18)} Pot: <b>${g.pot}</b>. Roll again or hold?` : `${H.esc(H.player(g.turnId).name)}'s turn · pot ${g.pot}`}</div>
${mine ? '<div class="row"><button class="btn" data-act="play" data-move="roll">Roll</button><button class="btn pink" data-act="play" data-move="hold">Hold</button></div>' : ''}<div class="pigbars">${bars}</div>${log}</div>`;
  };

  G.snakes = (g, H) => {
    if (g.finished) return finalScreen(g, H, 'Snakes and Ladders');
    const mine = g.turnId === H.state.me;
    let cells = '';
    for (let row = 9; row >= 0; row--) {
      for (let col = 0; col < 10; col++) {
        const n = row * 10 + (row % 2 === 0 ? col + 1 : 10 - col);
        const to = g.jumps[n];
        const here = g.order.filter((id) => g.pos[id] === n).map((id) => `<i class="tok" style="background:${H.esc(H.player(id).color)}"></i>`).join('');
        cells += `<div class="sl ${to ? (to > n ? 'lad' : 'snk') : ''}"><small>${n}</small>${to ? `<em>${to > n ? '🪜' : '🐍'}${to}</em>` : ''}<span>${here}</span></div>`;
      }
    }
    const l = g.last;
    const lastText = l ? `${H.esc(H.player(l.id).name)} rolled ${DIE[l.d]} ${l.d}${l.kind === 'ladder' ? `, climbed a ladder to ${l.to}!` : l.kind === 'snake' ? `, slid down a snake to ${l.to}!` : ` to ${l.to}`}${l.d === 6 ? ' (rolls again)' : ''}` : 'Roll to start. A six rolls again!';
    const start = g.order.filter((id) => g.pos[id] === 0).map((id) => H.chip(H.player(id))).join('');
    return `${H.header('Snakes and Ladders')}<div class="card">${timer(g.phaseEnds, g.time)}<div class="status">${mine ? `${H.ic('sparkle', 18)} Your turn!` : `${H.esc(H.player(g.turnId).name)}'s turn`}</div><p class="sub">${lastText}</p>
${mine ? '<div class="row" style="margin:0 0 12px"><button class="btn" data-act="play" data-move="roll">🎲 Roll</button></div>' : ''}<div class="slb">${cells}</div>${start ? `<div class="who">Not started: ${start}</div>` : ''}</div>`;
  };

  // Clicks that need more than one tap.
  G.click = (a, el, g, H) => {
    if (a === 'ck') return G.checkersClick(el, g, H);
    if (a === 'cp') return G.chopsticksClick(el, g, H);
    if (a === 'cb' || a === 'cbx' || a === 'cbgo') return G.codebreakerClick(el, g, H, a);
    if (a === 'sp') return G.simonClick(el, g, H);
    return null;
  };

  // Animations that run between server updates (Simon's pattern).
  G.animate = (now) => {
    const box = document.querySelector('.simon[data-show]');
    if (!box || !box.dataset.show) return;
    const start = Number(box.dataset.show);
    const seq = box.dataset.seq.split('').map(Number);
    const k = Math.floor((now - start) / 700);
    const lit = k >= 0 && k < seq.length && (now - start) % 700 < 480 ? seq[k] : -1;
    box.querySelectorAll('.spad').forEach((p) => p.classList.toggle('lit', Number(p.dataset.pad) === lit));
  };

  window.PAGames = G;
})();
