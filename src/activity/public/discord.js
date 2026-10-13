// A tiny stand-in for Discord's Embedded App SDK: just what the arcade needs.
// Discord runs the activity in an iframe and talks to it with postMessage:
//   [0, handshake]  ->  Discord replies with a READY event
//   [1, { cmd, args, nonce }]  ->  Discord replies with the same nonce
(function () {
  const HANDSHAKE = 0;
  const FRAME = 1;
  const CLOSE = 2;

  function DiscordLink(clientId) {
    const q = new URLSearchParams(location.search);
    this.clientId = clientId;
    this.frameId = q.get('frame_id');
    this.instanceId = q.get('instance_id');
    this.channelId = q.get('channel_id');
    this.guildId = q.get('guild_id');
    this.platform = q.get('platform') || 'desktop';
    this.inDiscord = Boolean(this.frameId && window.parent !== window);
    this.pending = new Map();
    this.listeners = {};
    this.source = window.parent.opener || window.parent;
    this.target = document.referrer ? new URL(document.referrer).origin : '*';
    let ready;
    this.ready = new Promise((resolve) => { ready = resolve; });
    this._ready = ready;
    window.addEventListener('message', (e) => this.onMessage(e));
    if (this.inDiscord) this.send(HANDSHAKE, { v: 1, encoding: 'json', client_id: clientId, frame_id: this.frameId, sdk_version: '2.4.0', mobile_app_version: null });
  }

  DiscordLink.prototype.send = function (op, payload) {
    try { this.source.postMessage([op, payload], this.target); } catch (e) { this.source.postMessage([op, payload], '*'); }
  };

  DiscordLink.prototype.onMessage = function (event) {
    const data = event.data;
    if (!Array.isArray(data) || data.length < 2) return;
    const [op, msg] = data;
    if (op === CLOSE) { (this.listeners.close || []).forEach((fn) => fn(msg)); return; }
    if (op !== FRAME || !msg) return;
    if (msg.cmd === 'DISPATCH') {
      if (msg.evt === 'READY') this._ready(msg.data);
      (this.listeners[msg.evt] || []).forEach((fn) => fn(msg.data));
      return;
    }
    const wait = msg.nonce && this.pending.get(msg.nonce);
    if (!wait) return;
    this.pending.delete(msg.nonce);
    if (msg.evt === 'ERROR') wait.reject(new Error((msg.data && msg.data.message) || 'Discord error'));
    else wait.resolve(msg.data);
  };

  DiscordLink.prototype.command = function (cmd, args, timeout) {
    const nonce = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
    return new Promise((resolve, reject) => {
      this.pending.set(nonce, { resolve, reject });
      this.send(FRAME, { cmd, args: args || {}, nonce });
      setTimeout(() => { if (this.pending.delete(nonce)) reject(new Error('Discord did not answer.')); }, timeout || 60000);
    });
  };

  DiscordLink.prototype.on = function (evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); };

  /** Asks Discord who the player is. Returns a login code for the server. */
  DiscordLink.prototype.authorize = function () {
    return this.command('AUTHORIZE', { client_id: this.clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
  };

  DiscordLink.prototype.authenticate = function (accessToken) {
    return this.command('AUTHENTICATE', { access_token: accessToken }, 15000);
  };

  window.DiscordLink = DiscordLink;
})();
