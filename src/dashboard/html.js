// Tiny HTML helpers for the dashboard. Everything that comes from Discord
// (names, messages) goes through esc() so it can't break the page.
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
:root{--bg:#f6f5fb;--card:#fff;--text:#1d1b26;--muted:#625e73;--line:#e3e0ee;--brand:#7c5cff;--brand-text:#fff;--ok:#16835a;--warn:#a15c00;--bad:#c42b35;--field:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#16151c;--card:#211f2b;--text:#eceaf4;--muted:#a7a2bb;--line:#363247;--brand:#8f74ff;--ok:#3ecf8e;--warn:#f5a623;--bad:#ff6b73;--field:#1a1922}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--brand)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--card)}
header b{font-size:17px}header .who{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px}header img{width:28px;height:28px;border-radius:50%}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 20px;margin:0 0 16px}
.card p.help{color:var(--muted);margin:0 0 14px;font-size:14px}label{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}
select,input[type=text],textarea{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--text);font:inherit}
textarea{min-height:90px;resize:vertical}.checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 12px;max-height:260px;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:8px}
.checks label,.toggle{display:flex;align-items:center;gap:8px;font-weight:400;margin:0;padding:3px 0}
button,.button{display:inline-block;margin-top:14px;padding:9px 16px;border:0;border-radius:8px;background:var(--brand);color:var(--brand-text);font:600 14px system-ui,sans-serif;cursor:pointer;text-decoration:none}
button.small{margin:0;padding:5px 10px;font-size:13px;background:transparent;color:var(--bad);border:1px solid var(--line)}
.flash{padding:10px 14px;border-radius:8px;margin:0 0 16px;border:1px solid var(--line);background:var(--card)}.flash.ok{border-color:var(--ok)}.flash.bad{border-color:var(--bad)}
.problems{border-color:var(--warn)}.problems li{margin:4px 0}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
@media (max-width:640px){.grid2{grid-template-columns:1fr}header{flex-wrap:wrap}}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
nav.jump{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px}nav.jump a{font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--text);background:var(--card)}
.servers a{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--line);border-radius:10px;margin:0 0 10px;background:var(--card);text-decoration:none;color:var(--text)}
.servers img,.servers .noicon{width:40px;height:40px;border-radius:50%;background:var(--line);display:grid;place-items:center;font-weight:700}
.muted{color:var(--muted)}code{font-size:13px}
details.item{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:10px 0;background:var(--bg)}
details.item summary{cursor:pointer;font-weight:600}details.item[open] summary{margin-bottom:6px}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.actions button{margin-top:14px}
button.secondary{background:transparent;color:var(--brand);border:1px solid var(--brand)}
button.danger{background:var(--bad)}.badge{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);margin-left:6px}
.swatch{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;border:1px solid var(--line)}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 14px}@media (max-width:640px){.grid3{grid-template-columns:1fr}}
td .small{display:inline-block}a.small{font-size:13px}
`;

function page({ title, user, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Pixel Bot</title><style>${CSS}</style></head><body>
<header><b>Pixel Bot dashboard</b>${user ? `<span class="who">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : ''}${esc(user.username)} · <a href="/logout">Log out</a></span>` : ''}</header>
<main>${body}</main></body></html>`;
}

const select = (name, options, selected, { blank = '— none —' } = {}) =>
  `<select name="${esc(name)}">${blank !== null ? `<option value="">${esc(blank)}</option>` : ''}${options
    .map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(selected ?? '') ? ' selected' : ''}>${esc(o.name)}</option>`)
    .join('')}</select>`;

const checks = (name, options, selectedIds) => {
  const chosen = new Set((selectedIds ?? []).map(String));
  return `<div class="checks">${options
    .map((o) => `<label><input type="checkbox" name="${esc(name)}" value="${esc(o.id)}"${chosen.has(String(o.id)) ? ' checked' : ''}> ${esc(o.name)}</label>`)
    .join('') || '<span class="muted">Nothing to pick</span>'}</div>`;
};

const input = (name, value, { max = 256, placeholder = '' } = {}) =>
  `<input type="text" name="${esc(name)}" maxlength="${max}" value="${esc(value)}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>`;

const textarea = (name, value, { max = 2000, placeholder = '' } = {}) =>
  `<textarea name="${esc(name)}" maxlength="${max}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>${esc(value)}</textarea>`;

const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

const toggle = (name, on, text) => `<label class="toggle"><input type="checkbox" name="${esc(name)}" value="1"${on ? ' checked' : ''}> ${esc(text)}</label>`;

module.exports = { esc, page, select, checks, toggle, input, textarea, hidden };
