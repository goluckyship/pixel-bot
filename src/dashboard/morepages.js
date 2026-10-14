// Extra dashboard pages: your appearance, bot status, help, guest arcade and the public home page.
const { esc, page, select, colorInput, hidden, pixelBot, PRESETS, FONTS, CORNERS, MODES, TEXT_SIZES, MOTIONS, WIDTHS } = require('./html');

const opts = (record) => Object.entries(record).map(([id, v]) => ({ id, name: typeof v === 'string' ? v : v.name }));
const pick = (vars, key) => (new RegExp(`--${key}:(#[0-9a-f]{6})`, 'i').exec(vars) ?? [])[1] ?? '#888888';

/** The public home page: log in, add Pixel Bot to a server, or play as a guest. */
function home() {
  return page({
    title: 'Welcome',
    body: `<div class="hero">${pixelBot(120, 'beat')}<h1>Pixel Bot</h1>
<p class="sub">Moderation, tickets, levels, welcome messages and 30 arcade games, all set up from one cosy dashboard. Free for any server.</p>
<div class="herobtns"><a class="button" href="/login">Log in with Discord</a><a class="button secondary" href="/invite">➕ Add to your server</a><a class="button secondary" href="/play">🎮 Play the arcade</a></div>
<p class="loginalt"><b>Can't use Discord on this computer?</b> <a class="linky" href="/code">Log in with a code</a> from your phone, or use a <a class="linky" href="/help#backup">backup login link</a>.</p></div>
<div class="features">
<div class="card"><b>🛡️ Keep it safe</b><p>Automod, warnings, timeouts, raid protection and a staff log.</p></div>
<div class="card"><b>🎟️ Tickets and applications</b><p>Unlimited panels with custom questions and private review channels.</p></div>
<div class="card"><b>⭐ Levels</b><p>Voice-time levels, role rewards and leaderboards.</p></div>
<div class="card"><b>🎮 Pixel Arcade</b><p>30 games in Discord or any browser. Play friends or Pixel Bot.</p></div>
</div>
<p class="foot"><a class="linky" href="/help">How it works</a> · <a class="linky" href="/status">Bot status</a></p>`,
  });
}

