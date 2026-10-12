// Pixel Bot - this is the file that starts everything.
// Run it with:  npm start
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { loadCommands, loadEvents, collectComponents } = require('./lib/loader');
const fs = require('node:fs');
const { getToken, savedTokenFile } = require('./lib/token');

const client = new Client({
  // Intents tell Discord which kinds of events Pixel Bot wants to hear about.
  intents: [
    GatewayIntentBits.Guilds, // servers, channels and slash commands
    GatewayIntentBits.GuildMembers, // people joining (welcome messages)
    GatewayIntentBits.GuildMessages, // messages being sent (word filter)
    GatewayIntentBits.MessageContent, // what those messages say (word filter, automod, staff log)
    GatewayIntentBits.GuildModeration, // bans (staff log)
    GatewayIntentBits.GuildExpressions ?? GatewayIntentBits.GuildEmojisAndStickers, // emoji changes (staff log)
    GatewayIntentBits.GuildVoiceStates, // voice channel moves (staff log)
  ],
  // Safety net: Pixel Bot never pings @everyone, @here or roles by accident.
  allowedMentions: { parse: [], repliedUser: true },
});

client.commands = loadCommands();
client.components = collectComponents(client.commands);
loadEvents(client);

// Keep running if something unexpected goes wrong, but say what it was.
client.on('error', (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unexpected error:', error));

const BAD_TOKEN_HELP =
  'Discord did not accept the token. Go to the Developer Portal → Bot → Reset Token, copy the new token, and start the bot again to paste it in.';
const INTENTS_HELP =
  'Two switches need to be turned on. In the Developer Portal → Bot → Privileged Gateway Intents, enable "Server Members Intent" and "Message Content Intent", save, then start the bot again.';

function stopWith(help, details) {
  console.error('\nPixel Bot could not connect to Discord.');
  console.error(help);
  if (details) console.error(details);
  process.exit(1);
}

// A rejected token is cleared so the next start asks for a new one.
// Exit code 3 tells START-PIXEL-BOT.bat to ask again straight away.
function rejectToken() {
  let cleared = false;
  try {
    const file = savedTokenFile();
    if (file) {
      fs.unlinkSync(file);
      cleared = true;
    }
  } catch {
    // No saved token file (for example, the token came from a hosting service).
  }
  console.error('\nDiscord did not accept that token.');
  if (cleared) {
    console.error('The bad token has been cleared. In the Developer Portal → Bot, click Reset Token, then Copy, and paste the new token below.\n');
    process.exit(3);
  }
  stopWith(BAD_TOKEN_HELP);
}

// Discord closes the connection with these codes when the setup isn't right:
// 4004 = bad token, 4014 = a privileged intent isn't switched on.
client.on(Events.ShardDisconnect, (event) => {
  if (event.code === 4014) stopWith(INTENTS_HELP);
  if (event.code === 4004) rejectToken();
});

getToken()
  .then((token) => client.login(token))
  .catch((error) => {
    const message = String(error?.message ?? '');
    if (error?.code === 'TokenInvalid' || /invalid token/i.test(message)) rejectToken();
    if (error?.code === 'DisallowedIntents' || /disallowed intents/i.test(message)) stopWith(INTENTS_HELP);
    stopWith('Check your internet connection and try again. Details:', error);
  });
