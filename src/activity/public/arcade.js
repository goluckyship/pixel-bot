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
  const av = (p) => `<span class="av" style="background:${esc(p.color)}">${esc((p.name || '?').trim()[0] || '?').toUpperCase()}</span>`;
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
    if (busy) return;
    busy = true;
    try {
      const next = await api('act', { method: 'POST', body: JSON.stringify({ room: roomId, ...body }) });
      take(next);
    } catch (e) {
      toast(e.message);
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
    const back = state.game ? '<button class="btn ghost" data-act="lobby">⟵ Lobby</button>' : web ? '<a class="btn ghost" href="/arcade" style="text-decoration:none">⟵ Rooms</a>' : '';
    return `<div class="top"><div class="brand"><div class="bot"></div><div><h1>Pixel Arcade${code}</h1><div class="sub" style="text-align:left;margin:0">${sub}</div></div></div>${back}</div>`;
  }

  function lobby() {
    const players = state.players.map((p) => chip(p, ` <span class="score">★${p.score}</span>`)).join('');
    if (picking) {
      const g = state.games[picking];
      const others = state.players.filter((p) => p.id !== state.me);
      return `${header('Pick who to play')}<div class="card"><h2>${g.emoji} ${esc(g.name)}: who do you want to play?</h2>
<div class="row">${others.map((p) => `<button class="btn ghost" data-act="start" data-game="${picking}" data-with="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
<div class="row"><button class="btn pink" data-act="cancel">Cancel</button></div></div>`;
    }
    const cards = Object.entries(state.games).map(([id, g]) => `<button class="game" data-act="pick" data-game="${id}"><span class="em">${g.emoji}</span><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small><span class="tag">${esc(g.players)}</span></button>`).join('');
    return `${header(`${state.players.length} player${state.players.length === 1 ? '' : 's'} here`)}
<div class="card"><h2>Players</h2><div class="players">${players}</div></div>
<div class="games">${cards}</div>
<p class="foot">${web ? `Friends join from the dashboard: ☰ menu → Arcade → enter room code <b>${esc(document.body.dataset.code)}</b>.` : "Anyone in the activity can start a game. Invite friends with the activity's invite button."}</p>`;
  }

  function finishedButtons() {
    return '<div class="row"><button class="btn" data-act="rematch">↻ Play again</button><button class="btn ghost" data-act="lobby">Back to lobby</button></div>';
  }

  function boardGame(g) {
    const isTtt = g.type === 'tictactoe';
    const marks = isTtt ? ['X', 'O'] : ['<i class="disc d0"></i>', '<i class="disc d1"></i>'];
    const mySeat = g.seats.indexOf(state.me);
    const seats = g.seats.map((id, i) => chip(player(id), ` <span class="mark">${marks[i]}</span>`, !g.finished && g.turn === i ? 'turn' : '')).join('<span class="pixel">vs</span>');
    let status;
    if (g.winner !== null && g.winner !== undefined) status = g.seats[g.winner] === state.me ? '🎉 You win!' : `${esc(player(g.seats[g.winner]).name)} wins!`;
    else if (g.draw) status = "It's a draw!";
    else if (mySeat < 0) status = `Watching: ${esc(player(g.seats[g.turn]).name)}'s turn`;
    else status = g.turn === mySeat ? '✨ Your turn!' : `Waiting for ${esc(player(g.seats[g.turn]).name)}…`;
    const canPlay = !g.finished && mySeat === g.turn;
    let board;
    if (isTtt) {
      board = `<div class="board ttt">${g.board.map((v, i) => `<button class="cell ${v === 0 ? 'x' : v === 1 ? 'o' : ''} ${g.line.includes(i) ? 'win' : ''}" data-act="move" data-cell="${i}" ${canPlay && v === null ? '' : 'disabled'}>${v === null ? '' : marks[v]}</button>`).join('')}</div>`;
    } else {
      board = `<div class="board c4">${g.board.map((v, i) => `<button class="hole ${v === null ? '' : `p${v}`} ${g.line.includes(i) ? 'win' : ''} ${g.last === i ? 'last' : ''}" data-act="move" data-cell="${i % 7}" ${canPlay ? '' : 'disabled'} aria-label="Column ${(i % 7) + 1}"></button>`).join('')}</div>`;
    }
    return `${header(state.games[g.type].name)}<div class="seat">${seats}</div><div class="status">${status}</div>${board}${g.finished ? finishedButtons() : ''}`;
  }

  function leaderboard(points, unit) {
    const rows = Object.entries(points).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<p class="sub">Nobody scored this time!</p>';
    return `<div class="lb">${rows.map(([id, pts], i) => chip(player(id), ` <span class="score" style="margin-left:auto">${i === 0 ? '👑 ' : ''}${pts} ${unit}</span>`)).join('')}</div>`;
  }

  function trivia(g) {
    if (g.phase === 'done') return `${header('Trivia Party')}<div class="card"><h2 style="text-align:center">🏆 Final scores</h2>${leaderboard(g.points, 'pts')}</div>${finishedButtons()}`;
    const left = Math.max(0, g.phaseEnds - now());
    const reveal = g.phase === 'reveal';
    const opts = g.options.map((o, i) => {
      const cls = [`o${i}`, reveal && i !== g.answer ? 'dim' : '', reveal && i === g.answer ? 'right' : '', g.mine && g.mine.choice === i ? 'mine' : ''].join(' ');
      const pickers = reveal && g.picks ? Object.entries(g.picks).filter(([, c]) => c === i).map(([id]) => player(id).name) : [];
      return `<button class="opt ${cls}" data-act="answer" data-choice="${i}" ${g.mine || reveal ? 'disabled' : ''}>${esc(o)}${pickers.length ? `<br><small>${pickers.map(esc).join(', ')}</small>` : ''}</button>`;
    }).join('');
    let status = '';
    if (reveal) status = g.mine ? (g.mine.choice === g.answer ? `✅ Right! +${g.mine.pts || 0}` : '❌ Not this time') : '⏰ Out of time';
    else status = g.mine ? 'Locked in! Waiting for the others…' : 'Pick fast: quicker answers score more!';
    const answered = state.players.map((p) => (g.answered.includes(p.id) ? chip(p, ' ✔') : '')).join('');
    return `${header(`Trivia Party · Question ${g.index + 1} of ${g.total}`)}
<div class="card"><div class="bar"><i id="timebar" style="width:${reveal ? 0 : (left / 15000) * 100}%"></i></div>
<div class="q">${esc(g.question)}</div><div class="opts">${opts}</div><div class="status" style="margin-top:14px">${status}</div><div class="who">${answered}</div></div>`;
  }

  function reaction(g) {
    if (g.phase === 'done') return `${header('Reaction Race')}<div class="card"><h2 style="text-align:center">🏆 Round wins</h2>${leaderboard(g.wins, 'wins')}</div>${finishedButtons()}`;
    let cls = 'wait';
    let text = 'Wait for green…<small>Clicking early is a foul!</small>';
    if (g.phase === 'wait' && g.fouls[state.me]) text = 'Too early! 😅<small>Wait for the next round</small>';
    if (g.phase === 'go') {
      cls = 'go';
      text = g.results[state.me] !== undefined ? `${g.results[state.me]} ms<small>Nice! Waiting for the others…</small>` : g.fouls[state.me] ? 'You fouled this round<small>Next one!</small>' : 'CLICK!';
    }
    if (g.phase === 'result') {
      cls = 'result';
      text = g.roundWinner ? `⚡ ${esc(player(g.roundWinner).name)} wins the round!<small>${g.results[g.roundWinner]} ms</small>` : 'Nobody clicked in time!';
    }
    const scores = state.players.map((p) => chip(p, ` <span class="score">${g.wins[p.id] || 0}</span>`)).join('');
    return `${header(`Reaction Race · Round ${g.round} of ${g.rounds}`)}<div class="pad ${cls}" data-act="click"><div>${text}</div></div><div class="who" style="margin-top:16px">${scores}</div>`;
  }

  function render() {
    if (!state) return;
    const g = state.game;
    if (!g) return screen(lobby());
    if (g.type === 'tictactoe' || g.type === 'connect4') return screen(boardGame(g));
    if (g.type === 'trivia') return screen(trivia(g));
    if (g.type === 'reaction') return screen(reaction(g));
  }

  // Smooth countdown bar without redrawing everything.
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
      const game = el.dataset.game;
      const twoPlayer = game === 'tictactoe' || game === 'connect4';
      const others = state.players.filter((p) => p.id !== state.me);
      if (twoPlayer && others.length > 1) { picking = game; return render(); }
      return act({ action: 'start', game });
    }
    if (a === 'start') { picking = null; return act({ action: 'start', game: el.dataset.game, with: el.dataset.with }); }
    if (a === 'move') return act({ action: 'move', cell: Number(el.dataset.cell) });
    if (a === 'answer') return act({ action: 'answer', choice: Number(el.dataset.choice) });
    if (a === 'lobby' || a === 'rematch') return act({ action: a });
  });

  // ---------- start ----------
  async function start() {
    if (web) { app.innerHTML = ''; return poll(); }
    if (!link.inDiscord) return message('Open me in Discord', 'Pixel Arcade is a Discord Activity. Start it from the 🚀 Activities button in a voice channel or chat.', false);
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
