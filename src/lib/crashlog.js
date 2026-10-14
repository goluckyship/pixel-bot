// Remembers why Pixel Bot last stopped or hit a serious error, so it can be seen on the
// dashboard's status page even after the hosting console has been cleared by a restart.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.PIXEL_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'crashes.json');
const KEEP = 10;

function read() {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Saves one entry. Uses sync writes because it can run while the process is exiting. */
function note(kind, error) {
  try {
    const text = error instanceof Error ? `${error.stack || error.message}` : String(error);
    const list = read();
    list.unshift({ when: Date.now(), kind, text: text.slice(0, 2000) });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list.slice(0, KEEP), null, 2));
  } catch {
    // Never let the crash log itself cause trouble.
  }
}

let started = false;
/** Hooks process events. Serious errors are logged and the bot keeps running. */
function install() {
  if (started) return;
  started = true;
  const bootedAt = Date.now();
  note('start', 'Pixel Bot started');
  process.on('uncaughtException', (error) => {
    console.error('Unexpected error (Pixel Bot kept running):', error);
    note('error', error);
  });
  process.on('unhandledRejection', (error) => {
    console.error('Unexpected error:', error);
    note('rejection', error);
  });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => {
      note('stopped', `Stopped by ${signal} (the hosting panel or a restart) after ${Math.round((Date.now() - bootedAt) / 1000)}s`);
      process.exit(0);
    });
  }
  process.on('exit', (code) => {
    if (code !== 0) note('exit', `Exited with code ${code} after ${Math.round((Date.now() - bootedAt) / 1000)}s`);
  });
}

module.exports = { install, read, note, FILE };