/** Your own look. */
function appearance(user, csrf, prefs, flash) {
  const presetCards = [['', { name: 'Server default' }], ...Object.entries(PRESETS)].map(([id, p]) => {
    const swatch = p.light
      ? `<span class="pv"><i style="background:${pick(p.light, 'bg')}"></i><i style="background:${pick(p.light, 'brand')}"></i><i style="background:${pick(p.dark, 'bg')}"></i><i style="background:${pick(p.dark, 'brand')}"></i></span>`
      : '<span class="pv"><i style="background:var(--bg)"></i><i style="background:var(--brand)"></i><i style="background:var(--card)"></i><i style="background:var(--pink)"></i></span>';
    return `<label class="pcard"><input type="radio" name="preset" value="${esc(id)}"${(prefs.preset ?? '') === id ? ' checked' : ''}>${swatch}<span>${esc(p.name)}</span></label>`;
  }).join('');
  return page({
    title: 'Appearance',
    user,
    body: `<div class="card"><h1>🎨 Your appearance</h1><p class="sub">Only changes how the dashboard looks for <b>you</b>, on every device you log in on.</p>
${flash ? `<div class="flash ${flash.ok ? 'ok' : 'bad'}">${esc(flash.text)}</div>` : ''}
<form method="post" action="/me/look">${hidden('csrf', csrf)}
<h2 class="minor">Theme</h2><div class="pcards">${presetCards}</div>
<div class="grid2">
<div><label>Light or dark</label>${select('mode', opts(MODES), prefs.mode, { blank: 'Server default' })}</div>
<div><label>Text size</label>${select('textSize', opts(TEXT_SIZES), prefs.textSize, { blank: 'Normal' })}</div>
<div><label>Font</label>${select('font', opts(FONTS), prefs.font, { blank: 'Server default' })}</div>
<div><label>Corners</label>${select('corners', opts(CORNERS), prefs.corners, { blank: 'Server default' })}</div>
<div><label>Animations</label>${select('motion', opts(MOTIONS), prefs.motion, { blank: 'Animations on' })}</div>
<div><label>Page width</label>${select('width', opts(WIDTHS), prefs.width, { blank: 'Normal' })}</div>
</div>
<label>Accent colour (buttons and links)</label>${colorInput('accent', prefs.accent, { defaultText: 'Use the theme\'s colour' })}
<div class="row2"><button type="submit">Save my look</button> <button type="submit" name="reset" value="1" class="secondary">Reset to default</button></div>
</form></div>`,
  });
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

/** Is Pixel Bot okay? */
function status(user, info) {
  const tiles = [
    [info.online ? '🟢 Online' : '🔴 Offline', 'Discord connection'],
    [`${info.ping} ms`, 'ping to Discord'],
    [fmtUptime(info.uptime), 'since last restart'],
    [info.servers, info.servers === 1 ? 'server' : 'servers'],
    [info.members.toLocaleString('en-US'), 'members in total'],
    [info.games, 'arcade games right now'],
    [`${info.memory} MB`, 'memory used'],
    [info.version ?? '—', 'version'],
  ];
  return page({
    title: 'Status',
    user,
    head: '<meta http-equiv="refresh" content="30">',
    body: `<div class="card"><h1>📡 Bot status</h1><p class="sub">Updates every 30 seconds.</p>
<div class="stats">${tiles.map(([n, l]) => `<div><b>${esc(n)}</b><small>${esc(l)}</small></div>`).join('')}</div>
${info.updated ? `<p class="help">Last update: ${esc(info.updated)}</p>` : ''}</div>
${info.crashes ? `<div class="card"><h2 class="minor">🧾 Starts, stops and errors (only you see this)</h2>${info.crashes.length ? info.crashes.map((c) => `<details class="fold"><summary><b>${esc({ start: '▶️ Started', stopped: '⏹️ Stopped', error: '⚠️ Error', rejection: '⚠️ Error', exit: '💥 Crashed' }[c.kind] ?? c.kind)}</b> <small class="muted">${esc(new Date(c.when).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'medium' }))}</small></summary><pre class="help" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(c.text)}</pre></details>`).join('') : '<p class="help">Nothing yet.</p>'}</div>` : ''}`,
  });
}

/** How everything works. */
function help(user) {
  const sec = (id, title, body) => `<details class="card fold" id="${id}"><summary><span class="t"><b>${title}</b></span></summary><div class="foldbody">${body}</div></details>`;
  return page({
    title: 'Help',
    user,
    body: `<h1>❓ Help</h1><p class="sub">Tap a question to open it.</p>
${sec('add', '➕ How do I add Pixel Bot to my server?', `<ol><li>Click <a class="linky" href="/invite">Add to your server</a> (also in the ☰ menu).</li><li>Discord asks which server: pick one where you have <b>Manage Server</b>.</li><li>Click <b>Authorize</b>.</li><li>Come back here and log in. Your server shows up in the list.</li></ol><p>Everything starts switched off in a new server, so nothing happens until you turn things on.</p>`)}
${sec('remove', '🚪 How do I remove Pixel Bot from a server?', '<p>Open the server on the dashboard, scroll to <b>Danger zone</b> and open <b>Remove Pixel Bot from this server</b>. Type the server name and press <b>Remove Pixel Bot</b>. You can also tick the box to erase its settings. You need Manage Server (or be the server owner).</p>')}
${sec('who', '👥 Who can change my server\'s settings?', '<p>The server owner, anyone with the <b>Manage Server</b> permission, and anyone the bot owner adds by hand. Everyone else only sees servers they manage.</p>')}
${sec('login', '🔑 What are all the ways to log in?', `<ul><li><b>Log in with Discord</b>: the normal way.</li><li><b>Log in with a code</b>: for computers where Discord is blocked. The page shows a code; type <code>/login</code> with that code in Discord on your phone.</li><li><b id="backup">Backup login links</b>: make one-time links in <a class="linky" href="/account">Login and devices</a>. Each one works once. Keep them private.</li><li><b>Guest arcade</b>: play the games without logging in at all (no dashboard access).</li></ul><p>You stay logged in for 60 days. Lost a device? Use <b>Log out everywhere</b> in Login and devices.</p>`)}
${sec('arcade', '🎮 How do I play the arcade?', `<ul><li><b>In Discord (computer or phone)</b>: join a voice channel, tap the 🚀 rocket (Activities) and pick Pixel Bot. Or type <code>/launch</code>.</li><li><b>In any browser</b>: open <a class="linky" href="/play">the arcade page</a>. Log in, or just type a name to play as a guest.</li><li><b>With friends</b>: open a private room and tap <b>Share</b>. Anyone with the link can join.</li><li><b>Against Pixel Bot</b>: tap <b>vs Bot</b> on any game, or pick Easy, Normal or Hard.</li></ul>`)}
${sec('look', '🎨 Can I change how it looks?', '<p>Yes. <a class="linky" href="/me/look">Appearance</a> lets you pick a theme, light or dark, text size, font, corners, animations and an accent colour, just for you.</p>')}
${sec('cmd', '⌨️ Can I use commands without Discord?', '<p>Yes. On a server\'s page, press <b>Run a command</b>. The action still happens in Discord; the bot\'s reply shows on the dashboard.</p>')}`,
  });
}

/** Play the arcade as a guest (no Discord needed). */
function guestPlay(user, guest, code, error) {
  const who = user
    ? `<p class="sub">You're logged in as <b>${esc(user.username)}</b>.</p><div class="herobtns"><a class="button" href="/arcade/play?room=${esc(code || 'MAIN')}">Play now</a><a class="button secondary" href="/arcade">Pick a room</a></div>`
    : `<form method="post" action="/play" class="guestform">${hidden('room', code || '')}
<label>Your name</label><input type="text" name="name" maxlength="20" required placeholder="What should we call you?" value="${esc(guest?.name ?? '')}" autocomplete="nickname">
<label>Room code <small class="muted">(leave empty for the main room)</small></label><input type="text" name="code" maxlength="8" value="${esc(code || '')}" placeholder="e.g. K7PQ2" autocapitalize="characters">
<button type="submit">🎮 Play</button></form>
<p class="help">Guests can play every game. <a class="linky" href="/login">Log in</a> to keep your name and use the dashboard.</p>`;
  return page({
    title: 'Pixel Arcade',
    user,
    body: `<div class="hero" style="padding-bottom:10px">${pixelBot(90, 'beat')}<h1>Pixel Arcade</h1><p class="sub">30 games. Play friends or Pixel Bot on any phone, tablet or computer.</p>
${error ? `<div class="flash bad">${esc(error)}</div>` : ''}${who}</div>`,
  });
}

/** Shown while Pixel Bot is still connecting to Discord. Refreshes itself. */
function waking(seconds) {
  return page({
    title: 'Waking up',
    head: '<meta http-equiv="refresh" content="15">',
    body: `<div class="hero">${pixelBot(110, 'beat')}<h1>Pixel Bot is waking up…</h1>
<p class="sub">It's connecting to Discord. This page refreshes by itself every 15 seconds.</p>
<p class="help">Started ${seconds < 90 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`} ago. If this takes more than a few minutes, Discord is probably slowing down the hosting company's connection for a while. It fixes itself; nothing on your end needs changing.</p></div>`,
  });
}

module.exports = { home, appearance, status, help, guestPlay, waking };
