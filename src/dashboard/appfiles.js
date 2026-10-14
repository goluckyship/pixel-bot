// Files that make the website an installable app (a "PWA"): manifest, service worker, icons, offline page.
const fs = require('node:fs');
const path = require('node:path');
const { page, pixelBot } = require('./html');

const DIR = path.join(__dirname, 'public');
const TYPES = { '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8' };
const ICONS = new Set(['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png']);

function manifest() {
  return {
    name: 'Pixel Bot',
    short_name: 'Pixel Bot',
    description: 'Your Pixel Bot dashboard and the Pixel Arcade.',
    id: '/',
    start_url: '/start',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    background_color: '#1b1530',
    theme_color: '#8b6cf6',
    categories: ['games', 'utilities', 'social'],
    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Pixel Arcade', short_name: 'Arcade', url: '/play', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
      { name: 'Bot status', short_name: 'Status', url: '/status', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
      { name: 'Help', url: '/help', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

function file(res, name, extraHeaders = {}) {
  let body;
  try {
    body = fs.readFileSync(path.join(DIR, name));
  } catch {
    return false;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...extraHeaders });
  res.end(body);
  return true;
}

/** Serves an app file if this request is for one. Returns true when it answered. */
function serve(req, res, url) {
  const p = url.pathname;
  if (p === '/manifest.webmanifest') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify(manifest()));
    return true;
  }
  if (p === '/sw.js') return file(res, 'sw.js', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
  if (p === '/app.js') return file(res, 'app.js', { 'Cache-Control': 'public, max-age=3600' });
  if (p === '/offline.html') return file(res, 'offline.html', { 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
  if (p === '/favicon.ico') return file(res, 'favicon-32.png', { 'Cache-Control': 'public, max-age=86400' });
  if (p === '/apple-touch-icon.png') return file(res, 'apple-touch-icon.png', { 'Cache-Control': 'public, max-age=86400' });
  const icon = /^\/app\/([a-z0-9-]+\.png)$/.exec(p)?.[1];
  if (icon && ICONS.has(icon)) return file(res, icon, { 'Cache-Control': 'public, max-age=86400' });
  return false;
}

/** How to install the app on each kind of device. */
function installPage() {
  const step = (title, body) => `<div class="card"><h2 class="minor">${title}</h2>${body}</div>`;
  return page({
    title: 'Get the app',
    body: `<div class="hero" style="padding-bottom:6px">${pixelBot(96, 'beat')}<h1>Get the Pixel Bot app</h1>
<p class="sub">Its own window, icon, taskbar button and Start menu entry. No download, and it always has the newest version.</p>
<div class="herobtns"><a class="button" href="/install" data-install hidden>⬇️ Install Pixel Bot</a></div></div>
${step('💻 Windows, Mac or Chromebook (Chrome or Edge)', '<ol><li>Open <b>pixelbotstudio.net</b> in Chrome or Edge.</li><li>Click the <b>Install</b> icon at the right end of the address bar (a little screen with an arrow), or the button above.</li><li>Click <b>Install</b>. Pixel Bot opens in its own window and appears in your Start menu / Launchpad.</li></ol>')}
${step('🤖 Android', '<ol><li>Open <b>pixelbotstudio.net</b> in Chrome.</li><li>Tap <b>⋮</b> → <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>')}
${step('🍎 iPhone or iPad', '<ol><li>Open <b>pixelbotstudio.net</b> in Safari.</li><li>Tap the <b>Share</b> button → <b>Add to Home Screen</b> → <b>Add</b>.</li></ol>')}
<p class="help">To remove it later: right-click the app icon → Uninstall (computer), or press and hold the icon (phone).</p>`,
  });
}

module.exports = { serve, installPage, manifest };
