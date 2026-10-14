// Tiny HTML helpers for the dashboard. Everything that comes from Discord
// (names, messages) goes through esc() so it can't break the page.
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
:root{--bg:#f5effc;--card:#fffbfe;--text:#3d2b52;--muted:#85739a;--line:#eadcf3;--brand:#8b6cf6;--brand-text:#fff;--pink:#ff8fbf;--ok:#2f9e78;--warn:#c27a12;--bad:#e0507a;--field:#fff;--r:20px;
--head:"Fredoka","Nunito",ui-rounded,system-ui,sans-serif;--body:"Nunito",ui-rounded,system-ui,-apple-system,"Segoe UI",sans-serif;
--soft:color-mix(in srgb,var(--brand) 12%,var(--card));--glow:color-mix(in srgb,var(--brand) 22%,transparent);--dots:color-mix(in srgb,var(--brand) 16%,transparent);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#211a2c;--card:#2d2440;--text:#f3e9ff;--muted:#b8a6cc;--line:#43375a;--brand:#b39dff;--brand-text:#221a2e;--pink:#ff9ec8;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff7aa2;--field:#261f36;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background-color:var(--bg);background-image:radial-gradient(var(--dots) 1.6px,transparent 1.7px);background-size:22px 22px;color:var(--text);font:16px/1.6 var(--body)}
a{color:var(--brand);text-underline-offset:3px;text-decoration-thickness:2px}
h1,h2,header b{font-family:var(--head);font-weight:600;letter-spacing:.005em}
h1{font-size:30px;line-height:1.2;margin:0 0 6px}h2{font-size:20px;line-height:1.3;margin:0 0 4px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;background:color-mix(in srgb,var(--card) 88%,transparent);border-bottom:2px dashed var(--line);position:sticky;top:0;z-index:5;backdrop-filter:blur(8px)}
header .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text)}header b{font-size:19px}
header .who{display:flex;align-items:center;gap:10px;color:var(--text);font-size:14px;font-weight:600}header .who img,.noav{width:30px;height:30px;border-radius:50%;border:2px solid var(--pink);object-fit:cover}.noav{display:inline-grid;place-items:center;background:var(--brand);color:var(--brand-text);font-weight:700;font-size:14px}
.menu{position:relative}.menu>summary{list-style:none;display:flex;align-items:center;gap:12px;cursor:pointer;padding:5px 6px 5px 6px;border-radius:999px;border:2px solid var(--line);background:var(--card);transition:border-color .15s,box-shadow .15s}.menu>summary::-webkit-details-marker{display:none}
.menu>summary:hover,.menu[open]>summary{border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 18%,transparent)}.menu>summary:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.burger{width:34px;height:34px;border-radius:50%;display:grid;place-content:center;gap:4px;background:color-mix(in srgb,var(--brand) 14%,transparent)}.burger i{display:block;width:16px;height:2px;border-radius:2px;background:var(--text);transition:transform .2s,opacity .2s}
.menu[open] .burger i:nth-child(1){transform:translateY(6px) rotate(45deg)}.menu[open] .burger i:nth-child(2){opacity:0}.menu[open] .burger i:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
.menu[open]>summary::before{content:"";position:fixed;inset:0;cursor:default;z-index:-1}
.mpanel{position:absolute;right:0;top:calc(100% + 10px);width:300px;max-width:calc(100vw - 32px);background:var(--card);border:2px solid var(--line);border-radius:18px;box-shadow:0 18px 40px -12px rgba(0,0,0,.35);padding:8px;z-index:20;animation:mpop .14s ease-out}
@keyframes mpop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
.mhead{display:flex;align-items:center;gap:12px;padding:10px 10px 12px;margin-bottom:6px;border-bottom:2px dashed var(--line)}.mhead img,.mhead .noav{width:40px;height:40px}.mhead b{display:block;font-size:15px}.mhead small{display:block;margin-top:3px;color:var(--muted);font-size:12.5px}
.mi{display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;text-decoration:none;color:var(--text)}.mi:hover,.mi:focus-visible{background:color-mix(in srgb,var(--brand) 12%,transparent);outline:none}
.mi b{display:block;font-size:14.5px}.mi small{display:block;color:var(--muted);font-size:12.5px;margin-top:1px;line-height:1.35}
.mic{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--brand) 13%,transparent);color:var(--brand)}
.mi.danger .mic{background:color-mix(in srgb,var(--bad) 13%,transparent);color:var(--bad)}.mi.danger b{color:var(--bad)}.msep{height:2px;margin:6px 4px;background:var(--line);border-radius:2px}
@media (max-width:640px){header .whoname{display:none}}
.heart{display:block;image-rendering:pixelated;shape-rendering:crispEdges}.heart .fill{fill:var(--pink)}.heart .edge{fill:var(--brand)}.heart .shine{fill:#fff}
main{max-width:880px;margin:0 auto;padding:28px 16px 80px}
.sub{color:var(--muted);margin:0 0 22px}
.card{background:var(--card);border:2px solid var(--line);border-radius:var(--r);padding:22px 22px 24px;margin:0 0 18px;box-shadow:0 6px 0 -2px var(--line)}
.card>h2:first-child{display:flex;align-items:center;gap:10px}
.card p.help{color:var(--muted);margin:0 0 14px;font-size:15px}
label{display:block;font-weight:700;font-size:14px;margin:14px 0 6px}
select,input[type=text],input[type=number],textarea{width:100%;padding:11px 14px;border:2px solid var(--line);border-radius:calc(var(--r) * .6);background:var(--field);color:var(--text);font:inherit;font-size:15px;transition:border-color .15s,box-shadow .15s}
select:hover,input[type=text]:hover,input[type=number]:hover,textarea:hover{border-color:color-mix(in srgb,var(--brand) 40%,var(--line))}
select:focus,input[type=text]:focus,input[type=number]:focus,textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--glow)}
select{appearance:none;padding-right:40px;background-image:linear-gradient(45deg,transparent 50%,var(--brand) 50%),linear-gradient(135deg,var(--brand) 50%,transparent 50%);background-position:calc(100% - 20px) 52%,calc(100% - 14px) 52%;background-size:6px 6px;background-repeat:no-repeat;cursor:pointer}
textarea{min-height:100px;resize:vertical}
:focus-visible{outline:3px solid var(--brand);outline-offset:2px}

