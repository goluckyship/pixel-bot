// Pixel Arcade: the screen players see inside Discord.
(function () {
  const app = document.getElementById('app');
  const clientId = document.body.dataset.client;
  const web = document.body.dataset.mode === 'web'; // played in a normal browser tab from the dashboard
  const link = web ? null : new window.DiscordLink(clientId);
  const roomId = web ? document.body.dataset.room : link.instanceId;
  let token = web ? document.body.dataset.token : null;
  let state = null;
  let offset = 0; // server clock minus ours
  let picking = null; // a 2-player game waiting for an opponent choice
  let busy = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now() + offset;
  const player = (id) => (state && state.players.find((p) => p.id === id)) || { id, name: 'Someone', color: '#9fb3d1', score: 0, wins: 0 };
  const ver = (document.querySelector('script[src*="arcade.js"]')?.src.split('?v=')[1]) || '';
  const ic = (name, h = 18) => `<img class="ic" src="/activity/i-${name}.svg?v=${ver}" alt="" style="height:${h}px">`;
  const av = (p) => (p.bot ? '<span class="av botav"><img src="/activity/bot.svg" alt=""></span>' : `<span class="av" style="background:${esc(p.color)}">${esc((p.name || '?').trim()[0] || '?').toUpperCase()}</span>`);
  const chip = (p, extra = '', cls = '') => `<span class="chip ${p.id === state.me ? 'me' : ''} ${cls}">${av(p)}${esc(p.name)}${extra}</span>`;

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function screen(html) { app.innerHTML = `<div class="wrap">${html}</div>`; }
  function message(title, text, retry) {
    screen(`<div class="boot"><div class="bot big"></div><h1>${esc(title)}</h1><p class="sub">${esc(text)}</p>${retry ? '<div class="row"><button class="btn" data-act="reload">Try again</button></div>' : ''}</div>`);
  }

  // ---------- talking to the server ----------
  async function api(path, options = {}) {
    const res = await fetch(`/activity/api/${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || `Error ${res.status}`); e.status = res.status; throw e; }
    return body;
  }

  async function act(body) {
    if (busy) return false;
    busy = true;
    try {
      const next = await api('act', { method: 'POST', body: JSON.stringify({ room: roomId, ...body }) });
      take(next);
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    } finally {
      busy = false;
    }
  }

  function take(next) {
    if (!next || (state && next.version < state.version)) return;
    if (next.game && next.game.now) offset = next.game.now - Date.now();
    state = next;
    render();
  }

  async function poll() {
    for (;;) {
      try {
        const next = await api(`state?room=${encodeURIComponent(roomId)}&since=${state ? state.version : 0}`);
        take(next);
      } catch (e) {
        if (e.status === 401) return message('Logged out', web ? 'Refresh the page to keep playing.' : 'Close and reopen the activity to keep playing.', web);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // ---------- screens ----------
  function header(sub) {
    const code = web ? `<span class="tag" style="margin:0 0 0 6px">Room ${esc(document.body.dataset.code)}</span>` : '';
    const back = state.game ? `<button class="btn ghost" data-act="lobby">${ic('back', 14)} Lobby</button>` : web ? `<a class="btn ghost" href="/arcade" style="text-decoration:none">${ic('back', 14)} Rooms</a>` : '';
    return `<div class="top"><div class="brand"><div class="bot"></div><div><h1>Pixel Arcade${code}</h1><div class="sub" style="text-align:left;margin:0">${sub}</div></div></div>${back}</div>`;
  }

  function lobby() {
    const players = state.players.map((p) => chip(p, ` <span class="score">${ic('star', 13)}${p.score}</span>`)).join('');
    if (picking) {
      const g = state.games[picking];
      const twoPlayer = g.mode === 'duel';
      const others = state.players.filter((p) => p.id !== state.me && !p.bot);
      const levels = Object.entries(state.levels).map(([id, name]) => `<button class="btn ${id === 'hard' ? 'pink' : id === 'easy' ? 'ghost' : ''}" data-act="start" data-game="${picking}" data-bot="1" data-level="${id}">${name}</button>`).join('');
      const people = twoPlayer
        ? others.map((p) => `<button class="btn ghost" data-act="start" data-game="${picking}" data-with="${esc(p.id)}">${av(p)} ${esc(p.name)}</button>`).join('')
        : `<button class="btn ghost" data-act="start" data-game="${picking}">${ic('person', 16)} ${others.length ? `Everyone here (${others.length + 1})` : 'Just me'}</button>`;
      return `${header(`${esc(g.name)}: pick who to play`)}
<div class="card pickcard"><div class="pickhead"><img src="/activity/bot.svg" alt="" class="pickbot"><div><h2>Play ${twoPlayer ? 'against' : 'with'} Pixel Bot</h2><p class="sub" style="text-align:left;margin:0">Pick how tough it plays.</p></div></div><div class="row">${levels}</div></div>
${people ? `<div class="card pickcard"><h2>${twoPlayer ? 'Play a friend' : 'Play without Pixel Bot'}</h2><div class="row">${people}</div>${twoPlayer && !others.length ? '' : ''}</div>` : `<div class="card pickcard"><h2>Play a friend</h2><p class="sub" style="text-align:left">Nobody else is here yet. ${web ? `Share room code <b>${esc(document.body.dataset.code)}</b>.` : 'Invite friends into the activity.'}</p></div>`}
<div class="row"><button class="btn ghost" data-act="cancel">Cancel</button></div>`;
    }
    const card = ([id, g]) => `<button class="game" data-act="pick" data-game="${id}"><span class="em">${ic(g.icon || 'star', 40)}</span><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small><span class="tag">${esc(g.players)}</span></button>`;
    const all = Object.entries(state.games);
    const cards = `<h2 class="sect">${ic('robot', 18)} 1v1 games <small>vs a friend or Pixel Bot</small></h2><div class="games">${all.filter(([, g]) => g.mode === 'duel').map(card).join('')}</div>
<h2 class="sect">${ic('person', 18)} Party games <small>everyone at once, Pixel Bot can join</small></h2><div class="games">${all.filter(([, g]) => g.mode !== 'duel').map(card).join('')}</div>`;
    return `${header(`${state.players.length} player${state.players.length === 1 ? '' : 's'} here`)}
<div class="card"><h2>Players</h2><div class="players">${players}</div></div>
${cards}
<p class="foot">${web ? `Friends join from the dashboard: menu, then Arcade, then enter room code <b>${esc(document.body.dataset.code)}</b>.` : "Anyone in the activity can start a game. Invite friends with the activity's invite button."}</p>`;
  }

  function finishedButtons() {
    return `<div class="row"><button class="btn" data-act="rematch">${ic('replay', 15)} Play again</button><button class="btn ghost" data-act="lobby">Back to lobby</button></div>`;
  }

  function boardGame(g) {
    const isTtt = g.type === 'tictactoe';
    const marks = isTtt ? [ic('x', 16), ic('o', 16)] : ['<i class="disc d0"></i>', '<i class="disc d1"></i>'];
    const mySeat = g.seats.indexOf(state.me);
    const seats = g.seats.map((id, i) => chip(player(id), ` <span class="mark">${marks[i]}</span>`, !g.finished && g.turn === i ? 'turn' : '')).join('<span class="pixel">vs</span>');
    let status;
    if (g.winner !== null && g.winner !== undefined) status = g.seats[g.winner] === state.me ? `${ic('crown', 20)} You win!` : `${ic('trophy', 20)} ${esc(player(g.seats[g.winner]).name)} wins!`;
    else if (g.draw) status = "It's a draw!";
    else if (mySeat < 0) status = `Watching: ${esc(player(g.seats[g.turn]).name)}'s turn`;
    else status = g.turn === mySeat ? `${ic('sparkle', 18)} Your turn!` : player(g.seats[g.turn]).bot ? `${ic('robot', 18)} Pixel Bot is thinking…` : `Waiting for ${esc(player(g.seats[g.turn]).name)}…`;
    const canPlay = !g.finished && mySeat === g.turn;
    let board;
    if (isTtt) {
      board = `<div class="board ttt">${g.board.map((v, i) => `<button class="cell ${v === 0 ? 'x' : v === 1 ? 'o' : ''} ${g.line.includes(i) ? 'win' : ''}" data-act="move" data-cell="${i}" ${canPlay && v === null ? '' : 'disabled'}>${v === null ? '' : `<img src="/activity/i-${v === 0 ? 'x' : 'o'}.svg" alt="${v === 0 ? 'X' : 'O'}">`}</button>`).join('')}</div>`;
    } else {
      board = `<div class="board c4">${g.board.map((v, i) => `<button class="hole ${v === null ? '' : `p${v}`} ${g.line.includes(i) ? 'win' : ''} ${g.last === i ? 'last' : ''}" data-act="move" data-cell="${i % 7}" ${canPlay ? '' : 'disabled'} aria-label="Column ${(i % 7) + 1}"></button>`).join('')}</div>`;
    }
    return `${header(state.games[g.type].name)}<div class="seat">${seats}</div><div class="status">${status}</div>${board}${g.finished ? finishedButtons() : ''}`;
  }

  function leaderboard(points, unit) {
    const rows = Object.entries(points).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<p class="sub">Nobody scored this time!</p>';
    return `<div class="lb">${rows.map(([id, pts], i) => chip(player(id), ` <span class="score" style="margin-left:auto">${i === 0 ? ic('crown', 14) : ''} ${pts} ${unit}</span>`)).join('')}</div>`;
  }

  function trivia(g) {
    if (g.phase === 'done') return `${header('Trivia Party')}<div class="card"><h2 style="text-align:center">${ic('trophy', 24)} Final scores</h2>${leaderboard(g.points, 'pts')}</div>${finishedButtons()}`;
    const left = Math.max(0, g.phaseEnds - now());
    const reveal = g.phase === 'reveal';
    const opts = g.options.map((o, i) => {
      const cls = [`o${i}`, reveal && i !== g.answer ? 'dim' : '', reveal && i === g.answer ? 'right' : '', g.mine && g.mine.choice === i ? 'mine' : ''].join(' ');
      const pickers = reveal && g.picks ? Object.entries(g.picks).filter(([, c]) => c === i).map(([id]) => player(id).name) : [];
      return `<button class="opt ${cls}" data-act="answer" data-choice="${i}" ${g.mine || reveal ? 'disabled' : ''}>${esc(o)}${pickers.length ? `<br><small>${pickers.map(esc).join(', ')}</small>` : ''}</button>`;
    }).join('');
    let status = '';
    if (reveal) status = g.mine ? (g.mine.choice === g.answer ? `${ic('check', 18)} Right! +${g.mine.pts || 0}` : `${ic('cross', 16)} Not this time`) : `${ic('clock', 18)} Out of time`;
    else status = g.mine ? 'Locked in! Waiting for the others…' : 'Pick fast: quicker answers score more!';
    const answered = state.players.map((p) => (g.answered.includes(p.id) ? chip(p, ` ${ic('check', 12)}`) : '')).join('');
    return `${header(`Trivia Party · Question ${g.index + 1} of ${g.total}`)}
<div class="card"><div class="bar"><i id="timebar" style="width:${reveal ? 0 : (left / 15000) * 100}%"></i></div>
<div class="q">${esc(g.question)}</div><div class="opts">${opts}</div><div class="status" style="margin-top:14px">${status}</div><div class="who">${answered}</div></div>`;
  }

  function reaction(g) {
    if (g.phase === 'done') return `${header('Reaction Race')}<div class="card"><h2 style="text-align:center">${ic('trophy', 24)} Round wins</h2>${leaderboard(g.wins, 'wins')}</div>${finishedButtons()}`;
    let cls = 'wait';
    let text = 'Wait for green…<small>Clicking early is a foul!</small>';
    if (g.phase === 'wait' && g.fouls[state.me]) text = `${ic('cross', 26)} Too early!<small>Wait for the next round</small>`;
    if (g.phase === 'go') {
      cls = 'go';
      text = g.results[state.me] !== undefined ? `${g.results[state.me]} ms<small>Nice! Waiting for the others…</small>` : g.fouls[state.me] ? 'You fouled this round<small>Next one!</small>' : 'CLICK!';
    }
    if (g.phase === 'result') {
      cls = 'result';
      text = g.roundWinner ? `${ic('bolt', 26)} ${esc(player(g.roundWinner).name)} wins the round!<small>${g.results[g.roundWinner]} ms</small>` : 'Nobody clicked in time!';
    }
    const scores = state.players.map((p) => chip(p, ` <span class="score">${g.wins[p.id] || 0}</span>`)).join('');
    return `${header(`Reaction Race · Round ${g.round} of ${g.rounds}`)}<div class="pad ${cls}" data-act="click"><div>${text}</div></div><div class="who" style="margin-top:16px">${scores}</div>`;
  }

  // Helpers the newer games' screens (games.js) use.
  const H = {
    get state() { return state; }, esc, ic, av, chip, player, now, header, act, render: () => render(),
    finished: () => finishedButtons(), lb: (points, unit) => leaderboard(points, unit),
  };

  function render() {
    if (!state) return;
    const g = state.game;
    // Keep whatever someone is typing when the screen redraws.
    const box = document.getElementById('say');
    const typing = box ? { key: box.dataset.key, value: box.value, focused: document.activeElement === box, at: box.selectionStart } : null;
    if (!g) return screen(lobby());
    if (window.PAGames && window.PAGames[g.type]) {
      screen(window.PAGames[g.type](g, H));
      const next = document.getElementById('say');
      if (next && typing && typing.key === next.dataset.key) {
        next.value = typing.value;
        if (typing.focused) { next.focus(); try { next.setSelectionRange(typing.at, typing.at); } catch (e) { /* number boxes */ } }
      } else if (next && !('ontouchstart' in window)) next.focus();
      return;
    }
    if (g.type === 'tictactoe' || g.type === 'connect4') return screen(boardGame(g));
    if (g.type === 'trivia') return screen(trivia(g));
    if (g.type === 'reaction') return screen(reaction(g));
  }

  // Countdown bars and little animations, without redrawing everything.
  setInterval(() => {
    document.querySelectorAll('.tbar').forEach((b) => {
      const ends = Number(b.dataset.ends); const total = Number(b.dataset.total) || 1;
      b.style.width = `${ends ? Math.max(0, Math.min(100, ((ends - now()) / total) * 100)) : 0}%`;
    });
    if (window.PAGames) window.PAGames.animate(now());
  }, 100);
  setInterval(() => {
    const bar = document.getElementById('timebar');
    const g = state && state.game;
    if (bar && g && g.type === 'trivia' && g.phase === 'question') bar.style.width = `${Math.max(0, ((g.phaseEnds - now()) / 15000) * 100)}%`;
  }, 200);

  // ---------- clicks ----------
  app.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-act="click"]');
    if (el) { e.preventDefault(); act({ action: 'click' }); }
  });
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    if (a === 'reload') return location.reload();
    if (a === 'click') return;
    if (a === 'cancel') { picking = null; return render(); }
    if (a === 'pick') {
      picking = el.dataset.game;
      return render();
    }
    if (a === 'start') { picking = null; return act({ action: 'start', game: el.dataset.game, with: el.dataset.with, bot: el.dataset.bot === '1', level: el.dataset.level }); }
    if (a === 'move') return act({ action: 'move', cell: Number(el.dataset.cell) });
    if (a === 'answer') return act({ action: 'answer', choice: Number(el.dataset.choice) });
    if (a === 'lobby' || a === 'rematch') return act({ action: a });
    if (a === 'play') return act({ action: 'play', move: el.dataset.move });
    if (window.PAGames && state && state.game) window.PAGames.click(a, el, state.game, H);
  });
  app.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-act="say"]');
    if (!form) return;
    e.preventDefault();
    const box = form.querySelector('input');
    const text = box.value.trim();
    if (!text) return;
    act({ action: 'play', move: text }).then((ok) => {
      const now = document.getElementById('say');
      if (ok && now) now.value = '';
      else if (!ok && now) now.select(); // wrong: keep it so it's easy to fix
    });
  });

  // ---------- start ----------
  async function start() {
    if (web) { app.innerHTML = ''; return poll(); }
    if (!link.inDiscord) return message('Open me in Discord', 'Pixel Arcade is a Discord Activity. Start it from the Activities button in a voice channel or chat.', false);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000));
    try {
      await Promise.race([link.ready, timeout]);
    } catch {
      return message('Couldn\'t reach Discord', 'Close the activity and open it again.', true);
    }
    let login;
    try {
      const { code } = await link.authorize();
      login = await api('login', { method: 'POST', body: JSON.stringify({ code }) });
    } catch (e) {
      return message('Login didn\'t work', `${e.message}. Close the activity and open it again.`, true);
    }
    token = login.token;
    link.authenticate(login.accessToken).catch(() => {});
    app.innerHTML = '';
    poll();
  }
  start();
})();
