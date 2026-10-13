// Commands typed into the hosting console (Wispbyte's "Type a command..." box).
// Only people who can get into the hosting panel can type here.
//
//   backup-link   DMs the bot owner a one-time dashboard login link
//   help          lists these
const readline = require('node:readline');
const links = require('./loginlinks');
const owner = require('./owner');

const COMMANDS = {
  help: 'lists these commands',
  'backup-link': 'DMs the bot owner a one-time dashboard login link (the link itself is never printed here)',
};

async function run(client, line) {
  const command = line.trim().toLowerCase();
  if (!command) return;
  if (command === 'help') {
    for (const [name, what] of Object.entries(COMMANDS)) console.log(`  ${name} - ${what}`);
    return;
  }
  if (command === 'backup-link') {
    const id = owner.ownerId(client);
    if (!id || !client.isReady?.()) return console.log('Pixel Bot is still starting up. Try again in a few seconds.');
    const { settingsFromEnv } = require('../dashboard/server');
    const config = settingsFromEnv();
    if (!config || config.error) return console.log('The dashboard is switched off, so there is nothing to log in to.');
    const user = await client.users.fetch(id);
    const token = links.create({ id: user.id, username: user.globalName || user.username, avatar: null });
    const link = `${config.aliases?.[0] ?? config.base}/r/${token}`;
    try {
      await user.send(`🔑 **Your one-time Pixel Bot dashboard login link**\n${link}\n\nIt works once and logs you in as you. Keep it private. If it leaks, cancel it on the dashboard under 🔑 → "Cancel all my backup links".`);
      owner.audit({ userId: user.id, username: user.username, guildId: null, what: 'Backup login link sent from the hosting console', ok: true, text: '' });
      console.log(`Sent a one-time backup login link to ${user.username} in Discord DMs.`);
    } catch (error) {
      links.revokeAll(user.id);
      console.log(`Couldn't DM ${user.username} (${error.message}). Allow DMs from server members, then try again.`);
    }
    return;
  }
  console.log(`Unknown command "${command}". Type "help" to see what works here.`);
}

function listen(client) {
  if (!process.stdin) return;
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => run(client, line).catch((error) => console.log(`That didn't work: ${error.message}`)));
  rl.on('error', () => {});
  process.stdin.unref?.(); // never keeps Pixel Bot running on its own
}

module.exports = { run, listen, COMMANDS };