/* role pickers: squishy chips that fill pink with a tick */
.checks{display:flex;flex-wrap:wrap;gap:8px;max-height:300px;overflow:auto;padding:12px;border:2px dashed var(--line);border-radius:calc(var(--r) * .7);background:color-mix(in srgb,var(--bg) 50%,var(--card))}
.chip{position:relative;display:inline-flex;margin:0;font-weight:600;font-size:14px}
.chip input{position:absolute;opacity:0;width:1px;height:1px}
.chip span{display:inline-flex;align-items:center;gap:7px;padding:6px 14px 6px 10px;border:2px solid var(--line);border-radius:999px;background:var(--card);cursor:pointer;user-select:none;transition:transform .12s,background .15s,border-color .15s}
.chip span::before{content:"";width:16px;height:16px;flex:none;border-radius:6px;border:2px solid color-mix(in srgb,var(--muted) 60%,transparent);background:var(--field);transition:inherit}
.chip span:hover{border-color:var(--pink);transform:translateY(-1px)}
.chip input:checked+span{background:color-mix(in srgb,var(--pink) 22%,var(--card));border-color:var(--pink)}
.chip input:checked+span::before{border-color:var(--pink);background:var(--pink) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/12px no-repeat}
.chip input:focus-visible+span{outline:3px solid var(--brand);outline-offset:2px}
.chip input:active+span{transform:scale(.96)}

/* on/off settings: a little switch with a sliding knob */
.toggle{display:flex;align-items:center;gap:12px;font-weight:600;margin:12px 0;padding:0;cursor:pointer;width:fit-content;max-width:100%}
.toggle input{appearance:none;-webkit-appearance:none;flex:none;position:relative;width:46px;height:28px;margin:0;border-radius:999px;background:color-mix(in srgb,var(--muted) 30%,var(--line));border:2px solid transparent;cursor:pointer;transition:background .2s}
.toggle input::before{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgb(61 43 82/.25);transition:transform .2s cubic-bezier(.3,1.5,.6,1)}
.toggle input:checked{background:var(--pink)}
.toggle input:checked::before{transform:translateX(18px)}
.toggle input:focus-visible{outline:3px solid var(--brand);outline-offset:2px}

