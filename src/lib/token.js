// Finds the bot's token. The first time the bot runs, it asks for the token
// and saves it in the .env file so it never has to ask again.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env');
// Windows sometimes saves ".env" under a slightly different name, so accept those too.
const ENV_FILE_NAMES = ['.env', 'env', '.env.txt', 'env.txt'];
let tokenFileUsed = null;
const PLACEHOLDER = 'paste-your-token-here';

/** Tidies up pasted text: removes spaces, quotes and an accidental "DISCORD_TOKEN=" prefix. */
function cleanToken(input) {
  return String(input ?? '')
    .trim()
    .replace(/^DISCORD_TOKEN\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

/** Bot tokens are three chunks of letters, numbers, - and _ joined by dots. */
function looksLikeToken(token) {
  return /^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(token);
}

function readSavedToken() {
  try {
    // Read lines like DISCORD_TOKEN=abc from the .env file. A token that's
    // already set by the computer or hosting service wins over the file.
    const file = ENV_FILE_NAMES.map((name) => path.join(ROOT, name)).find((candidate) => fs.existsSync(candidate));
    if (!file) throw new Error('no token file');
    tokenFileUsed = file;
    for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // No .env file yet.
  }
  const token = cleanToken(process.env.DISCORD_TOKEN);
  return token && token !== PLACEHOLDER ? token : null;
}

/** Asks in the terminal until a valid-looking token is pasted. Returns null if the user quits. */
async function askForToken() {
  console.log('\nWelcome to Pixel Bot! It needs its token before it can start.');
  console.log('Get it from the Discord Developer Portal → your application → Bot → Reset Token → Copy.');
  console.log('(The README walks through this step by step.)\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('Paste the token here and press Enter: ');
  rl.prompt();

  for await (const line of rl) {
    const token = cleanToken(line);
    if (looksLikeToken(token)) {
      rl.close();
      return token;
    }
    if (token) {
      console.log("\nThat doesn't look like a bot token. It should be one long line with two dots in it. Try again, or press Ctrl+C to quit.\n");
    }
    rl.prompt();
  }
  return null; // the prompt was closed with Ctrl+C
}

/** Returns the token, asking for it and saving it if this is the first run. */
async function getToken() {
  const saved = readSavedToken();
  if (saved) return saved;

  // No way to ask (for example, when running on a server): explain and stop.
  if (!process.stdin.isTTY) {
    console.error(
      [
        '',
        'Pixel Bot needs its token before it can start.',
        '  1. Copy the file ".env.example" and name the copy ".env"',
        '  2. Open ".env" and paste your bot token after DISCORD_TOKEN=',
        '  3. Run "npm start" again',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  tokenFileUsed = null;
  const token = await askForToken();
  if (!token) {
    console.log('\nStopped. Run "npm start" again when you have the token.');
    process.exit(0);
  }
  fs.writeFileSync(ENV_FILE, `# Pixel Bot's secret token. Never share this file.\nDISCORD_TOKEN=${token}\n`);
  tokenFileUsed = ENV_FILE;
  console.log('\nSaved to the .env file. You won\'t be asked again.\n');
  return token;
}

/** The file the saved token was read from, if any. */
function savedTokenFile() {
  return tokenFileUsed;
}

module.exports = { getToken, cleanToken, looksLikeToken, savedTokenFile, ENV_FILE };
