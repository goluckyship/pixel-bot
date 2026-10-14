// Terms of Service and Privacy Policy pages (linked from the Discord Developer Portal).
const { page } = require('./html');

const UPDATED = 'October 14, 2026';

const doc = (title, emoji, sections) => page({
  title,
  body: `<div class="card legal"><h1>${emoji} ${title}</h1><p class="sub">Pixel Bot · last updated ${UPDATED}</p>
${sections.map(([h, b]) => `<h2 class="minor">${h}</h2>${b}`).join('\n')}
<p class="foot"><a class="linky" href="/terms">Terms of Service</a> · <a class="linky" href="/privacy">Privacy Policy</a> · <a class="linky" href="/">Home</a></p></div>`,
});

function terms() {
  return doc('Terms of Service', '📜', [
    ['Using Pixel Bot', '<p>Pixel Bot is a free Discord bot with a web dashboard and the Pixel Arcade. By adding it to a server, using its commands, the dashboard or the arcade, you agree to these terms and to <a class="linky" href="https://discord.com/terms" rel="noopener">Discord\'s Terms of Service</a>.</p>'],
    ['Be decent', '<ul><li>Don\'t use Pixel Bot to spam, harass, scam or break Discord\'s rules or the law.</li><li>Don\'t try to break, overload or get around the bot, the dashboard or its logins.</li><li>Don\'t share your backup login links or codes with anyone.</li></ul>'],
    ['Server staff', '<p>Server owners and staff choose how Pixel Bot is set up in their server (moderation, tickets, applications, levels and so on) and are responsible for how they use it there.</p>'],
    ['No guarantees', '<p>Pixel Bot is a hobby project, provided "as is". It can go offline, change, or lose data without warning. Features may be added or removed at any time.</p>'],
    ['Being removed', '<p>Access can be taken away from anyone who misuses Pixel Bot. Server staff can remove the bot at any time from the dashboard (🗑️ Remove) or Discord\'s server settings.</p>'],
    ['Changes', '<p>These terms can be updated. The date at the top shows the latest version. Keeping on using Pixel Bot means you accept the newest version.</p>'],
    ['Contact', '<p>Questions? Ask in Pixel Bot\'s home server, <b>The Pixel Bassment</b>, or message the bot owner on Discord.</p>'],
  ]);
}

function privacy() {
  return doc('Privacy Policy', '🔒', [
    ['What Pixel Bot stores', `<ul>
<li><b>Discord IDs</b> of servers, channels, roles and people, so settings and features work.</li>
<li><b>Server settings</b> that staff choose on the dashboard.</li>
<li><b>Moderation records</b>: warnings, timeouts and the reasons given.</li>
<li><b>Levels and voice time</b> if a server turns levels on.</li>
<li><b>Tickets and applications</b>: the answers people type in, so staff can review them.</li>
<li><b>Dashboard logins</b>: your Discord ID, username and avatar, plus a login cookie. Backup login links are stored only as a scrambled fingerprint (hash), never the link itself.</li>
<li><b>Your appearance choices</b> on the dashboard.</li>
<li><b>Arcade</b>: the name you play under and game scores while a game is running.</li></ul>`],
    ['Messages', '<p>Pixel Bot reads messages only to do what a server turned on, like the word filter, automod, auto-replies and the staff log. It doesn\'t keep a copy of normal chat. If a server uses the staff log, deleted or edited messages are posted to that server\'s own log channel.</p>'],
    ['What it doesn\'t do', '<ul><li>No selling or sharing your data with anyone.</li><li>No ads and no tracking on the website. (It loads its fonts from Google Fonts.)</li><li>It never asks for your Discord password. Logging in goes through Discord itself.</li></ul>'],
    ['Where it\'s kept', '<p>Data is kept on the server that runs Pixel Bot (Wispbyte hosting). Pictures from Discord are loaded through the website so it works where Discord\'s image server is blocked; they aren\'t saved.</p>'],
    ['How long', '<p>Settings stay until they\'re changed. When Pixel Bot is removed from a server, staff can choose to erase that server\'s settings straight away. Dashboard logins expire after 60 days, or right away with "Log out everywhere".</p>'],
    ['Your choices', '<p>You can log out everywhere from <a class="linky" href="/account">Login and devices</a>. To have your data deleted, ask the bot owner in <b>The Pixel Bassment</b> or by Discord message.</p>'],
    ['Kids', '<p>Pixel Bot is for people old enough to use Discord under Discord\'s own rules (13+ in most countries).</p>'],
    ['Changes', '<p>This policy can be updated; the date at the top shows the latest version.</p>'],
  ]);
}

module.exports = { terms, privacy };