button,.button{display:inline-flex;align-items:center;gap:8px;margin-top:16px;padding:11px 22px;border:0;border-radius:999px;background:var(--brand);color:var(--brand-text);font:600 15px var(--head);cursor:pointer;text-decoration:none;box-shadow:0 4px 0 color-mix(in srgb,var(--brand) 60%,#000);transition:transform .1s,box-shadow .1s}
table.src{width:100%;border-collapse:collapse;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}table.src td{padding:0 10px;vertical-align:top;white-space:pre-wrap;word-break:break-word}table.src td.n{width:1%;text-align:right;color:var(--muted);user-select:none;white-space:nowrap;border-right:2px solid var(--line)}table.src tr:target{background:color-mix(in srgb,var(--brand) 22%,transparent)}table.src .c{color:var(--sy-c);font-style:italic}table.src .kw,table.src .o,table.src .p{color:var(--sy-kw)}table.src .s{color:var(--sy-s)}table.src .n{color:var(--sy-n)}table.src .f{color:var(--sy-f)}table.src .t{color:var(--sy-t)}table.src .r{color:var(--sy-r)}table.src .k{color:var(--sy-k)}table.src .h{color:var(--sy-n);font-weight:700}table.src .b{font-weight:700}table.src td.line{color:var(--sy-text)}table.src td,table.src tr{border:0!important}table.src td.n a{color:inherit;text-decoration:none}.srcbox{background:var(--sy-code)!important}.srcbox{overflow-x:auto;border:2px solid var(--line);border-radius:calc(var(--r) * .7);background:var(--card);padding:10px 0}.files a{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:10px;text-decoration:none;color:inherit;font:14px ui-monospace,Menlo,Consolas,monospace}.files a:hover{background:color-mix(in srgb,var(--brand) 12%,transparent)}.files .dir{margin:14px 0 4px;font-weight:700}.crumbs{font:600 15px ui-monospace,Menlo,Consolas,monospace;word-break:break-all}
.wbtns{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-left:auto}.wbtns .button,.wbtns button{margin-top:0}
.cmdlist a{font-family:inherit;padding:10px 12px;border-bottom:1px solid var(--line);border-radius:0}.cmdlist a b{font-family:ui-monospace,Menlo,Consolas,monospace}
.runform h2{margin:0 0 4px;font-family:ui-monospace,Menlo,Consolas,monospace}.optrow{margin:12px 0}.optrow label{display:block;font-weight:700;margin-bottom:5px}.optrow select,.optrow input,.optrow textarea{width:100%}.req{color:var(--bad)}
.runwhere{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end;margin:18px 0 4px;padding-top:14px;border-top:2px dashed var(--line)}.runwhere>div{flex:1 1 220px}.runwhere label{font-weight:700}.tick{display:flex;gap:8px;align-items:center;font-weight:600!important}
.chat{padding:14px 18px}.msg{display:flex;gap:12px;padding:10px 0}.msg+.msg{border-top:1px solid var(--line)}.msg .bot{flex:none;border-radius:12px;background:color-mix(in srgb,var(--brand) 10%,transparent);padding:3px}.mb{min-width:0;flex:1}.mh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.botchip{font-size:10px;font-weight:800;padding:1px 5px;border-radius:4px;background:#5865f2;color:#fff}.mtag{font-size:11.5px;padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--brand) 14%,transparent);color:var(--muted);font-weight:600}
.mc{margin-top:4px;line-height:1.5;overflow-wrap:anywhere}.mc pre,.embed pre{white-space:pre-wrap;background:var(--sy-code);padding:8px;border-radius:8px}.mc code,.embed code{background:color-mix(in srgb,var(--text) 10%,transparent);padding:1px 5px;border-radius:5px}.mention{background:color-mix(in srgb,#5865f2 22%,transparent);color:color-mix(in srgb,#5865f2 70%,var(--text));padding:0 3px;border-radius:4px;font-weight:600}.big{font-size:1.25em}
.embed{margin-top:8px;padding:10px 14px;border-left:4px solid;border-radius:6px;background:color-mix(in srgb,var(--text) 5%,var(--card));max-width:560px;display:grid;gap:6px;overflow-wrap:anywhere}.embed .et{font-size:15.5px}.efs{display:flex;flex-wrap:wrap;gap:10px}.ef{flex:1 1 100%}.ef.inline{flex:1 1 30%}.ef b{display:block;font-size:13.5px}
.mbtns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.mbtn{padding:6px 14px;border-radius:8px;background:color-mix(in srgb,var(--text) 10%,transparent);font-weight:600;font-size:13.5px;opacity:.75;cursor:not-allowed}
.herobtns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.herobtns .button{margin-top:6px}.loginalt{margin-top:16px;color:var(--muted)}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:10px 0 18px}.features .card{padding:16px}.features p{margin:6px 0 0;color:var(--muted);font-size:14px}
.pcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px}.pcard{display:grid;gap:8px;padding:10px;border:2px solid var(--line);border-radius:14px;cursor:pointer;font-weight:700;font-size:13.5px}.pcard input{position:absolute;opacity:0;pointer-events:none}.pcard:has(input:checked){border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 25%,transparent)}.pv{display:flex;height:34px;border-radius:9px;overflow:hidden;border:1px solid var(--line)}.pv i{flex:1}
.row2{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.guestform{max-width:360px;margin:0 auto;text-align:left;display:grid;gap:6px}.guestform input{width:100%}.guestform button{margin-top:12px;justify-content:center}
@media (pointer:coarse){button,.button,select,input{min-height:44px}.mi{padding:12px 10px}}
a.linky{display:inline-block;margin-top:14px;color:var(--brand);font-weight:700}.code{font:600 clamp(40px,12vw,64px) var(--head);letter-spacing:.12em;margin:18px 0 6px;padding:14px 26px;border-radius:22px;background:color-mix(in srgb,var(--brand) 12%,transparent);display:inline-block}.steps{text-align:left;display:inline-block;margin:10px auto 0;line-height:1.8}
button:hover,.button:hover{transform:translateY(-1px);box-shadow:0 5px 0 color-mix(in srgb,var(--brand) 60%,#000)}
button:active,.button:active{transform:translateY(3px);box-shadow:0 1px 0 color-mix(in srgb,var(--brand) 60%,#000)}
button.secondary{background:var(--card);color:var(--brand);box-shadow:0 4px 0 var(--line);border:2px solid var(--brand)}
button.danger{background:var(--bad);color:#fff;box-shadow:0 4px 0 color-mix(in srgb,var(--bad) 60%,#000)}
button.small{margin:0;padding:5px 12px;font-size:13px;background:transparent;color:var(--bad);border:2px solid var(--line);box-shadow:none}
button.small:hover{border-color:var(--bad);transform:none}

.flash{display:flex;gap:10px;align-items:flex-start;padding:12px 16px;border-radius:calc(var(--r) * .7);margin:0 0 18px;border:2px solid var(--line);background:var(--card);font-weight:600}
.flash.ok{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,var(--card))}.flash.ok::before{content:"🌸"}
.flash.bad{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 10%,var(--card))}.flash.bad::before{content:"🙈"}
.problems{border-color:var(--warn);border-style:dashed}.problems li{margin:4px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px}
@media (max-width:640px){.grid2,.grid3{grid-template-columns:1fr}h1{font-size:26px}.card{padding:18px 16px 20px}}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}td,th{text-align:left;padding:10px 8px;border-bottom:2px dotted var(--line);vertical-align:top}th{color:var(--muted);font-weight:700}
.tablewrap{overflow-x:auto}
nav.jump{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
nav.jump a{font-size:14px;font-weight:700;padding:6px 14px;border:2px solid var(--line);border-radius:999px;text-decoration:none;color:var(--text);background:var(--card);transition:border-color .15s,background .15s}
nav.jump a:hover{border-color:var(--pink);background:color-mix(in srgb,var(--pink) 14%,var(--card))}
.servers a{display:flex;align-items:center;gap:14px;padding:14px 16px;border:2px solid var(--line);border-radius:var(--r);margin:0 0 12px;background:var(--card);text-decoration:none;color:var(--text);box-shadow:0 5px 0 -1px var(--line);transition:transform .12s,border-color .15s}
.bigdl{font-size:19px;padding:16px 28px}
.hdr{display:flex;align-items:center;gap:10px}.installbtn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:var(--brand);color:var(--brand-text,#fff);font-weight:700;font-size:14px;text-decoration:none}.installbtn[hidden],[data-install][hidden]{display:none!important}html.installed .installbtn{display:none!important}
.servers a:hover{border-color:var(--pink);transform:translateY(-2px)}
.srow{position:relative}.srow>a.go{padding-right:120px}.srow .rm{position:absolute;right:14px;top:50%;transform:translateY(-58%);display:inline-flex;align-items:center;gap:6px;padding:8px 12px;margin:0;border:2px solid color-mix(in srgb,var(--bad) 45%,var(--line));border-radius:999px;box-shadow:none;background:var(--card);color:var(--bad);font-weight:700;font-size:14px}.srow .rm:hover{background:color-mix(in srgb,var(--bad) 12%,var(--card));transform:translateY(-58%)}
.confirmbox{text-align:center}.confirmbox .row2{justify-content:center}
.servers a.addserver{border-style:dashed;box-shadow:none;background:transparent}.servers a.addserver .noicon{background:color-mix(in srgb,var(--brand) 14%,transparent);color:var(--brand);font-size:22px}
.servers img,.servers .noicon{width:48px;height:48px;border-radius:16px;background:var(--soft);display:grid;place-items:center;font:600 20px var(--head);color:var(--brand)}
.muted{color:var(--muted)}code{font-size:14px;background:var(--soft);padding:1px 6px;border-radius:6px}
details.item{border:2px solid var(--line);border-radius:calc(var(--r) * .8);padding:12px 16px;margin:12px 0;background:color-mix(in srgb,var(--bg) 45%,var(--card))}
details.item>summary{cursor:pointer;font:600 16px var(--head);list-style:none;display:flex;align-items:center;gap:8px}
details.item>summary::-webkit-details-marker{display:none}
details.item>summary::before{content:"▸";color:var(--pink);transition:transform .15s}details.item[open]>summary::before{transform:rotate(90deg)}
details.item[open]>summary{margin-bottom:8px}
.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.badge{display:inline-block;font:600 13px var(--body);padding:2px 10px;border-radius:999px;background:var(--soft);color:var(--brand);margin-left:8px;vertical-align:middle}
.swatch{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;border:1px solid var(--line)}
td .small{display:inline-block}a.small{font-size:14px;font-weight:700}
.colorpick{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.colorpick input[type=color]{appearance:none;-webkit-appearance:none;width:52px;height:40px;padding:3px;border:2px solid var(--line);border-radius:14px;background:var(--field);cursor:pointer}
.colorpick input[type=color]::-webkit-color-swatch-wrapper{padding:0}.colorpick input[type=color]::-webkit-color-swatch{border:0;border-radius:9px}.colorpick input[type=color]::-moz-color-swatch{border:0;border-radius:9px}
.colorpick .toggle{margin:0}
.qrow{border:2px dashed var(--line);border-radius:calc(var(--r) * .7);padding:6px 16px 12px;margin:14px 0;background:var(--card)}.qrow .head{font:600 15px var(--head);color:var(--brand);margin-top:8px}
.note{font-size:14px;color:var(--warn);font-weight:600}
.hero{text-align:center;padding:48px 8px 24px}.bot{display:block;image-rendering:pixelated;flex:none}.hero .bot{margin:0 auto 18px;filter:drop-shadow(0 8px 0 var(--line))}@media (prefers-reduced-motion:no-preference){.hero .bot.beat{animation:beat .9s cubic-bezier(.3,1.6,.6,1) .25s 1 both,bob 3.2s ease-in-out 1.2s infinite}}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.hero .heart{margin:0 auto 18px;width:120px;height:auto;filter:drop-shadow(0 8px 0 var(--line))}
.hero h1{font-size:40px}.hero .sub{max-width:34em;margin:0 auto 24px;font-size:17px}
.empty{text-align:center;color:var(--muted);padding:12px 0;font-weight:600}
@media (prefers-reduced-motion:no-preference){.beat{animation:beat .9s cubic-bezier(.3,1.6,.6,1) .25s 1 both}}
@keyframes beat{0%{transform:scale(.6);opacity:0}55%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
/* fold-up sections: one tidy row each, open the one you need */
details.fold{padding:0;overflow:hidden}
details.fold>summary{list-style:none;display:flex;align-items:center;gap:14px;padding:16px 20px;cursor:pointer;border-radius:var(--r);transition:background .15s}
details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary:hover{background:var(--soft)}
details.fold>summary::after{content:"";flex:none;width:10px;height:10px;margin-left:auto;border-right:3px solid var(--pink);border-bottom:3px solid var(--pink);border-radius:2px;transform:rotate(-45deg);transition:transform .2s}
details.fold[open]>summary::after{transform:rotate(45deg)}
details.fold[open]>summary{border-bottom:2px dashed var(--line);border-radius:var(--r) var(--r) 0 0}
.emoji{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--soft);font-size:22px}
summary .t,.row .t{display:flex;flex-direction:column;min-width:0}
summary .t b{font:600 18px var(--head)}
summary .t small,.row .t small{color:var(--muted);font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.foldbody{padding:18px 22px 24px}
.pill{display:inline-block;padding:1px 10px;border-radius:999px;background:color-mix(in srgb,var(--muted) 16%,var(--card));color:var(--muted);font-size:13px}
.pill.on{background:color-mix(in srgb,var(--ok) 16%,var(--card));color:var(--ok)}
.pill.on::before{content:"● ";font-size:10px;vertical-align:1px}
h2.group{font-size:15px;color:var(--muted);margin:30px 6px 12px;font-family:var(--body);font-weight:700}
h2.minor{font-size:18px;margin:22px 0 4px}
.rows{display:flex;flex-direction:column;gap:8px;margin:0 0 6px}
.row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:2px solid var(--line);border-radius:calc(var(--r) * .7);background:var(--card);text-decoration:none;color:var(--text)}
.row .emoji{width:36px;height:36px;font-size:18px;border-radius:11px}
.row .go{margin-left:auto;font-weight:700;font-size:14px;color:var(--brand);text-decoration:none;white-space:nowrap}
.row form{margin:0}
a.row:hover{border-color:var(--pink)}
details.more{margin:14px 0 4px;border-radius:calc(var(--r) * .6)}
details.more>summary{display:inline-flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-weight:700;font-size:14px;color:var(--brand);padding:6px 12px;border-radius:999px;background:var(--soft)}
details.more>summary::-webkit-details-marker{display:none}
details.more>summary::before{content:"+";font:600 16px var(--head);line-height:1}
details.more[open]>summary::before{content:"−"}
details.more>div{padding:6px 0 0 4px;border-left:3px solid var(--soft);margin-left:14px;padding-left:16px}
.welcomebar{display:flex;align-items:center;gap:16px;margin:4px 0 22px}.welcomebar .sub{margin:0}
form.refresh{margin-left:auto;flex:none}form.refresh button{margin:0;padding:8px 16px;font-size:14px}
.bigemoji{flex:none;font-size:40px}
.removebox{margin-top:14px;padding-top:6px;border-top:2px dashed var(--line)}
.center{display:flex;align-items:flex-end;padding-bottom:4px}
.qrow.blank{background:transparent;opacity:.85}
.qrow textarea{min-height:64px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 16px}.stats div{background:var(--soft);border-radius:calc(var(--r) * .6);padding:10px 12px;text-align:center}
.stats b{display:block;font:600 20px var(--head)}.stats small{color:var(--muted);font-weight:600}
@media (max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}}
.crown{font-size:13px;padding:1px 8px;border-radius:999px;background:color-mix(in srgb,#f5c542 30%,var(--card));color:var(--text);font-weight:700}
.help.small{font-size:13px;margin:4px 0 0}
.bars{display:grid;grid-template-columns:repeat(14,1fr);gap:2px;height:130px;align-items:end;padding:6px 0 0;border-bottom:1px solid var(--line);margin-bottom:26px}
.bar{position:relative;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.bar span{display:block;width:70%;max-width:20px;min-height:2px;background:var(--brand);border-radius:4px 4px 0 0}
.bar:hover span{background:var(--pink)}
.bar small{position:absolute;bottom:-22px;font-size:11px;color:var(--muted);white-space:nowrap}
@media (max-width:640px){.bar:nth-child(even) small{display:none}}
.postbox{border-color:color-mix(in srgb,var(--pink) 50%,var(--line))}
@media (max-width:640px){.foldbody{padding:16px}.welcomebar .heart,.welcomebar .bot{display:none}.welcomebar{flex-wrap:wrap}form.refresh{margin-left:0}}
`;

const FONTS = {
  system: { name: 'Cozy (rounded, the default)', css: null },
  plain: { name: 'Plain', css: 'system-ui,-apple-system,"Segoe UI",sans-serif' },
  rounded: { name: 'Rounded', css: 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round",system-ui,sans-serif' },
  serif: { name: 'Serif', css: 'ui-serif,Georgia,"Times New Roman",serif' },
  mono: { name: 'Monospace', css: 'ui-monospace,"Cascadia Code",Consolas,monospace' },
  comic: { name: 'Playful', css: '"Comic Sans MS","Comic Neue","Chalkboard SE",cursive' },
};
const CORNERS = { soft: { name: 'Soft and round (default)', px: null }, round: { name: 'Extra squishy', px: 30 }, square: { name: 'Neat and square', px: 6 } };
const MODES = { auto: 'Match my device', light: 'Always light', dark: 'Always dark' };
const TEXT_SIZES = { normal: { name: 'Normal', zoom: null }, small: { name: 'Smaller', zoom: 0.9 }, large: { name: 'Bigger', zoom: 1.12 }, huge: { name: 'Biggest', zoom: 1.25 } };
const MOTIONS = { full: 'Animations on', less: 'Fewer animations' };
const WIDTHS = { normal: { name: 'Normal', px: null }, wide: { name: 'Wide', px: 1180 }, narrow: { name: 'Narrow', px: 720 } };

const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v ?? '') ? v.toLowerCase() : null);
/** Readable text colour (near-black or white) on top of a colour. */
function textOn(color) {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#16151c' : '#ffffff';
}
/** Mixes two colours: amount 0 = a, 1 = b. */
function mix(a, b, amount) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - amount) + ((pb >> shift) & 255) * amount);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Extra CSS from the dashboard theme the owner picked. */
function themeCss(theme = {}) {
  const parts = [];
  const accent = hex(theme.accent);
  const font = FONTS[theme.font]?.css;
  const radius = CORNERS[theme.corners]?.px;
  const rootVars = [];
  if (accent) rootVars.push(`--brand:${accent};--brand-text:${textOn(accent)}`);
  if (font) rootVars.push(`--head:${font};--body:${font}`);
  if (radius !== undefined && radius !== null) rootVars.push(`--r:${radius}px`);
  const bg = hex(theme.background);
  const card = hex(theme.card);
  if (bg || card) {
    const base = card ?? mix(bg, textOn(bg) === '#ffffff' ? '#ffffff' : '#000000', 0.06);
    const back = bg ?? mix(card, textOn(card) === '#ffffff' ? '#000000' : '#ffffff', 0.25);
    const text = textOn(base);
    const dark = text === '#ffffff';
    rootVars.push(`--bg:${back};--card:${base};--text:${text};--muted:${mix(text, base, 0.35)};--line:${mix(base, text, 0.16)};--field:${mix(base, dark ? '#000000' : '#ffffff', 0.25)}`);
  }
  if (rootVars.length) parts.push(`:root{${rootVars.join(';')}}`);
  const zoom = TEXT_SIZES[theme.textSize]?.zoom;
  if (zoom) parts.push(`body{zoom:${zoom}}`);
  if (theme.motion === 'less') parts.push('*,*::before,*::after{animation:none!important;transition:none!important}');
  const width = WIDTHS[theme.width]?.px;
  if (width) parts.push(`main{max-width:${width}px}`);
  return parts.join('\n');
}

/** Ready-made looks. Each has a light and a dark version (dark is used at night / in dark mode). */
// GitHub's code colours, for the Code page.
const SYNTAX = {
  light: ';--sy-kw:#cf222e;--sy-s:#0a3069;--sy-c:#6e7781;--sy-n:#0550ae;--sy-f:#8250df;--sy-t:#953800;--sy-r:#116329;--sy-k:#0550ae;--sy-code:#f6f8fa;--sy-text:#1f2328',
  dark: ';--sy-kw:#ff7b72;--sy-s:#a5d6ff;--sy-c:#8b949e;--sy-n:#79c0ff;--sy-f:#d2a8ff;--sy-t:#ffa657;--sy-r:#7ee787;--sy-k:#79c0ff;--sy-code:#0d1117;--sy-text:#e6edf3',
};

const PRESETS = {
  lavender: {
    name: 'Cozy lavender',
    light: '--bg:#f5effc;--card:#fffbfe;--text:#3d2b52;--muted:#85739a;--line:#eadcf3;--brand:#8b6cf6;--brand-text:#fff;--pink:#ff8fbf;--ok:#2f9e78;--warn:#c27a12;--bad:#e0507a;--field:#fff;color-scheme:light',
    dark: '--bg:#211a2c;--card:#2d2440;--text:#f3e9ff;--muted:#b8a6cc;--line:#43375a;--brand:#b39dff;--brand-text:#221a2e;--pink:#ff9ec8;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff7aa2;--field:#261f36;color-scheme:dark',
  },
  white: {
    name: 'Cozy white',
    light: '--bg:#f7f6f3;--card:#ffffff;--text:#2f2d2b;--muted:#736d67;--line:#e8e4df;--brand:#3e76bb;--brand-text:#fff;--pink:#f3a9bd;--ok:#2f9e78;--warn:#b46f10;--bad:#d24d6b;--field:#fff;color-scheme:light',
    dark: '--bg:#1c1b1a;--card:#262422;--text:#f1eeea;--muted:#aaa39b;--line:#3a3734;--brand:#9cc2ee;--brand-text:#1b1a19;--pink:#f5b3c5;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#211f1d;color-scheme:dark',
  },
  blue: {
    name: 'Soft blue',
    light: '--bg:#eef4fb;--card:#ffffff;--text:#24364b;--muted:#5a6e84;--line:#d6e3f1;--brand:#3e76bb;--brand-text:#fff;--pink:#7db4ee;--ok:#2f9e78;--warn:#b46f10;--bad:#d24d6b;--field:#fff;color-scheme:light',
    dark: '--bg:#16202d;--card:#1e2b3c;--text:#e6eef8;--muted:#a3b4c8;--line:#2f4258;--brand:#8db8ea;--brand-text:#13202e;--pink:#9cc8f5;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#1a2636;color-scheme:dark',
  },
  mint: {
    name: 'Fresh mint',
    light: '--bg:#eef8f3;--card:#ffffff;--text:#1f3a30;--muted:#5b7a6d;--line:#d3ebdf;--brand:#2f9e78;--brand-text:#fff;--pink:#ff9fb8;--ok:#2f9e78;--warn:#b46f10;--bad:#d24d6b;--field:#fff;color-scheme:light',
    dark: '--bg:#14211c;--card:#1b2c25;--text:#e4f4ec;--muted:#9fbfb1;--line:#2c4539;--brand:#6fdcb0;--brand-text:#10201a;--pink:#ffadc2;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#17261f;color-scheme:dark',
  },
  peach: {
    name: 'Warm peach',
    light: '--bg:#fdf3ee;--card:#fffaf7;--text:#4a2c22;--muted:#8d6a5d;--line:#f2ddd2;--brand:#e0703f;--brand-text:#fff;--pink:#ff8fa3;--ok:#2f9e78;--warn:#b46f10;--bad:#d24d6b;--field:#fff;color-scheme:light',
    dark: '--bg:#241915;--card:#30221c;--text:#fbe9e1;--muted:#c4a597;--line:#4a352c;--brand:#ffa47a;--brand-text:#2a1810;--pink:#ffa3b6;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#2a1d18;color-scheme:dark',
  },
  sakura: {
    name: 'Sakura pink',
    light: '--bg:#fdf0f5;--card:#fffafc;--text:#4d2338;--muted:#91667b;--line:#f4d9e5;--brand:#d4568f;--brand-text:#fff;--pink:#ff8fbf;--ok:#2f9e78;--warn:#b46f10;--bad:#d24d6b;--field:#fff;color-scheme:light',
    dark: '--bg:#24151d;--card:#311e28;--text:#fbe6f0;--muted:#c49cb0;--line:#4b2f3d;--brand:#ff9cc8;--brand-text:#2a1220;--pink:#ffb0d2;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#2a1922;color-scheme:dark',
  },
  forest: {
    name: 'Forest',
    light: '--bg:#f1f4ec;--card:#fbfcf8;--text:#28331f;--muted:#66745a;--line:#dde5d2;--brand:#4e7d36;--brand-text:#fff;--pink:#e8a0a0;--ok:#2f9e78;--warn:#b46f10;--bad:#c0504d;--field:#fff;color-scheme:light',
    dark: '--bg:#161c12;--card:#1f281a;--text:#e6eedd;--muted:#a3b293;--line:#33402a;--brand:#9fd17f;--brand-text:#162010;--pink:#f0b0b0;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8a8a;--field:#1a2216;color-scheme:dark',
  },
  sunset: {
    name: 'Sunset',
    light: '--bg:#fff5e8;--card:#fffbf5;--text:#3f2a1a;--muted:#86684f;--line:#f5e1c8;--brand:#d9573b;--brand-text:#fff;--pink:#f78fb3;--ok:#2f9e78;--warn:#b46f10;--bad:#c0394f;--field:#fff;color-scheme:light',
    dark: '--bg:#211628;--card:#2e1f36;--text:#fde8dc;--muted:#c7a6b4;--line:#46304f;--brand:#ff9466;--brand-text:#24120c;--pink:#ff9ec4;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#281b30;color-scheme:dark',
  },
  midnight: {
    name: 'Midnight',
    light: '--bg:#e9ebf5;--card:#f8f9fd;--text:#1d2140;--muted:#5d6386;--line:#d5d9ec;--brand:#4b56d2;--brand-text:#fff;--pink:#f08fc0;--ok:#2f9e78;--warn:#b46f10;--bad:#d24d6b;--field:#fff;color-scheme:light',
    dark: '--bg:#0c0e1a;--card:#151829;--text:#e5e8ff;--muted:#9097c2;--line:#262a45;--brand:#8b95ff;--brand-text:#0c0e1a;--pink:#ff9ed2;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff8aa5;--field:#10132a;color-scheme:dark',
  },
  contrast: {
    name: 'High contrast (easiest to read)',
    light: '--bg:#ffffff;--card:#ffffff;--text:#000000;--muted:#2b2b2b;--line:#000000;--brand:#0039b3;--brand-text:#fff;--pink:#b3005f;--ok:#006b3c;--warn:#7a4300;--bad:#b00020;--field:#fff;color-scheme:light',
    dark: '--bg:#000000;--card:#000000;--text:#ffffff;--muted:#e0e0e0;--line:#ffffff;--brand:#ffd400;--brand-text:#000;--pink:#ff7ad1;--ok:#3dff9e;--warn:#ffb000;--bad:#ff5c7a;--field:#000;color-scheme:dark',
  },
};

/** The colours for a forced light or dark mode (instead of following the device). */
const DARK_VARS = '--bg:#211a2c;--card:#2d2440;--text:#f3e9ff;--muted:#b8a6cc;--line:#43375a;--brand:#b39dff;--brand-text:#221a2e;--pink:#ff9ec8;--ok:#5fd6a8;--warn:#f2b552;--bad:#ff7aa2;--field:#261f36;color-scheme:dark';
const LIGHT_VARS = '--bg:#f5effc;--card:#fffbfe;--text:#3d2b52;--muted:#85739a;--line:#eadcf3;--brand:#8b6cf6;--brand-text:#fff;--pink:#ff8fbf;--ok:#2f9e78;--warn:#c27a12;--bad:#e0507a;--field:#fff;color-scheme:light';

/** Pixel Bot's logo: a little pixel-art robot. Fixed colours so it looks the same everywhere. */
const BOT_GRID = [
  '.......PP.......',
  '.......PP.......',
  '.......OO.......',
  '..OOOOOOOOOOOO..',
  '.OLLBBBBBBBBBBO.',
  '.OLSSSSSSSSSSBO.',
  'OOBSWESSSSWESBOO',
  'OOBSEESSSSEESBOO',
  '.OBSSSSSSSSSSBO.',
  '.OBSSESSSSESSBO.',
  '.OBSSSEEEESSSBO.',
  '.OBSSSSSSSSSSBO.',
  '.OBPPBBBBBBPPBO.',
  '..OOOOOOOOOOOO..',
  '.....OBBBBO.....',
  '....OOOOOOOO....',
];
const BOT_COLORS = { O: '#24364b', B: '#7db4ee', L: '#c9e2fb', S: '#1d2b3d', E: '#7ff0ff', P: '#ff8fbf', W: '#ffffff' };
let botRects = null;
function botBody() {
  if (botRects) return botRects;
  const out = [];
  BOT_GRID.forEach((row, y) => {
    let x = 0;
    while (x < row.length) { // join runs of the same colour into one rectangle
      const c = row[x];
      let w = 1;
      while (row[x + w] === c) w++;
      if (BOT_COLORS[c]) out.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${BOT_COLORS[c]}"/>`);
      x += w;
    }
  });
  return (botRects = out.join(''));
}
function pixelBot(size = 30, extraClass = '') {
  return `<svg class="bot ${extraClass}" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${botBody()}</svg>`;
}
const botIcon = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${botBody()}</svg>`;

/** Pixel Bot's little pixel-art heart. */
function pixelHeart(size = 28, extraClass = '') {
  const rows = ['.##...##.', '#xx#.#xx#', '#xsx#xxx#', '#xxxxxxx#', '.#xxxxx#.', '..#xxx#..', '...#x#...', '....#....'];
  const rects = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    const cls = c === '#' ? 'edge' : c === 's' ? 'shine' : 'fill';
    rects.push(`<rect class="${cls}" x="${x}" y="${y}" width="1" height="1"/>`);
  }));
  return `<svg class="heart ${extraClass}" width="${size}" height="${Math.round((size * 8) / 9)}" viewBox="0 0 9 8" aria-hidden="true">${rects.join('')}</svg>`;
}

function currentTheme() {
  try {
    return require('../lib/appearance').settings().theme ?? {};
  } catch {
    return {};
  }
}

// Line icons for the menu (drawn with the text colour, so they suit every theme).
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7"/><path d="m16 7 2.5 2.5"/><path d="m18.5 4.5 2 2"/>',
  game: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M7 10v4"/><path d="M5 12h4"/><circle cx="15.5" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  paint: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.2-1.6-.4-1-.1-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="8" r="1.2"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.1-2.5 3.6"/><path d="M12 17.2v.3"/>',
  out: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** The ☰ menu: who you are, then each place you can go with a short caption. */
function menu(user) {
  const item = (href, ic, label, caption, extra = '') => `<a class="mi${extra}" href="${href}"><span class="mic">${icon(ic)}</span><span><b>${label}</b><small>${caption}</small></span></a>`;
  const items = [
    item('/?all=1', 'home', 'Servers', 'Pick a server and change its settings'),
    item('/arcade', 'game', 'Arcade', '30 games to play with friends or Pixel Bot'),
    item('/invite', 'plus', 'Add to a server', 'Invite Pixel Bot to any server you manage'),
    item('/me/look', 'paint', 'Appearance', 'Your colours, text size and animations'),
    item('/install', 'plus', 'Get the app', 'Install Pixel Bot on this device'),
    item('/account', 'key', 'Login and devices', 'Backup links, log out everywhere'),
    item('/status', 'pulse', 'Bot status', 'Is Pixel Bot online? Ping and uptime'),
    item('/help', 'help', 'Help', 'How everything works, step by step'),
    user.isOwner ? item('/source', 'code', 'Code', 'Read and search Pixel Bot\'s code') : '',
    '<div class="msep"></div>',
    item('/logout', 'out', 'Log out', 'Sign out on this device', ' danger'),
  ].join('');
  return `<details class="menu"><summary aria-label="Open menu"><span class="who">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : `<span class="noav">${esc((user.username || '?')[0].toUpperCase())}</span>`}<span class="whoname">${esc(user.username)}</span></span><span class="burger" aria-hidden="true"><i></i><i></i><i></i></span></summary>
<nav class="mpanel"><div class="mhead">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : `<span class="noav">${esc((user.username || '?')[0].toUpperCase())}</span>`}<span><b>${esc(user.username)}</b><small>${user.isOwner ? '<span class="crown">👑 Owner</span>' : 'Signed in with Discord'}</small></span></div>${items}</nav></details>`;
}

function page({ title, user, body, head = '' }) {
  const base = currentTheme();
  let mine = {};
  try { mine = user?.id ? require('../lib/userprefs').get(user.id) : {}; } catch {}
  // Your own picks win; a preset you pick also replaces the owner's custom colours.
  const theme = mine.preset ? { ...base, background: null, card: null, accent: null, ...mine } : { ...base, ...mine };
  const preset = PRESETS[theme.preset] ?? PRESETS.lavender;
  const light = preset.light + SYNTAX.light;
  const dark = preset.dark + SYNTAX.dark;
  const mode = theme.mode === 'dark'
    ? `:root{${dark}}`
    : theme.mode === 'light'
      ? `:root{${light}}@media (prefers-color-scheme:dark){:root{${light}}}`
      : `:root{${light}}@media (prefers-color-scheme:dark){:root{${dark}}}`;
  const name = theme.title || 'Pixel Bot dashboard';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(name)}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(botIcon())}">
<meta name="theme-color" content="#8b6cf6">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Pixel Bot">
<script src="/app.js" defer></script>${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;600;700&display=swap">
<style>${CSS}${mode}${themeCss(theme)}</style></head><body>
<header><a class="brand" href="/">${pixelBot(32)}<b>${esc(name)}</b></a><span class="hdr"><a class="installbtn" href="/install" data-install hidden>⬇️ Install app</a>${user ? menu(user) : ''}</span></header>
<main>${body}</main></body></html>`;
}

const select = (name, options, selected, { blank = '— none —' } = {}) =>
  `<select name="${esc(name)}">${blank !== null ? `<option value="">${esc(blank)}</option>` : ''}${options
    .map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(selected ?? '') ? ' selected' : ''}>${esc(o.name)}</option>`)
    .join('')}</select>`;

const checks = (name, options, selectedIds) => {
  const chosen = new Set((selectedIds ?? []).map(String));
  return `<div class="checks">${options
    .map((o) => `<label class="chip"><input type="checkbox" name="${esc(name)}" value="${esc(o.id)}"${chosen.has(String(o.id)) ? ' checked' : ''}><span>${esc(o.name)}</span></label>`)
    .join('') || '<span class="muted">Nothing to pick yet</span>'}</div>`;
};

// No length limits on boxes. `hard` is only for the few things Discord itself
// refuses when they're too long (like a slash command's name).
const input = (name, value, { hard, placeholder = '' } = {}) =>
  `<input type="text" name="${esc(name)}"${hard ? ` maxlength="${hard}"` : ''} value="${esc(value)}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>`;

const textarea = (name, value, { hard, placeholder = '' } = {}) =>
  `<textarea name="${esc(name)}"${hard ? ` maxlength="${hard}"` : ''}${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>${esc(value)}</textarea>`;

/** A colour picker with a "use the default" tick box (a picker can't be left empty). */
const colorInput = (name, value, { fallback = '#7c5cff', defaultText = 'Default' } = {}) =>
  `<span class="colorpick"><input type="color" name="${esc(name)}" value="${esc(hex(value) ?? fallback)}"><label class="toggle"><input type="checkbox" name="${esc(name)}_default" value="1"${hex(value) ? '' : ' checked'}> ${esc(defaultText)}</label></span>`;

const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

const toggle = (name, on, text) => `<label class="toggle"><input type="checkbox" name="${esc(name)}" value="1"${on ? ' checked' : ''}> ${esc(text)}</label>`;

module.exports = { TEXT_SIZES, MOTIONS, WIDTHS, PRESETS, pixelHeart, pixelBot, botIcon, BOT_GRID, BOT_COLORS, esc, page, select, checks, toggle, input, textarea, hidden, colorInput, themeCss, textOn, mix, FONTS, CORNERS, MODES };
